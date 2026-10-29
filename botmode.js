// وضع البوت: عام / نخبة / مالك / خاص / مجموعات
// المسار يُحسب وقت الاستخدام (بعد chdir)
import fs from "fs";
import path from "path";

export const MODES = {
  "عام": "الكل يستخدم البوت (خاص ومجموعات)",
  "نخبة": "النخبة والمالك فقط",
  "مالك": "المالك فقط",
  "خاص": "يعمل في المحادثات الخاصة فقط",
  "مجموعات": "يعمل في المجموعات فقط",
};

const file = () => path.join(process.cwd(), "bluesky", "botmode.json");
let cache = { at: 0, mode: "عام" };

export function getBotMode() {
  if (Date.now() - cache.at < 2000) return cache.mode;
  let mode = "عام";
  try { const m = JSON.parse(fs.readFileSync(file(), "utf8")).mode; if (MODES[m]) mode = m; } catch {}
  cache = { at: Date.now(), mode };
  return mode;
}

export function setBotMode(mode) {
  if (!MODES[mode]) return false;
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify({ mode }, null, 2));
  cache = { at: Date.now(), mode };
  return true;
}
