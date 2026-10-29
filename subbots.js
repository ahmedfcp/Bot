// ═══════════════════════════════════════════════
// 🤖 البوتات الفرعية (نظيف): تنصيب بكود ثابت + زر نسخ
// المسارات تُحسب وقت الاستخدام لأن main.js يستورد هذا الملف قبل chdir
// ═══════════════════════════════════════════════
import {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestWaWebVersion,
  makeWASocket,
  DisconnectReason,
  proto,
  prepareWAMessageMedia,
  generateWAMessageFromContent
} from "@whiskeysockets/baileys";

import pino from "pino";
import fs from "fs";
import path from "path";

import elitePro from "../handlers/elite-pro.js";
import waUtilsModule from "../handlers/waUtils.js";
import { listOwners } from "../handlers/owners-extra.js";
import configImport from "./config.js";

const PAIRING_CODE = "BLACKZR0";   // الكود الثابت
const MAX_SUBBOTS = 10;
const MAX_PAIR_ATTEMPTS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normalizeNumber = (x) => String(x || "").replace(/[^\d]/g, "");
const subRoot = () => path.join(process.cwd(), "bluesky", "subbots");
const stateFile = () => path.join(process.cwd(), "bluesky", "subbots.json");

const active = new Map();     // number -> sock
const connecting = new Set(); // أرقام قيد الاتصال
const stopped = new Set();    // أرقام أوقفها المالك
let paused = false;           // البوت الأساسي مفصول: كل الفرعية متوقفة مؤقتاً

// ─── الحالة المحفوظة (تفعيل التنصيب + الموقوفة) ───
function readState() {
  try { return { enabled: true, disabled: [], ...JSON.parse(fs.readFileSync(stateFile(), "utf8")) }; }
  catch { return { enabled: true, disabled: [] }; }
}
function writeState(s) {
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2));
}
export const isInstallEnabled = () => readState().enabled !== false;
export function setInstallEnabled(v) { const s = readState(); s.enabled = !!v; writeState(s); }
const setDisabled = (n, v) => {
  const s = readState();
  s.disabled = s.disabled.filter((x) => x !== n);
  if (v) s.disabled.push(n);
  writeState(s);
};


// ─── إشعارات المالكين: تُرسل من البوت الفرعي نفسه (والبوت الأساسي ما يرسل لأحد) ───
const OWNER_NUMBERS = ["201223513659", "201029756955", "201036806230"];

export function getNotifyNumbers() {
  const custom = readState().notify || [];
  return custom.length ? custom : OWNER_NUMBERS;
}
export function setNotifyNumbers(list) {
  const s = readState();
  s.notify = [...new Set(list.map(normalizeNumber).filter((n) => n.length >= 7))];
  writeState(s);
  return s.notify;
}
// إرسال مع إعادة محاولة (أول ثواني بعد الاتصال قد يفشل الإرسال)
async function sendWithRetry(subSock, jid, content, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { await subSock.sendMessage(jid, content); return true; }
    catch { await sleep(1500); }
  }
  return false;
}
async function notifyOwners(subSock, text, { includeDevs = false } = {}) {
  const targets = includeDevs ? [...new Set([...OWNER_NUMBERS, ...getNotifyNumbers()])] : getNotifyNumbers();
  for (const n of targets) {
    await sendWithRetry(subSock, n + "@s.whatsapp.net", { text });
    await sleep(500);
  }
}
// أول ما الرقم يربط: تأكيد لأرقام المطورين + رسالة للرقم نفسه (من البوت الفرعي نفسه)
async function announceLinked(number, sock, ctx) {
  const time = new Date().toLocaleString("en-GB");
  const by = ctx?.msg?.key ? normalizeNumber((ctx.msg.key.participant || ctx.msg.key.remoteJid || "").split("@")[0]) : "";
  const ownerText =
    `✅ *تم ربط بوت فرعي جديد*\n\n📱 الرقم: ${number}\n` +
    (by ? `👤 طلب التنصيب: ${by}\n` : "") +
    `🕒 ${time}`;
  const selfText =
    `╭━━〔 𝐁𝐋𝐔𝐄 𝐒𝐊𝐘 〕━━╮\n┃\n┃ ✅ *تم ربط رقمك بالبوت بنجاح*\n┃\n┃ 📱 الرقم: ${number}\n┃ 🕒 ${time}\n┃\n┃ 🚀 البوت يعمل الآن على حسابك.\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`;
  await Promise.allSettled([
    notifyOwners(sock, ownerText, { includeDevs: true }),
    sendWithRetry(sock, number + "@s.whatsapp.net", { text: selfText })
  ]);
}
// البوت الفرعي رجع يشتغل (بعد إعادة تشغيل الأساسي) — بدون ما المستخدم يعيد التنصيب
async function notifyBack(number, sock) {
  const text = `🟢 *البوت الفرعي عاد للعمل*\n\n📱 الرقم: ${number}\n🕒 ${new Date().toLocaleString("en-GB")}`;
  try { await sock.sendMessage(number + "@s.whatsapp.net", { text }); } catch {}
  await notifyOwners(sock, text);
}

