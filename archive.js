// أرشيف الجيف والدائري (gif_archive / ptv_archive) + إرسال سريع بدون إعادة رفع
// كل عنصر: ملف mp4 + ملف كاش .json (بيانات الميديا المرفوعة) → relayMessage مباشرة
import fs from "fs";
import path from "path";

const CFG = {
  gif: { dir: "gif_archive", prefix: "gif_", key: "videoMessage", label: "جيف" },
  ptv: { dir: "ptv_archive", prefix: "ptv_", key: "ptvMessage", label: "دائري" },
};
const CACHE_DAYS = 14; // بعدها نعيد الرفع ونجدد الكاش

const dir = (kind) => { const d = path.join(process.cwd(), CFG[kind].dir); fs.mkdirSync(d, { recursive: true }); return d; };
export const filePath = (kind, id) => path.join(dir(kind), `${CFG[kind].prefix}${id}.mp4`);
const cachePath = (kind, id) => filePath(kind, id) + ".json";
export const exists = (kind, id) => fs.existsSync(filePath(kind, String(id)));

export function list(kind) {
  const c = CFG[kind];
  let files = [];
  try { files = fs.readdirSync(dir(kind)).filter((f) => f.startsWith(c.prefix) && f.endsWith(".mp4")); } catch {}
  return files
    .map((f) => {
      const id = f.slice(c.prefix.length, -4);
      const st = fs.statSync(path.join(dir(kind), f));
      return { id, bytes: st.size, cached: fs.existsSync(path.join(dir(kind), f + ".json")) };
    })
    .sort((a, b) => (Number(a.id) || 1e15) - (Number(b.id) || 1e15) || a.id.localeCompare(b.id));
}

function nextId(kind) {
  const nums = list(kind).map((x) => (/^\d{1,6}$/.test(x.id) ? Number(x.id) : 0));
  return String(Math.max(0, ...nums) + 1);
}

export function put(kind, buffer) {
  const id = nextId(kind);
  fs.writeFileSync(filePath(kind, id), buffer);
  return id;
}

export function remove(kind, id) {
  let ok = false;
  for (const p of [filePath(kind, id), cachePath(kind, id)]) { try { fs.unlinkSync(p); ok = true; } catch {} }
  return ok;
}

function saveCache(kind, id, message) {
  const copy = JSON.parse(JSON.stringify(message));
  delete copy.contextInfo; delete copy.caption;
  fs.writeFileSync(cachePath(kind, id), JSON.stringify(copy, null, 2));
}

// يرسل عنصراً من الأرشيف: كاش سريع إن وُجد، وإلا رفع عادي ثم تجهيز الكاش
export async function send(sock, jid, kind, id, { caption, mentions, quoted } = {}) {
  const c = CFG[kind];
  const cache = cachePath(kind, id);
  let fresh = false;
  try { fresh = fs.existsSync(cache) && Date.now() - fs.statSync(cache).mtimeMs < CACHE_DAYS * 864e5; } catch {}

  if (fresh) {
    try {
      const { generateWAMessageFromContent } = await import("@whiskeysockets/baileys");
      const m = JSON.parse(fs.readFileSync(cache, "utf8"));
      if (kind === "gif") { m.gifPlayback = true; if (caption) m.caption = caption; else delete m.caption; }
      const ci = {};
      if (quoted?.key) Object.assign(ci, { stanzaId: quoted.key.id, participant: quoted.key.participant || quoted.key.remoteJid, quotedMessage: quoted.message });
      if (mentions?.length) ci.mentionedJid = mentions;
      if (Object.keys(ci).length) m.contextInfo = ci; else delete m.contextInfo;
      const wam = generateWAMessageFromContent(jid, { [c.key]: m }, { userJid: sock.user?.id });
      await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });
      return wam;
    } catch (e) { console.error("⚠️ فشل الإرسال السريع، سيتم الرفع من جديد:", e.message); }
  }

  const file = filePath(kind, id);
  if (!fs.existsSync(file)) throw new Error("الملف غير موجود في الأرشيف");
  const buf = fs.readFileSync(file);
  const content = kind === "gif"
    ? { video: buf, gifPlayback: true, ...(caption ? { caption } : {}), ...(mentions?.length ? { mentions } : {}) }
    : { video: buf, ptv: true };
  const res = await sock.sendMessage(jid, content, quoted ? { quoted } : {});
  const sent = res?.message?.[c.key] || res?.message?.videoMessage || res?.message?.ptvMessage;
  if (sent) { try { saveCache(kind, id, sent); } catch {} }
  return res;
}
