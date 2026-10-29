// نقاط الفوز في الألعاب ← تضاف لحساب البنك
// المسارات تُحسب وقت الاستخدام (بعد chdir)
import fs from "fs";
import path from "path";
import { isRegistered, updateBalance, isBankEnabled, resolveToPn } from "../bluesky/bank.js";

export const DEFAULT_POINTS = 500;
export const LINKED_GAMES = ["اربعة", "اكس", "سباق", "الطرد", "تجميع", "تفكيك", "قنبلة", "علم", "احزر", "عين", "زعيم", "مافيا"];

const file = () => path.join(process.cwd(), "bluesky", "rewards.json");
function load() { try { return JSON.parse(fs.readFileSync(file(), "utf8")); } catch { return {}; } }
function save(d) { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(d, null, 2)); }

export function getPoints(game) {
  const d = load();
  if (Number.isFinite(d.games?.[game])) return d.games[game];
  return Number.isFinite(d.all) ? d.all : DEFAULT_POINTS;
}
export function setPoints(game, n) { const d = load(); (d.games ||= {})[game] = n; save(d); }
export function clearPoints(game) { const d = load(); if (d.games) delete d.games[game]; save(d); }
// تغيير نقاط كل الألعاب مرة وحدة (يلغي التخصيصات)
export function setAllPoints(n) { const d = load(); d.all = n; d.games = {}; save(d); }
// إرجاع كل الألعاب للنقاط الافتراضية
export function resetAll() { save({}); }
export function summary() {
  const d = load();
  return { all: Number.isFinite(d.all) ? d.all : DEFAULT_POINTS, games: d.games || {} };
}

const last = new Map();   // منع الازدواج: نفس اللاعب/اللعبة خلال 15 ثانية
const hinted = new Set(); // تلميح التسجيل مرة وحدة

async function pay(sock, chatId, jid, game) {
  if (!jid || jid === "BOT" || String(jid).startsWith("BOT")) return null;
  try { if (typeof isBankEnabled === "function" && !isBankEnabled()) return null; } catch {}
  const pts = getPoints(game);
  if (pts <= 0) return null;
  let id = jid;
  try { id = (await resolveToPn(sock, chatId, jid)) || jid; } catch {}
  const k = `${id}|${game}`;
  if (Date.now() - (last.get(k) || 0) < 15000) return null;
  last.set(k, Date.now());
  if (!isRegistered(id) && !isRegistered(jid)) return { jid, pts: 0, unregistered: true };
  updateBalance(isRegistered(id) ? id : jid, { cash: pts });
  return { jid, pts };
}

// فوز لاعب واحد
export async function award(sock, chatId, jid, game) {
  try {
    const r = await pay(sock, chatId, jid, game);
    if (!r) return 0;
    setTimeout(() => {
      const num = String(r.jid).split("@")[0];
      const text = r.pts
        ? `🏦 @${num} +${r.pts} نقطة أضيفت لحسابك البنكي 🎉`
        : (hinted.has(r.jid) ? null : `💡 @${num} سجّل في البنك بأمر *سجلني* عشان تستلم نقاط الفوز.`);
      if (!text) return;
      hinted.add(r.jid);
      sock.sendMessage(chatId, { text, mentions: [r.jid] }).catch(() => {});
    }, 900);
    return r.pts;
  } catch (e) { console.error("[rewards]", e.message); return 0; }
}

// فوز فريق (مثل المافيا)
export async function awardMany(sock, chatId, jids, game) {
  try {
    const paid = [];
    for (const j of jids) { const r = await pay(sock, chatId, j, game); if (r?.pts) paid.push(r); }
    if (!paid.length) return 0;
    setTimeout(() => {
      sock.sendMessage(chatId, {
        text: `🏦 *نقاط الفوز (${paid[0].pts} لكل لاعب):*\n${paid.map((r) => "• @" + String(r.jid).split("@")[0]).join("\n")}`,
        mentions: paid.map((r) => r.jid)
      }).catch(() => {});
    }, 900);
    return paid.length;
  } catch (e) { console.error("[rewards]", e.message); return 0; }
}