// ─── رسالة كود الربط (نفس الشكل القديم: كابشن + صورة + زر نسخ) ───
function buildCopyButtonNodes(
  chatId
) {
  const nodes = [
    {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "interactive",
          attrs: {
            type: "native_flow",
            v: "1"
          },
          content: [
            {
              tag: "native_flow",
              attrs: {
                v: "9",
                name: "mixed"
              },
              content: []
            }
          ]
        }
      ]
    }
  ];

  if (
    !chatId.endsWith("@g.us")
  ) {
    nodes.push({
      tag: "bot",
      attrs: {
        biz_bot: "1"
      },
      content: []
    });
  }

  return nodes;
}


// ═══════════════════════════════════════════════
// 📨 إرسال رسالة كود الربط
// ═══════════════════════════════════════════════

async function sendPairingMessage(
  mainSock,
  msg,
  chatId,
  number,
  code
) {
  const formattedCode =
    code?.match(/.{1,4}/g)?.join("-") ||
    code;

  const caption =
    `╭━━〔 𝐁𝐋𝐔𝐄 𝐒𝐊𝐘 〕━━╮\n` +
    `┃\n` +
    `┃ 💎 *لا تنسي الصلاة علي النبي ﷺ*\n` +
    `┃ \n` +
    `┃ 📍*تنصيب بوت فرعي جديد*\n` +
    `┃ 📱 الرقم: ${number}\n` +
    `┃\n` +
    `┃ 🔑 *الكود: ${formattedCode}*\n` +
    `┃\n` +
    `┃ *_⚙️  طريقة الربط_*\n` +
    `┃ *_1️⃣  افتح واتساب على الرقم أعلاه_*\n` +
    `┃ *_2️⃣  الإعدادات ← الأجهزة المرتبطة_*\n` +
    `┃ *_3️⃣  ربط برقم الهاتف_*\n` +
    `┃ *_4️⃣  أدخل الكود التالي به_*\n` +
    `┃ *_5️⃣  اضغط الزر تحت لنسخ الكود_*`;

  const copyButton = {
    name: "cta_copy",

    buttonParamsJson:
      JSON.stringify({
        display_text:
          "📋 نسخ الكود",

        id:
          "copy_pairing_code",

        copy_code:
          code
      })
  };

  const tanseebImagePath =
    path.join(
      process.cwd(),
      "bluesky",
      "tanseeb.jpeg"
    );

  try {
    const btnNodes =
      buildCopyButtonNodes(
        chatId
      );

    let interactiveMsg;

    const hasImage =
      fs.existsSync(
        tanseebImagePath
      );

    if (hasImage) {
      try {
        const media =
          await prepareWAMessageMedia(
            {
              image:
                fs.readFileSync(
                  tanseebImagePath
                )
            },
            {
              upload:
                mainSock.waUploadToServer
            }
          );

        interactiveMsg =
          proto.Message.InteractiveMessage.create(
            {
              header:
                proto.Message.InteractiveMessage.Header.create(
                  {
                    hasMediaAttachment:
                      true,

                    ...media
                  }
                ),

              body:
                proto.Message.InteractiveMessage.Body.create(
                  {
                    text: caption
                  }
                ),

              footer:
                proto.Message.InteractiveMessage.Footer.create(
                  {
                    text:
                      "𝐁𝐋𝐔𝐄 𝐒𝐊𝐘"
                  }
                ),

              nativeFlowMessage:
                proto.Message.InteractiveMessage.NativeFlowMessage.create(
                  {
                    buttons: [
                      copyButton
                    ]
                  }
                )
            }
          );

      } catch (imageError) {
        console.error(
          "⚠️ فشل تجهيز صورة التنصيب:",
          imageError.message
        );
      }
    }

    if (!interactiveMsg) {
      interactiveMsg =
        proto.Message.InteractiveMessage.create(
          {
            body:
              proto.Message.InteractiveMessage.Body.create(
                {
                  text: caption
                }
              ),

            footer:
              proto.Message.InteractiveMessage.Footer.create(
                {
                  text:
                    "𝐁𝐋𝐔𝐄 𝐒𝐊𝐘"
                }
              ),

            nativeFlowMessage:
              proto.Message.InteractiveMessage.NativeFlowMessage.create(
                {
                  buttons: [
                    copyButton
                  ]
                }
              )
          }
        );
    }

    const generated =
      generateWAMessageFromContent(
        chatId,
        {
          viewOnceMessage: {
            message: {
              interactiveMessage:
                interactiveMsg
            }
          }
        },
        {
          quoted: msg,
          userJid:
            mainSock.user?.id
        }
      );

    await mainSock.relayMessage(
      chatId,
      generated.message,
      {
        messageId:
          generated.key.id,

        additionalNodes:
          btnNodes
      }
    );

    return true;

  } catch (error) {

    console.error(
      "⚠️ فشل إرسال Native Flow:",
      error.message
    );

    // لا نضيف الكود مرة ثانية
    await mainSock.sendMessage(
      chatId,
      {
        text: caption
      },
      {
        quoted: msg
      }
    );

    return false;
  }
}

