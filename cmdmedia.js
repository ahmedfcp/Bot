// ربط وسائط بالأوامر: صورة (ملف) / جيف و دائري (من الأرشيف gif_archive و ptv_archive)
// المسارات تُحسب وقت الاستخدام (بعد chdir) وليس وقت الاستيراد
import fs from "fs";
import path from "path";
import * as Archive from "./archive.js";

export const KINDS = {
  image: { ext: "jpg", label: "صورة", icon: "🖼" },
  gif: { ext: "mp4", label: "جيف", icon: "🎞" },
  ptv: { ext: "mp4", label: "دائري", icon: "⭕" },
};
const isArch = (kind) => kind === "gif" || kind === "ptv";

const baseDir = () => path.join(process.cwd(), "bluesky", "cmd-media");
const indexFile = () => path.join(baseDir(), "index.json");

let migrated = false;
function load() {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(indexFile(), "utf8")); } catch {}
  if (!migrated) { // نقل الملفات القديمة (cmd-media/gif|ptv) إلى الأرشيف مرة وحدة
    migrated = true;
    let changed = false;
    for (const kind of ["gif", "ptv"]) {
      for (const [cmd, val] of Object.entries(d[kind] || {})) {
        if (!String(val).endsWith(".mp4")) continue;
        const p = path.join(baseDir(), kind, val);
        if (fs.existsSync(p)) { d[kind][cmd] = Archive.put(kind, fs.readFileSync(p)); try { fs.unlinkSync(p); } catch {} }
        else delete d[kind][cmd];
        changed = true;
      }
    }
    if (changed) save(d);
  }
  return d;
}
function save(d) {
  fs.mkdirSync(baseDir(), { recursive: true });
  fs.writeFileSync(indexFile(), JSON.stringify(d, null, 2));
}
const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, "_");

// الاسم الأساسي للأمر (أول اسم في command) عشان الربط يشتغل مع كل الأسماء البديلة
export function canonicalOf(handler, typed) {
  const c = handler?.command;
  const first = Array.isArray(c) ? c[0] : c;
  return String(first || typed || "").toLowerCase().trim();
}

// ── الربط ──
export function linkId(kind, cmd, id) {
  const d = load();
  (d[kind] ||= {})[cmd] = String(id);
  save(d);
}

// image: يحفظ الملف | gif/ptv: يحفظ في الأرشيف ثم يربط (يرجع رقم الأرشيف)
export function link(kind, cmd, buffer) {
  if (isArch(kind)) { const id = Archive.put(kind, buffer); linkId(kind, cmd, id); return id; }
  const dir = path.join(baseDir(), kind);
  fs.mkdirSync(dir, { recursive: true });
  const d = load();
  const old = d[kind]?.[cmd];
  const file = `${safe(cmd)}.${KINDS[kind].ext}`;
  if (old && old !== file) { try { fs.unlinkSync(path.join(dir, old)); } catch {} }
  fs.writeFileSync(path.join(dir, file), buffer);
  (d[kind] ||= {})[cmd] = file;
  save(d);
  return file;
}

// فك الربط (الجيف والدائري يبقون في الأرشيف)
export function unlink(kind, cmd) {
  const d = load();
  const val = d[kind]?.[cmd];
  if (!val) return false;
  if (!isArch(kind)) { try { fs.unlinkSync(path.join(baseDir(), kind, val)); } catch {} }
  delete d[kind][cmd];
  save(d);
  return true;
}

export const linksFor = (kind, id) => Object.entries(load()[kind] || {}).filter(([, v]) => v === String(id)).map(([c]) => c);
export function unlinkAllFor(kind, id) {
  const d = load();
  for (const [c, v] of Object.entries(d[kind] || {})) if (v === String(id)) delete d[kind][c];
  save(d);
}

// رقم الأرشيف المربوط (gif/ptv) أو null
export function getRef(kind, cmd) {
  const id = load()[kind]?.[cmd];
  return id && Archive.exists(kind, id) ? id : null;
}
export function getPath(kind, cmd) {
  if (isArch(kind)) { const id = getRef(kind, cmd); return id ? Archive.filePath(kind, id) : null; }
  const file = load()[kind]?.[cmd];
  if (!file) return null;
  const p = path.join(baseDir(), kind, file);
  return fs.existsSync(p) ? p : null;
}
export const has = (kind, cmd) => !!getPath(kind, cmd);
export const list = (kind) => load()[kind] || {};

