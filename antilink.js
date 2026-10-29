import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "bluesky", "antilink.json");

function load() {
  try {
    if (!fs.existsSync(dbPath)) return {};
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch {
    return {};
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

export function isAntiLinkOn(chatId) {
  const data = load();
  return !!data[chatId]?.enabled;
}

export function setAntiLink(chatId, enabled) {
  const data = load();
  data[chatId] ??= { enabled: false, violations: {} };
  data[chatId].enabled = enabled;
  save(data);
}

// يزود عدد المخالفات ويرجع العدد الجديد
export function addViolation(chatId, jid) {
  const data = load();
  data[chatId] ??= { enabled: false, violations: {} };
  data[chatId].violations[jid] = (data[chatId].violations[jid] || 0) + 1;
  save(data);
  return data[chatId].violations[jid];
}

export function resetViolations(chatId, jid) {
  const data = load();
  if (data[chatId]?.violations?.[jid] != null) {
    delete data[chatId].violations[jid];
    save(data);
  }
}

export default { isAntiLinkOn, setAntiLink, addViolation, resetViolations };