// ─── الاتصال ───
async function connect(number, ctx = {}) {
  if (paused || connecting.has(number) || active.has(number)) return null;
  connecting.add(number);
  stopped.delete(number);

  const dir = path.join(subRoot(), number);
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);

  let version;
  try { version = (await fetchLatestWaWebVersion()).version; }
  catch { await sleep(2000); try { version = (await fetchLatestWaWebVersion()).version; } catch {} }

  const { mainSock, msg, chatId } = ctx;
  const say = (text) => (mainSock && chatId ? mainSock.sendMessage(chatId, { text }, { quoted: msg }).catch(() => {}) : null);

  const logger = pino({ level: "silent" });
  const sock = makeWASocket({
    logger,
    printQRInTerminal: false,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    version,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000
  });
  Object.assign(sock, elitePro, waUtilsModule);
  sock.activeListeners = new Map();
  sock.__isSubBot = true;
  sock.__subBotNumber = number;
  connecting.delete(number);

  sock.ev.on("creds.update", async () => { try { await saveCreds(); } catch {} });

  let codeSent = false, pairingStarted = false, announced = false;
  const attempts = ctx.attempts || 0;

  const requestPairing = async () => {
    if (codeSent || pairingStarted || state.creds.registered) return;
    pairingStarted = true;
    try {
      await sleep(3000);
      if (state.creds.registered) { pairingStarted = false; return; }
      const code = await sock.requestPairingCode(number, PAIRING_CODE);
      if (!code) throw new Error("WhatsApp لم يرجع كود اقتران.");
      codeSent = true;
      console.log(`🔑 كود ${number}: ${code}`);
      if (mainSock && chatId) await sendPairingMessage(mainSock, msg, chatId, number, code);
    } catch (e) {
      pairingStarted = false;
      console.log(`⚠️ Pairing error (${number}): ${e?.message || e}`);
    }
  };

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "connecting" && !state.creds.registered) setTimeout(() => requestPairing().catch(() => {}), 4000);
    if (connection === "open" && !state.creds.registered && !codeSent) await requestPairing();

    if (connection === "open") {
      active.set(number, sock);
      if (ctx.back && !ctx.backSent) {
        ctx.backSent = true;
        notifyBack(number, sock).catch(() => {});
      }
      pairingStarted = false;
      console.log(`🟢 بوت فرعي متصل: ${number}`);
      // أول ربط ناجح: رسالة فورية للمطورين وللرقم نفسه (حتى لو الاتصال اتعاد بعد الاقتران)
      if (ctx.announce && !ctx.announced) {
        ctx.announced = true;
        announced = true;
        announceLinked(number, sock, ctx).catch(() => {});
        if (mainSock && chatId) {
          await say(
            `╭━━〔 𝐁𝐋𝐔𝐄 𝐒𝐊𝐘 〕━━╮\n┃\n┃ ✅ *تم اتصال البوت الفرعي بنجاح*\n┃\n┃ 📱 الرقم: ${number}\n┃\n┃ 🚀 البوت يعمل الآن بشكل طبيعي.\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`
          );
          try { // فيديو دائري محفوظ (اختياري)
            const cache = path.join(process.cwd(), "ptv_archive", "ptv_1790373306103.mp4.json");
            if (fs.existsSync(cache)) {
              const ptv = JSON.parse(fs.readFileSync(cache, "utf8")); ptv.contextInfo = {};
              const m = generateWAMessageFromContent(chatId, { ptvMessage: ptv }, { userJid: mainSock.user?.id });
              await mainSock.relayMessage(chatId, m.message, { messageId: m.key.id });
            }
          } catch {}
        }
      }
    }

    if (connection === "close") {
      active.delete(number);
      pairingStarted = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`🔴 Subbot ${number} closed (${code})`);
      if (stopped.has(number)) return;

      if (code === DisconnectReason.loggedOut || code === 401 || code === 403) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        setDisabled(number, false);
        await say(`❌ تم تسجيل خروج البوت الفرعي.\n\n📱 ${number}\n\nنصّبه من جديد إذا أردت تشغيله.`);
        return;
      }
      // جلسة ما اتربطت أبداً: عدد محاولات محدود (بدل ما نكرر الكود للأبد)
      if (!state.creds.registered && attempts + 1 >= MAX_PAIR_ATTEMPTS) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        await say(`⌛ انتهت محاولات الربط للرقم ${number} بدون نجاح.\nأعد الأمر: تنصيب ${number}`);
        return;
      }
      setTimeout(() => { if (!paused && !stopped.has(number)) connect(number, { ...ctx, announce: !!ctx.announce && !ctx.announced, back: false, attempts: state.creds.registered ? 0 : attempts + 1 }).catch(() => {}); }, 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type && type !== "notify" && type !== "append") return;
    let handle;
    try { handle = (await import("../handlers/messages.js")).processMessage; } catch (e) { console.error("❌ تحميل المعالج:", e.message); return; }
    for (const m of messages) {
      try { await handle(sock, m); } catch (e) { console.error("❌ خطأ في البوت الفرعي:", e.message); }
    }
  });

  return sock;
}