// يلقط الوسائط المناسبة من الرسالة نفسها أو من الرسالة المقتبسة
export function pickMedia(msg, kind) {
  const unwrap = (m) => m?.viewOnceMessageV2?.message || m?.viewOnceMessage?.message || m?.ephemeralMessage?.message || m;
  const cands = [unwrap(msg?.message), unwrap(msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage)];
  for (const m of cands) {
    if (!m) continue;
    if (kind === "image" && m.imageMessage) return { content: m.imageMessage, type: "image" };
    if (kind === "gif" && m.videoMessage) return { content: m.videoMessage, type: "video" };
    if (kind === "ptv" && (m.ptvMessage || m.videoMessage)) return { content: m.ptvMessage || m.videoMessage, type: "video" };
  }
  return null;
}

export async function download(found) {
  const { downloadContentFromMessage } = await import("@whiskeysockets/baileys");
  const stream = await downloadContentFromMessage(found.content, found.type);
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  const buf = Buffer.concat(chunks);
  if (!buf.length) throw new Error("الملف فارغ");
  return buf;
}

// ============================================================
// غلاف sock للأمر: أول رد نصي يتحول لجيف/صورة مع كابشن (الجيف سريع من الكاش)،
// والدائري يُرسل بعد رسالة الأمر منفصلاً. يدعم البلوجنات اللي تعدّل sock.sendMessage بنفسها.
// ============================================================
const INNER = Symbol("bs-inner");

export function wrap(sock, handler, command) {
  const key = canonicalOf(handler, command);
  const gifId = getRef("gif", key), imgPath = getPath("image", key), ptvId = getRef("ptv", key);
  if (!gifId && !imgPath && !ptvId) return sock;

  const base = sock.sendMessage.bind(sock);
  let inner = null, ptvDone = false, capDone = false;
  const go = (jid, c, o) => (inner || base)(jid, c, { ...(o || {}), [INNER]: true });

  const send = async (jid, content, opts) => {
    if (opts && opts[INNER]) return base(jid, content, opts); // نداء من داخل override البلوجن
    if (!content || content.react || content.delete || content.edit || opts?.edit || content.poll) return go(jid, content, opts);

    const sendPtv = !!ptvId && !ptvDone;
    if (sendPtv) ptvDone = true;

    let c = content, res;
    const isText = typeof c.text === "string" && !c.image && !c.video && !c.sticker && !c.audio && !c.document;
    if (isText && !capDone && (gifId || imgPath)) {
      capDone = true;
      try {
        if (gifId) {
          if (c.text.length > 1000) { // نص طويل: الجيف أولاً ثم النص
            await Archive.send(sock, jid, "gif", gifId, { quoted: opts?.quoted });
          } else {
            res = await Archive.send(sock, jid, "gif", gifId, { caption: c.text, mentions: c.mentions, quoted: opts?.quoted });
          }
        } else if (c.text.length > 1000) {
          await go(jid, { image: fs.readFileSync(imgPath) }, opts);
        } else {
          c = { image: fs.readFileSync(imgPath), caption: c.text, mentions: c.mentions };
        }
      } catch (e) { console.error("⚠️ فشل دمج الوسائط:", e.message); res = undefined; }
    }
    if (res === undefined) res = await go(jid, c, opts);

    if (sendPtv) { // الدائري بعد رسالة الأمر، منفصل (بدون اقتباس)
      try { await Archive.send(sock, jid, "ptv", ptvId); }
      catch (e) { console.error("⚠️ فشل إرسال الدائري:", e.message); }
    }
    return res;
  };

  return new Proxy(sock, {
    get(t, p) { return p === "sendMessage" ? send : Reflect.get(t, p); },
    set(t, p, v) { if (p === "sendMessage") { inner = v; return true; } t[p] = v; return true; },
  });
}
