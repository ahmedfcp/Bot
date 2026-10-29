// مصنع أوامر الوسائط: صورة (اضف/حذف/قائمة) + جيف/دائري (صنع/حفظ/اضف/فك/حذف/قائمة)
import * as M from "./cmdmedia.js";
import * as Archive from "./archive.js";
import { getPlugins } from "./plugins.js";

const NAMES = {
  image: { add: "اضف_صورة", del: "حذف_صورة", list: "الصور_المرتبطة", how: "رد على صورة" },
  gif: { make: "جيف", save: "حفظ_جيف", add: "اضف_جيف", unbind: "فك_جيف", del: "حذف_جيف", list: "الجيفات_المحفوظة", how: "رد على جيف أو فيديو", plural: "الجيفات" },
  ptv: { make: "دائري", save: "حفظ_دائري", add: "اضف_دائري", unbind: "فك_دائري", del: "حذف_دائري", list: "الدوائر_المحفوظة", how: "رد على فيديو (عادي أو دائري)", plural: "الدوائر" },
};
const FLAGS = { elite: "off", owner: true, group: false, prv: false, lock: "off" };

const resolve = (name) => {
  const typed = String(name || "").trim().toLowerCase();
  const h = getPlugins()[typed];
  return h ? M.canonicalOf(h, typed) : null;
};
const reactTo = (sock, msg, text) => sock.sendMessage(msg.key.remoteJid, { react: { text, key: msg.key } }).catch(() => {});
const mk = (sock, msg) => (text) => sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
const kb = (n) => Math.max(1, Math.round(n / 1024)) + "KB";

// ─── الصور ───
export function makeAdd(kind) {
  const n = NAMES[kind], k = M.KINDS[kind];
  return {
    BlueSky: { command: [n.add], description: `ربط ${k.label} بأمر: ${n.how} واكتب ${n.add} <اسم الأمر>`, ...FLAGS },
    async execute({ sock, msg, args }) {
      const send = mk(sock, msg);
      if (!args[0]) return send(`📌 ${n.how} واكتب:\n${n.add} <اسم الأمر>`);
      const key = resolve(args[0]);
      if (!key) return send(`❌ ما في أمر باسم "${args[0]}".`);
      const found = M.pickMedia(msg, kind);
      if (!found) return send(`❌ لازم ${n.how}.`);
      try { M.link(kind, key, await M.download(found)); await send(`✅ تم ربط ${k.label} بالأمر: ${key}`); }
      catch (e) { await send("❌ فشل الربط: " + e.message); }
    },
  };
}
export function makeDel(kind) {
  const n = NAMES[kind], k = M.KINDS[kind];
  return {
    BlueSky: { command: [n.del], description: `فك ربط ${k.label} عن أمر`, ...FLAGS },
    async execute({ sock, msg, args }) {
      const send = mk(sock, msg);
      if (!args[0]) return send(`📌 ${n.del} <اسم الأمر>`);
      const ok = M.unlink(kind, resolve(args[0]) || String(args[0]).toLowerCase());
      await send(ok ? `✅ تم فك ربط ${k.label} عن ${args[0]}` : `❌ ما في ${k.label} مربوط بهذا الأمر.`);
    },
  };
}
export function makeList(kind) {
  const n = NAMES[kind], k = M.KINDS[kind];
  return {
    BlueSky: { command: [n.list], description: `عرض الأوامر المربوطة بـ${k.label}`, ...FLAGS },
    async execute({ sock, msg }) {
      const cmds = Object.keys(M.list(kind));
      await mk(sock, msg)(cmds.length ? `${k.icon} *أوامر مربوطة (${cmds.length})*\n\n${cmds.map((c) => "• " + c).join("\n")}` : `📭 ما في أوامر مربوطة.`);
    },
  };
}