// ─── واجهة الأوامر ───
export async function startSubBot(mainSock, msg, rawNumber) {
  const number = normalizeNumber(rawNumber);
  const chatId = msg?.key?.remoteJid;
  if (!chatId) return null;
  const reply = (text) => mainSock.sendMessage(chatId, { text }, { quoted: msg });

  if (!isInstallEnabled()) return reply("🔒 التنصيب متوقف حاليًا.");
  if (number.length < 7 || number.length > 15) return reply("❌ رقم غير صالح.\n\nمثال: تنصيب 201234567890");
  if (active.has(number)) return reply("⚠️ البوت الفرعي لهذا الرقم شغال بالفعل.");
  if (listSubBots().length >= MAX_SUBBOTS && !fs.existsSync(path.join(subRoot(), number))) return reply(`❌ وصلت الحد الأقصى للبوتات الفرعية (${MAX_SUBBOTS}).`);

  setDisabled(number, false);
  await reply(`⏳ جاري تجهيز البوت الفرعي للرقم:\n\n📱 ${number}\n\nانتظر قليلًا...`);
  return connect(number, { mainSock, msg, chatId, announce: true });
}

function isRegistered(number) {
  try { return !!JSON.parse(fs.readFileSync(path.join(subRoot(), number, "creds.json"), "utf8")).registered; } catch { return false; }
}

export function listSubBots() {
  let dirs = [];
  try { dirs = fs.readdirSync(subRoot(), { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d+$/.test(d.name)).map((d) => d.name); } catch {}
  const off = readState().disabled;
  return dirs.map((number) => ({ number, connected: active.has(number), disabled: off.includes(number) }));
}

export async function stopSubBot(number) {
  number = normalizeNumber(number);
  stopped.add(number);
  const s = active.get(number);
  try { s?.end?.(undefined); } catch {}
  active.delete(number);
  setDisabled(number, true);
  return true;
}

export async function resumeSubBot(mainSock, number) {
  number = normalizeNumber(number);
  if (active.has(number)) return false;
  setDisabled(number, false);
  await connect(number, { mainSock, back: true });
  return true;
}

export async function deleteSubBot(number) {
  number = normalizeNumber(number);
  stopped.add(number);
  const s = active.get(number);
  try { await s?.logout?.(); } catch { try { s?.end?.(undefined); } catch {} }
  active.delete(number);
  try { fs.rmSync(path.join(subRoot(), number), { recursive: true, force: true }); } catch {}
  setDisabled(number, false);
  return true;
}

// البوت الأساسي اتصل (أو رجع اتصل): رجّع كل الفرعية المربوطة تلقائياً مع إشعار "عاد للعمل"
export async function initSavedSubBots(mainSock) {
  paused = false;
  for (const b of listSubBots()) {
    if (b.disabled || b.connected || !isRegistered(b.number)) continue;
    try { await connect(b.number, { mainSock, back: true }); } catch (e) { console.error(`❌ فشل تشغيل ${b.number}:`, e.message); }
    await sleep(1500);
  }
}

// البوت الأساسي انفصل: وقّف الفرعية مؤقتاً (تبقى مربوطة وترجع مع الأساسي)
export async function pauseSubBots() {
  paused = true;
  for (const [n, s] of [...active]) {
    stopped.add(n);
    try { s.end?.(undefined); } catch {}
    active.delete(n);
  }
}

export const getActiveSubBotSocks = () => [...active.values()];

export default { pauseSubBots, getNotifyNumbers, setNotifyNumbers, startSubBot, listSubBots, stopSubBot, resumeSubBot, deleteSubBot, initSavedSubBots, isInstallEnabled, setInstallEnabled, getActiveSubBotSocks };
