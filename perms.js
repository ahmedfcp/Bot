// نظام صلاحيات الأوامر: عام | نخبة | خاص (مالك) + تعطيل/تفعيل — قابل للتغيير من الواتس
import { db } from "jsonion";
import { getPlugins } from "./plugins.js";
import path from "path";

export const LV = { "عام": "all", "نخبة": "elite", "خاص": "owner" };
export const NAME = { all: "عام", elite: "نخبة", owner: "خاص" };
export const RANK = { all: 0, elite: 1, owner: 2 };
export const LOCKED = ["صلاحية", "صلاحية_قسم", "صلاحيات", "تعطيل", "تفعيل", "اسم_البوت", "ضيف_مالك", "ازل_مالك", "المالكين", "تنصيب", "اضف_صورة", "حذف_صورة", "اضف_جيف", "حذف_جيف", "اضف_دائري", "حذف_دائري", "اضف_نقاط", "حذف_نقاط", "النقاط_المضافة", "وضع", "جيف", "حفظ_جيف", "فك_جيف", "الجيفات_المحفوظة", "دائري", "حفظ_دائري", "فك_دائري", "الدوائر_المحفوظة"];

function store() {
  return new db("handlers/perms-pro.json");
}

export function find(name) {
  name = String(name || "").trim().toLowerCase();
  const plugins = getPlugins();
  return plugins[name] || null;
}

export function baseLevel(handler) {
  if (handler && handler.owner === true) return "owner";
  return handler && handler.elite === "on" ? "elite" : "all";
}

export function categoryOf(handler) {
  try {
    return path.basename(path.dirname(handler.filePath));
  } catch {
    return "عام";
  }
}

export function effectiveLevel(command, handler) {
  const overrides = store().get("overrides") || {};
  const o = overrides[command];
  if (o && o.level) return o.level;
  return baseLevel(handler);
}

export function isOff(command) {
  const overrides = store().get("overrides") || {};
  return !!(overrides[command] && overrides[command].off);
}

export function setLevel(command, level) {
  const d = store();
  const overrides = d.get("overrides") || {};
  const e = overrides[command] || {};
  if (level) e.level = level;
  else delete e.level;
  if (!e.level && !e.off) delete overrides[command];
  else overrides[command] = e;
  d.set("overrides", overrides);
}

export function setOff(command, off) {
  const d = store();
  const overrides = d.get("overrides") || {};
  const e = overrides[command] || {};
  if (off) e.off = true;
  else delete e.off;
  if (!e.level && !e.off) delete overrides[command];
  else overrides[command] = e;
  d.set("overrides", overrides);
}

export function allOverrides() {
  return store().get("overrides") || {};
}

export default { LV, NAME, RANK, LOCKED, find, baseLevel, categoryOf, effectiveLevel, isOff, setLevel, setOff, allOverrides };