// ─── الجيف والدائري (أرشيف) ───
// صنع: يحول الفيديو المردود عليه إلى جيف/دائري ويرسله
export function makeMake(kind) {
  const n = NAMES[kind], k = M.KINDS[kind];
  return {
    BlueSky: { command: [n.make], description: `صنع ${k.label} من فيديو (${n.how})`, ...FLAGS },
    async execute({ sock, msg }) {
      const send = mk(sock, msg), chat = msg.key.remoteJid;
      const found = M.pickMedia(msg, "ptv"); // أي فيديو
      if (!found) return send(`📌 ${n.how} واكتب ${n.make}`);
      await reactTo(sock, msg, "⏳");
      try {
        const buf = await M.download(found);
        await sock.sendMessage(chat, kind === "ptv" ? { video: buf, ptv: true } : { video: buf, gifPlayback: true }, { quoted: msg });
        await reactTo(sock, msg, "✅");
      } catch (e) { await reactTo(sock, msg, "❌"); await send(`❌ فشل التحويل: ${e.message}`); }
    },
  };
}
// منع تنفيذ حفظ الدائري مرتين لنفس الرسالة (وصول الرسالة مرتين من واتساب، أو تنفيذها من البوت الأساسي والفرعي معًا)
const _savedOnce = new Map();
function firstTimeSave(msg) {
  const id = msg?.key?.id;
  if (!id) return true;
  const k = `${msg.key.remoteJid}|${id}`;
  const now = Date.now();
  for (const [key, ts] of _savedOnce) if (now - ts > 120_000) _savedOnce.delete(key);
  if (_savedOnce.has(k)) return false;
  _savedOnce.set(k, now);
  return true;
}
// حفظ: يخزّن في الأرشيف ويجهّز الكاش (إرسال سريع)
export function makeSave(kind) {
  const n = NAMES[kind], k = M.KINDS[kind];
  return {
    BlueSky: { command: [n.save], description: `حفظ ${k.label} في الأرشيف (${n.how})`, ...FLAGS },
    async execute({ sock, msg }) {
      const send = mk(sock, msg), chat = msg.key.remoteJid;
      const found = M.pickMedia(msg, kind);
      if (!found) return send(`📌 ${n.how} واكتب ${n.save}`);
      if (kind === "ptv" && !firstTimeSave(msg)) return; // نفس الرسالة اتنفذت قبل كده: لا حفظ ولا إرسال ثاني
      await reactTo(sock, msg, "⏳");
      try {
        const id = Archive.put(kind, await M.download(found));
        await Archive.send(sock, chat, kind, id, { quoted: msg }); // معاينة + تجهيز الكاش
        await reactTo(sock, msg, "✅");
        await send(`✅ تم حفظ ${k.label} برقم *${id}* ⚡\n\nلربطه بأمر:\n${n.add} ${id} <اسم الأمر>`);
      } catch (e) { await reactTo(sock, msg, "❌"); await send(`❌ فشل الحفظ: ${e.message}`); }
    },
  };
}
// اضف: يستخرج من الأرشيف ويربطه بأمر (أو يحفظ ويربط لو فيه ميديا بالرد)
export function makeAddArchive(kind) {
  const n = NAMES[kind], k = M.KINDS[kind];
  return {
    BlueSky: { command: [n.add], description: `ربط ${k.label} من الأرشيف بأمر: ${n.add} <رقم> <اسم الأمر>`, ...FLAGS },
    async execute({ sock, msg, args }) {
      const send = mk(sock, msg);
      const found = M.pickMedia(msg, kind);
      let id, cmd;
      if (args.length >= 2) { id = String(args[0]); cmd = args[1]; }
      else if (args.length === 1 && found) cmd = args[0];
      else return send(`📌 ${n.add} <رقم> <اسم الأمر>\nأو ${n.how} واكتب: ${n.add} <اسم الأمر>\n\nالأرقام: ${n.list}`);
      const key = resolve(cmd);
      if (!key) return send(`❌ ما في أمر باسم "${cmd}".`);
      try {
        if (id === undefined) {
          id = Archive.put(kind, await M.download(found));
          await Archive.send(sock, msg.key.remoteJid, kind, id, { quoted: msg }); // تجهيز الكاش
        }
        if (!Archive.exists(kind, id)) return send(`❌ ما في ${k.label} برقم ${id} في الأرشيف.\n${n.list}`);
        M.linkId(kind, key, id);
        await send(`✅ تم ربط ${k.label} رقم ${id} بالأمر: ${key} ⚡`);
      } catch (e) { await send("❌ فشل الربط: " + e.message); }
    },
  };
}
// فك: يفك الربط فقط (يبقى في الأرشيف)
export function makeUnbind(kind) {
  const n = NAMES[kind], k = M.KINDS[kind];
  return {
    BlueSky: { command: [n.unbind], description: `فك ربط ${k.label} عن أمر (يبقى في الأرشيف)`, ...FLAGS },
    async execute({ sock, msg, args }) {
      const send = mk(sock, msg);
      if (!args[0]) return send(`📌 ${n.unbind} <اسم الأمر>`);
      const ok = M.unlink(kind, resolve(args[0]) || String(args[0]).toLowerCase());
      await send(ok ? `✅ تم فك ${k.label} عن ${args[0]} (باقي في الأرشيف).` : `❌ ما في ${k.label} مربوط بهذا الأمر.`);
    },
  };
}
// حذف: يمسحه من الأرشيف نهائياً ويفك كل الأوامر المربوطة به
export function makeDeleteArchive(kind) {
  const n = NAMES[kind], k = M.KINDS[kind];
  return {
    BlueSky: { command: [n.del], description: `حذف ${k.label} من الأرشيف نهائياً: ${n.del} <رقم>`, ...FLAGS },
    async execute({ sock, msg, args }) {
      const send = mk(sock, msg), id = String(args[0] || "");
      if (!id) return send(`📌 ${n.del} <رقم>\nالأرقام: ${n.list}`);
      if (!Archive.exists(kind, id)) return send(`❌ ما في ${k.label} برقم ${id}.`);
      const cmds = M.linksFor(kind, id);
      M.unlinkAllFor(kind, id);
      Archive.remove(kind, id);
      await send(`🗑 تم حذف ${k.label} رقم ${id} من الأرشيف.${cmds.length ? `\nوانفك عن: ${cmds.join("، ")}` : ""}`);
    },
  };
}
export function makeListArchive(kind) {
  const n = NAMES[kind], k = M.KINDS[kind];
  return {
    BlueSky: { command: [n.list], description: `عرض ${n.plural} المحفوظة في الأرشيف وروابطها`, ...FLAGS },
    async execute({ sock, msg }) {
      const items = Archive.list(kind);
      if (!items.length) return mk(sock, msg)(`📭 أرشيف ${k.label} فارغ.\n${n.save}`);
      const rows = items.slice(0, 60).map((x) => {
        const cmds = M.linksFor(kind, x.id);
        return `${x.id}. ${x.cached ? "⚡" : "🐢"} ${kb(x.bytes)}${cmds.length ? ` — ${cmds.join("، ")}` : ""}`;
      });
      await mk(sock, msg)(`${k.icon} *${n.plural} المحفوظة (${items.length})*\n⚡ سريع  🐢 أول إرسال أبطأ\n\n${rows.join("\n")}\n\n${n.add} <رقم> <أمر>\n${n.unbind} <أمر>\n${n.del} <رقم>`);
    },
  };
}
