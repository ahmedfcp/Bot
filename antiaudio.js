import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "bluesky", "antiaudio.json");
const warningsPath = path.join(process.cwd(), "bluesky", "antiaudio_warnings.json");

const MAX_WARNINGS = 3;

function load(p) {
  try {
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function save(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

export function isAntiAudioOn(chatId) {
  const data = load(dbPath);
  return !!data[chatId]?.enabled;
}

export function setAntiAudio(chatId, enabled) {
  const data = load(dbPath);
  data[chatId] ??= { enabled: false, warningsEnabled: true };
  data[chatId].enabled = enabled;
  save(dbPath, data);
}

export function isWarningsEnabled(chatId) {
  const data = load(dbPath);
  return data[chatId]?.warningsEnabled !== false;
}

export function setWarningsEnabled(chatId, enabled) {
  const data = load(dbPath);
  data[chatId] ??= { enabled: false, warningsEnabled: true };
  data[chatId].warningsEnabled = enabled;
  save(dbPath, data);
}

export function addWarning(chatId, jid) {
  const data = load(warningsPath);
  data[chatId] ??= {};
  data[chatId][jid] = (data[chatId][jid] || 0) + 1;
  save(warningsPath, data);
  return data[chatId][jid];
}

export function resetWarning(chatId, jid) {
  const data = load(warningsPath);
  if (data[chatId]?.[jid] != null) {
    delete data[chatId][jid];
    save(warningsPath, data);
  }
}

export function getMaxWarnings() {
  return MAX_WARNINGS;
}

export default {
  isAntiAudioOn,
  setAntiAudio,
  isWarningsEnabled,
  setWarningsEnabled,
  addWarning,
  resetWarning,
  getMaxWarnings
};
