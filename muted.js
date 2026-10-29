import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "bluesky", "muted.json");

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

export function isMuted(chatId, jid) {
  const data = load();
  return !!data[chatId]?.[jid];
}

export function setMuted(chatId, jid, muted) {
  const data = load();
  data[chatId] ??= {};
  if (muted) data[chatId][jid] = true;
  else delete data[chatId][jid];
  save(data);
}

export default { isMuted, setMuted };