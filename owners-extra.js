// مالكين إضافيين (فوق config.owner) — بدون أي تعديل على config.owner أو DEV_NUMBERS
import { db } from "jsonion";

function store() {
  return new db("handlers/owners-extra.json");
}

export function isExtraOwner(pn) {
  if (!pn) return false;
  const list = store().get("owners") || [];
  return list.includes(pn);
}

export function addOwners(pns) {
  const d = store();
  const list = d.get("owners") || [];
  let added = 0;
  for (const pn of pns) {
    if (!list.includes(pn)) {
      list.push(pn);
      added++;
    }
  }
  d.set("owners", list);
  return added;
}

export function removeOwners(pns) {
  const d = store();
  let list = d.get("owners") || [];
  const before = list.length;
  list = list.filter((x) => !pns.includes(x));
  d.set("owners", list);
  return before - list.length;
}

export function listOwners() {
  return store().get("owners") || [];
}
