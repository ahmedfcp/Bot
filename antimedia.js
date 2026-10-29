import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "bluesky", "antimedia.json");
const warningsPath = path.join(process.cwd(), "bluesky", "antimedia_warnings.json");
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

export function isMediaBlockOn(type, chatId) {
  return !!load(dbPath)[chatId]?.[type]?.enabled;
}

export function setMediaBlock(type, chatId, enabled) {
  const data = load(dbPath);
  data[chatId] ??= {};
  data[chatId][type] ??= { enabled: false, warningsEnabled: true };
  data[chatId][type].enabled = enabled;
  save(dbPath, data);
}

export function isMediaWarnOn(type, chatId) {
  return load(dbPath)[chatId]?.[type]?.warningsEnabled !== false;
}

export function setMediaWarn(type, chatId, enabled) {
  const data = load(dbPath);
  data[chatId] ??= {};
  data[chatId][type] ??= { enabled: false, warningsEnabled: true };
  data[chatId][type].warningsEnabled = enabled;
  save(dbPath, data);
}

export function addMediaWarning(type, chatId, jid) {
  const data = load(warningsPath);
  data[chatId] ??= {};
  data[chatId][type] ??= {};
  data[chatId][type][jid] = (data[chatId][type][jid] || 0) + 1;
  save(warningsPath, data);
  return data[chatId][type][jid];
}

export function resetMediaWarning(type, chatId, jid) {
  const data = load(warningsPath);
  if (data[chatId]?.[type]?.[jid] != null) {
    delete data[chatId][type][jid];
    save(warningsPath, data);
  }
}

export function getMediaMaxWarnings() {
  return MAX_WARNINGS;
}

export default {
  isMediaBlockOn, setMediaBlock, isMediaWarnOn, setMediaWarn,
  addMediaWarning, resetMediaWarning, getMediaMaxWarnings
};
