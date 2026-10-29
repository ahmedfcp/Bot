import fs from "fs";
import path from "path";
import { isRegistered, updateBalance, getUser } from "./bank.js";

const dbPath = path.join(process.cwd(), "bluesky", "rpg.json");
const lotteryPath = path.join(process.cwd(), "bluesky", "rpg_lottery.json");

function load() {
  try {
    if (!fs.existsSync(dbPath)) return {};
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch { return {}; }
}
function save(data) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

const ENERGY_REGEN_MS = 3 * 60 * 1000; // طاقة واحدة كل 3 دقايق
const ANIMAL_DECAY_MS = 30 * 60 * 1000; // نقطة جوع/سعادة تنقص كل 30 دقيقة

export const ITEMS = {
  خشب: { name: "خشب", type: "resource", sellPrice: 8 },
  سمك: { name: "سمك", type: "resource", sellPrice: 12 },
  خام_حديد: { name: "خام حديد", type: "resource", sellPrice: 20 },
  سمك_مشوي: { name: "سمك مشوي", type: "food", sellPrice: 25, heal: 15, energy: 10 },
  يخنة: { name: "يخنة لحم", type: "food", sellPrice: 40, heal: 30, energy: 20 },
  جرعة_صحة: { name: "جرعة صحة", type: "potion", buyPrice: 60, heal: 40 },
  جرعة_طاقة: { name: "جرعة طاقة", type: "potion", buyPrice: 50, energy: 25 },
  سيف_خشبي: { name: "سيف خشبي", type: "weapon", buyPrice: 100, power: 5 },
  سيف_حديد: { name: "سيف حديد", type: "weapon", buyPrice: 400, power: 15 },
  درع_جلدي: { name: "درع جلدي", type: "armor", buyPrice: 120, defense: 10 },
  درع_حديد: { name: "درع حديد", type: "armor", buyPrice: 450, defense: 25 },
  طعام_حيوان: { name: "طعام حيوان", type: "animalFood", buyPrice: 15 }
};

const ANIMAL_SPECIES = ["قطة", "كلب", "ذئب", "صقر", "تنين صغير", "ثعلب"];

function xpNeeded(level) { return level * 150; }

function freshPlayer() {
  return {
    level: 1, xp: 0,
    hp: 100, maxHp: 100,
    energy: 50, maxEnergy: 50, lastEnergyTs: Date.now(),
    animal: null,
    inventory: {},
    equipped: { weapon: null, armor: null },
    stats: { wins: 0, losses: 0, questsDone: 0 },
    quest: null,
    lastClaims: {}
  };
}

function regen(p) {
  const now = Date.now();
  if (p.energy < p.maxEnergy) {
    const gained = Math.floor((now - (p.lastEnergyTs || now)) / ENERGY_REGEN_MS);
    if (gained > 0) {
      p.energy = Math.min(p.maxEnergy, p.energy + gained);
      p.lastEnergyTs = now;
    }
  } else {
    p.lastEnergyTs = now;
  }
  if (p.animal) {
    const elapsed = now - (p.animal.lastDecayTs || now);
    const ticks = Math.floor(elapsed / ANIMAL_DECAY_MS);
    if (ticks > 0) {
      p.animal.hunger = Math.max(0, p.animal.hunger - ticks);
      p.animal.happiness = Math.max(0, p.animal.happiness - ticks);
      p.animal.lastDecayTs = now;
    }
  }
}

export function getPlayer(jid) {
  const data = load();
  if (!data[jid]) data[jid] = freshPlayer();
  regen(data[jid]);
  save(data);
  return data[jid];
}

function setPlayer(jid, p) {
  const data = load();
  data[jid] = p;
  save(data);
  return p;
}

export function isRpgRegistered(jid) {
  return isRegistered(jid);
}

export function gainXp(jid, amount) {
  const p = getPlayer(jid);
  p.xp += amount;
  let leveledUp = false;
  while (p.xp >= xpNeeded(p.level)) {
    p.xp -= xpNeeded(p.level);
    p.level++;
    p.maxHp += 10;
    p.maxEnergy += 5;
    p.hp = p.maxHp;
    p.energy = p.maxEnergy;
    leveledUp = true;
  }
  setPlayer(jid, p);
  return { level: p.level, xp: p.xp, leveledUp };
}

export function addItem(jid, itemId, qty = 1) {
  const p = getPlayer(jid);
  p.inventory[itemId] = (p.inventory[itemId] || 0) + qty;
  setPlayer(jid, p);
  return p.inventory[itemId];
}

export function removeItem(jid, itemId, qty = 1) {
  const p = getPlayer(jid);
  const have = p.inventory[itemId] || 0;
  if (have < qty) return false;
  p.inventory[itemId] = have - qty;
  if (p.inventory[itemId] <= 0) delete p.inventory[itemId];
  setPlayer(jid, p);
  return true;
}

export function getInventoryText(jid) {
  const p = getPlayer(jid);
  const entries = Object.entries(p.inventory);
  if (!entries.length) return "📭 الجرد فارغ.";
  return entries
    .map(([id, qty]) => `• ${ITEMS[id]?.name || id} × ${qty}`)
    .join("\n");
}

export function getLastClaim(jid, key) {
  const p = getPlayer(jid);
  return p.lastClaims[key] || 0;
}
export function setLastClaim(jid, key, ts) {
  const p = getPlayer(jid);
  p.lastClaims[key] = ts;
  setPlayer(jid, p);
}

export function useEnergy(jid, amount) {
  const p = getPlayer(jid);
  if (p.energy < amount) return false;
  p.energy -= amount;
  setPlayer(jid, p);
  return true;
}

export function heal(jid, amount) {
  const p = getPlayer(jid);
  p.hp = Math.min(p.maxHp, p.hp + amount);
  setPlayer(jid, p);
  return p.hp;
}
export function restoreEnergy(jid, amount) {
  const p = getPlayer(jid);
  p.energy = Math.min(p.maxEnergy, p.energy + amount);
  setPlayer(jid, p);
  return p.energy;
}
export function damage(jid, amount) {
  const p = getPlayer(jid);
  p.hp = Math.max(0, p.hp - amount);
  setPlayer(jid, p);
  return p.hp;
}

export function getCombatPower(jid) {
  const p = getPlayer(jid);
  const weaponPower = ITEMS[p.equipped.weapon]?.power || 0;
  const armorDef = ITEMS[p.equipped.armor]?.defense || 0;
  const animalBonus = p.animal ? Math.floor((p.animal.happiness + p.animal.hunger) / 20) : 0;
  return { power: p.level * 5 + weaponPower + animalBonus, defense: armorDef, level: p.level };
}

// ===== الحيوان الأليف =====
export function adoptAnimal(jid, name) {
  const p = getPlayer(jid);
  if (p.animal) return null;
  const species = ANIMAL_SPECIES[Math.floor(Math.random() * ANIMAL_SPECIES.length)];
  p.animal = { name, species, hunger: 100, happiness: 100, bond: 0, level: 1, lastDecayTs: Date.now() };
  setPlayer(jid, p);
  return p.animal;
}

export function feedAnimal(jid) {
  const p = getPlayer(jid);
  if (!p.animal) return { ok: false, reason: "no_animal" };
  if (!removeItem(jid, "طعام_حيوان", 1)) return { ok: false, reason: "no_food" };
  const p2 = getPlayer(jid);
  p2.animal.hunger = Math.min(100, p2.animal.hunger + 40);
  p2.animal.bond = Math.min(100, p2.animal.bond + 3);
  setPlayer(jid, p2);
  return { ok: true, animal: p2.animal };
}

export function playWithAnimal(jid) {
  const p = getPlayer(jid);
  if (!p.animal) return { ok: false, reason: "no_animal" };
  p.animal.happiness = Math.min(100, p.animal.happiness + 25);
  p.animal.bond = Math.min(100, p.animal.bond + 5);
  setPlayer(jid, p);
  return { ok: true, animal: p.animal };
}

export function getAnimalStatusText(jid) {
  const p = getPlayer(jid);
  if (!p.animal) return "❌ ليس لديك حيوان أليف.\nاكتب: تبني_حيوان [اسم]";
  const a = p.animal;
  const mood = a.happiness > 70 ? "😄 سعيد" : a.happiness > 30 ? "😐 عادي" : "😢 حزين";
  return (
    `🐾 *${a.name}* (${a.species})\n\n` +
    `🍖 الجوع: ${a.hunger}/100\n` +
    `💖 السعادة: ${a.happiness}/100\n` +
    `🔗 الترابط: ${a.bond}/100\n` +
    `الحالة: ${mood}`
  );
}

// ===== المهام =====
const QUEST_POOL = [
  { id: "wood5", desc: "اجمع 5 خشب", target: 5, type: "item", item: "خشب", reward: { xp: 50, cash: 100 } },
  { id: "fish5", desc: "اصطد 5 أسماك", target: 5, type: "item", item: "سمك", reward: { xp: 50, cash: 100 } },
  { id: "win3duel", desc: "اربح 3 مبارزات", target: 3, type: "wins", reward: { xp: 120, cash: 300 } },
  { id: "adv5", desc: "أكمل 5 مغامرات", target: 5, type: "adventures", reward: { xp: 80, cash: 150 } }
];

export function getOrCreateQuest(jid) {
  const p = getPlayer(jid);
  if (!p.quest) {
    p.quest = { ...QUEST_POOL[Math.floor(Math.random() * QUEST_POOL.length)], progress: 0 };
    setPlayer(jid, p);
  }
  return p.quest;
}

export function progressQuest(jid, type, itemId = null, amount = 1) {
  const p = getPlayer(jid);
  if (!p.quest) return null;
  const q = p.quest;
  if (q.type === type && (q.type !== "item" || q.item === itemId)) {
    q.progress = Math.min(q.target, q.progress + amount);
    if (q.progress >= q.target) {
      updateBalance(jid, { cash: q.reward.cash });
      gainXp(jid, q.reward.xp);
      p.stats.questsDone++;
      p.quest = null;
      setPlayer(jid, p);
      return { completed: true, reward: q.reward };
    }
  }
  setPlayer(jid, p);
  return { completed: false };
}

// ===== اليانصيب (جائزة تراكمية مشتركة) =====
function loadLottery() {
  try {
    if (!fs.existsSync(lotteryPath)) return { pool: 0, lastWinner: null };
    return JSON.parse(fs.readFileSync(lotteryPath, "utf8"));
  } catch { return { pool: 0, lastWinner: null }; }
}
function saveLottery(d) {
  fs.writeFileSync(lotteryPath, JSON.stringify(d, null, 2));
}
export function playLottery(jid, ticketPrice) {
  const d = loadLottery();
  d.pool += Math.floor(ticketPrice * 0.7);
  const win = Math.random() < 0.08; // 8% فرصة
  let result = { win: false, pool: d.pool };
  if (win) {
    result = { win: true, amount: d.pool, pool: 0 };
    d.pool = 0;
    d.lastWinner = jid;
    updateBalance(jid, { cash: result.amount });
  }
  saveLottery(d);
  return result;
}

export function getStats(jid) {
  const p = getPlayer(jid);
  return p;
}

export default {
  getPlayer, isRpgRegistered, gainXp, addItem, removeItem, getInventoryText,
  getLastClaim, setLastClaim, useEnergy, heal, restoreEnergy, damage,
  getCombatPower, adoptAnimal, feedAnimal, playWithAnimal, getAnimalStatusText,
  getOrCreateQuest, progressQuest, playLottery, getStats, ITEMS
};
