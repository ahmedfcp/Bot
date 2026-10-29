import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "bluesky", "bank.json");
const systemStatePath = path.join(process.cwd(), "bluesky", "bank_system.json");
const LOAN_DEADLINE_MS = 3 * 24 * 60 * 60 * 1000;

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

// الجزء الرقمي فقط (يتجاهل @lid و @s.whatsapp.net و :device)
function num(jid) {
  return String(jid || "").split("@")[0].split(":")[0];
}

function findKey(data, jid) {
  if (!jid) return null;
  if (data[jid]) return jid;
  const n = num(jid);
  if (!n) return null;
  for (const k of Object.keys(data)) {
    if (num(k) === n) return k;
    if (data[k].aliases?.includes(n)) return k;
  }
  return null;
}

export function isRegistered(jid) {
  return !!findKey(load(), jid);
}

export function registerUser(jid, title, extraIds = []) {
  const data = load();
  if (findKey(data, jid)) return false;
  const ids = [jid, ...extraIds].filter(Boolean).map(num);
  data[jid] = {
    title,
    cash: 500,
    bank: 0,
    registeredAt: Date.now(),
    aliases: [...new Set(ids)]
  };
  save(data);
  return true;
}

// يربط عدة معرّفات (رقم + LID) بنفس الحساب لو أحدها مسجّل
export function linkIdentity(...ids) {
  const data = load();
  const valid = ids.filter(Boolean);
  let key = null;
  for (const id of valid) {
    key = findKey(data, id);
    if (key) break;
  }
  if (!key) return;
  data[key].aliases ??= [];
  let changed = false;
  for (const id of valid) {
    const n = num(id);
    if (n && !data[key].aliases.includes(n)) {
      data[key].aliases.push(n);
      changed = true;
    }
  }
  if (changed) save(data);
}

export function getUser(jid) {
  checkLoanExpiry(jid);
  const data = load();
  const k = findKey(data, jid);
  return k ? data[k] : null;
}

export function getTitle(jid) {
  const data = load();
  const k = findKey(data, jid);
  return k ? data[k].title : null;
}

export function updateBalance(jid, { cash = 0, bank = 0 }) {
  const data = load();
  const k = findKey(data, jid);
  if (!k) return null;
  data[k].cash = Math.max(0, (data[k].cash || 0) + cash);
  data[k].bank = Math.max(0, (data[k].bank || 0) + bank);
  save(data);
  return data[k];
}

export function setBalance(jid, { cash, bank }) {
  const data = load();
  const k = findKey(data, jid);
  if (!k) return null;
  if (cash != null) data[k].cash = Math.max(0, cash);
  if (bank != null) data[k].bank = Math.max(0, bank);
  save(data);
  return data[k];
}

export function getLastClaim(jid, key) {
  const data = load();
  const k = findKey(data, jid);
  return k ? data[k][key] || 0 : 0;
}

export function setLastClaim(jid, key, timestamp) {
  const data = load();
  const k = findKey(data, jid);
  if (!k) return;
  data[k][key] = timestamp;
  save(data);
}

export function setTitle(jid, title) {
  const data = load();
  const k = findKey(data, jid);
  if (!k) return null;
  data[k].title = title;
  save(data);
  return data[k];
}

export function getLoan(jid) {
  const data = load();
  const k = findKey(data, jid);
  return k ? data[k].loan || 0 : 0;
}

export function setLoan(jid, amount) {
  const data = load();
  const k = findKey(data, jid);
  if (!k) return null;
  data[k].loan = Math.max(0, amount);
  if (data[k].loan > 0) {
    if (!data[k].loanDueAt) data[k].loanDueAt = Date.now() + LOAN_DEADLINE_MS;
  } else {
    delete data[k].loanDueAt;
  }
  save(data);
  return data[k];
}

function wipeIfExpired(data, k) {
  const u = data[k];
  if (!u || !(u.loan > 0)) return false;
  if (!u.loanDueAt) {
    u.loanDueAt = Date.now() + LOAN_DEADLINE_MS;
    return true;
  }
  if (Date.now() > u.loanDueAt) {
    u.cash = 0;
    u.bank = 0;
    u.loan = 0;
    delete u.loanDueAt;
    u.wipedNotice = true;
    return true;
  }
  return false;
}

export function checkLoanExpiry(jid) {
  const data = load();
  const k = findKey(data, jid);
  if (k && wipeIfExpired(data, k)) save(data);
}

export function sweepExpiredLoans() {
  const data = load();
  let changed = false;
  for (const k of Object.keys(data)) {
    if (wipeIfExpired(data, k)) changed = true;
  }
  if (changed) save(data);
}

export function consumeWipeNotice(jid) {
  const data = load();
  const k = findKey(data, jid);
  if (k && data[k].wipedNotice) {
    delete data[k].wipedNotice;
    save(data);
    return true;
  }
  return false;
}

export function getLoanDueAt(jid) {
  const data = load();
  const k = findKey(data, jid);
  return k ? data[k].loanDueAt || null : null;
}

export function deleteAccount(jid) {
  const data = load();
  const k = findKey(data, jid);
  if (!k) return false;
  delete data[k];
  save(data);
  return true;
}

export function getTitles(jid) {
  const data = load();
  const k = findKey(data, jid);
  return k ? data[k].titles || [] : [];
}

export function addOwnedTitle(jid, title) {
  const data = load();
  const k = findKey(data, jid);
  if (!k) return null;
  data[k].titles ??= [];
  if (!data[k].titles.includes(title)) data[k].titles.push(title);
  save(data);
  return data[k];
}

export function isBankEnabled() {
  try {
    if (!fs.existsSync(systemStatePath)) return true;
    return JSON.parse(fs.readFileSync(systemStatePath, "utf8")).enabled !== false;
  } catch {
    return true;
  }
}

export function setBankEnabled(enabled) {
  fs.mkdirSync(path.dirname(systemStatePath), { recursive: true });
  fs.writeFileSync(systemStatePath, JSON.stringify({ enabled }, null, 2));
}

function toPn(jid) {
  return String(jid).split(":")[0].split("@")[0] + "@s.whatsapp.net";
}

export async function resolveToPn(sock, chatId, jid) {
  if (!jid) return jid;
  if (jid.endsWith("@s.whatsapp.net")) return toPn(jid);
  if (jid.endsWith("@lid")) {
    try {
      const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid);
      if (pn) { linkIdentity(toPn(pn), jid); return toPn(pn); }
    } catch {}
    try {
      const meta = await sock.groupMetadata(chatId);
      const p = meta.participants.find((x) => x.id === jid);
      const pn = p?.phoneNumber || p?.jid;
      if (pn) { linkIdentity(toPn(pn), jid); return toPn(pn); }
    } catch {}
  }
  return jid;
}

export function getAllUsers() {
  return load();
}

export default {
  isRegistered, registerUser, linkIdentity, getUser, getTitle,
  updateBalance, setBalance, getLastClaim, setLastClaim, setTitle,
  getLoan, setLoan, checkLoanExpiry, sweepExpiredLoans, consumeWipeNotice,
  getLoanDueAt, deleteAccount, getTitles, addOwnedTitle,
  isBankEnabled, setBankEnabled, resolveToPn, getAllUsers
};
