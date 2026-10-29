import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "bluesky", "antispam.json");
const warningsPath = path.join(process.cwd(), "bluesky", "antispam_warnings.json");

const SPAM_THRESHOLD = 5;    // عدد الرسائل المتتالية
const SPAM_WINDOW_MS = 15000; // خلال كام ملي ثانية (15 ثانية)
const MAX_WARNINGS = 3;

// تتبع الرسائل في الذاكرة (مش محتاج ملف، مؤقت وسريع)
const messageTracker = new Map(); // key: chatId+jid -> { count, firstTs }

function loadEnabled() {
  try {
    if (!fs.existsSync(dbPath)) return {};
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch {
    return {};
  }
}

function saveEnabled(data) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function loadWarnings() {
  try {
    if (!fs.existsSync(warningsPath)) return {};
    return JSON.parse(fs.readFileSync(warningsPath, "utf8"));
  } catch {
    return {};
  }
}

function saveWarnings(data) {
  fs.mkdirSync(path.dirname(warningsPath), { recursive: true });
  fs.writeFileSync(warningsPath, JSON.stringify(data, null, 2));
}

export function isAntiSpamOn(chatId) {
  const data = loadEnabled();
  return !!data[chatId];
}

export function setAntiSpam(chatId, enabled) {
  const data = loadEnabled();
  if (enabled) data[chatId] = true;
  else delete data[chatId];
  saveEnabled(data);
}

// يرجع true لو العضو تجاوز الحد (سبام)
export function trackMessage(chatId, jid) {
  const key = `${chatId}:${jid}`;
  const now = Date.now();
  const entry = messageTracker.get(key);

  if (!entry || now - entry.firstTs > SPAM_WINDOW_MS) {
    messageTracker.set(key, { count: 1, firstTs: now });
    return false;
  }

  entry.count++;
  if (entry.count >= SPAM_THRESHOLD) {
    messageTracker.delete(key); // نصفّر العداد بعد الاكتشاف
    return true;
  }
  return false;
}

export function addWarning(chatId, jid) {
  const data = loadWarnings();
  data[chatId] ??= {};
  data[chatId][jid] = (data[chatId][jid] || 0) + 1;
  saveWarnings(data);
  return data[chatId][jid];
}

export function resetWarnings(chatId, jid) {
  const data = loadWarnings();
  if (data[chatId]?.[jid] != null) {
    delete data[chatId][jid];
    saveWarnings(data);
  }
}

export function getMaxWarnings() {
  return MAX_WARNINGS;
}

export default {
  isAntiSpamOn,
  setAntiSpam,
  trackMessage,
  addWarning,
  resetWarnings,
  getMaxWarnings
};
