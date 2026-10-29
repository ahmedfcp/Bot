import { award as _award, awardMany as _awardMany } from "../../handlers/rewards.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import { generateWAMessageContent, generateWAMessageFromContent, proto } from "@whiskeysockets/baileys";

export const BlueSky = {
  command: ["احزر", "احزري", "اوبيتو"],
  description: "لعبة احزر شخصية أنمي بالأزرار - محاولتين، 500XP",
  elite: "off",
  group: true,
  prv: false,
  lock: "off"
};

const TIMEOUT_MS = 60000;
const DATA_URL = "https://gist.githubusercontent.com/Kyutaka101/98d564d49cbf9b539fee19f744de7b26/raw/f2a3e68bbcdd2b06f9dbd5f30d70b9fda42fec14/guessflag";
const DB_PATH = path.join(process.cwd(), "data", "guess_scores.json");

const activeGuess = {}; // chatId -> { correctAnswer, attempts, timer }

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

function loadProfiles() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch { return {}; }
}
function saveProfiles(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function extractAnswerChoice(m) {
  const templateId = m.message?.templateButtonReplyMessage?.selectedId;
  if (templateId?.startsWith("GUESS_")) return templateId.slice(6);
  return null;
}

function buildInteractiveNodes(chatId) {
  const nodes = [
    {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "interactive",
          attrs: { type: "native_flow", v: "1" },
          content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" }, content: [] }]
        }
      ]
    }
  ];
  if (!chatId.endsWith("@g.us")) {
    nodes.push({ tag: "bot", attrs: { biz_bot: "1" }, content: [] });
  }
  return nodes;
}

function bind(sock) {
  if (sock.__guessGameBound) return;
  sock.__guessGameBound = true;

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      try {
        const chatId = m.key?.remoteJid;
        if (!chatId || !chatId.endsWith("@g.us") || !m.message) continue;

        const game = activeGuess[chatId];
        if (!game) continue;

        const chosen = extractAnswerChoice(m);
        if (!chosen) continue;

        const sender = m.key.participant || m.key.remoteJid;
        const isCorrect = chosen === game.correctAnswer;

        if (isCorrect) {
          await _award(sock, chatId, sender, "احزر");
          clearTimeout(game.timer);
          delete activeGuess[chatId];

          const profiles = loadProfiles();
          if (!profiles[sender]) profiles[sender] = { xp: 0 };
          profiles[sender].xp += 500;
          saveProfiles(profiles);

          await sock.sendMessage(chatId, {
            text: `*👑 تنغن للألعاب 👑*\n*_🎉 مبروك يا ملك! إجابة صحيحة!_* 🎉\n*💰 الجائزة: 500xp*\n*══════ • 🏆 • ══════*`
          });
        } else {
          game.attempts -= 1;
          if (game.attempts > 0) {
            await sock.sendMessage(chatId, {
              text: `*👑 تنغن للألعاب 👑*\n*_❌ إجابة خاطئة! المحاولات المتبقية: ${game.attempts} 📯_*`
            });
          } else {
            clearTimeout(game.timer);
            const ans = game.correctAnswer;
            delete activeGuess[chatId];
            await sock.sendMessage(chatId, {
              text: `*👑 تنغن للألعاب 👑*\n*_💔 انتهت محاولاتك!_* 📍\n*💡 الإجابة الصحيحة: ${ans}*\n*══════ • 🏆 • ══════*`
            });
          }
        }
      } catch (e) {
        console.error("[احزر]", e);
      }
    }
  });
}

async function execute({ sock, msg }) {
  const chatId = msg.key.remoteJid;
  bind(sock);

  try {
    if (activeGuess[chatId]) {
      return sock.sendMessage(chatId, {
        text: "*👑 تنغن للألعاب 👑*\n*_❌ لا يمكنك بدء لعبة جديدة. جولة نشطة بالفعل._*"
      }, { quoted: msg });
    }

    const { data } = await axios.get(DATA_URL, { timeout: 15000 });
    if (!data || data.length === 0) {
      return sock.sendMessage(chatId, {
        text: "*👑 تنغن للألعاب 👑*\n*فشل الحصول على بيانات اللعبة. المصدر فارغ 🪨*"
      }, { quoted: msg });
    }

    const item = data[Math.floor(Math.random() * data.length)];
    const { img, name } = item;

    let options = [name];
    while (options.length < 4) {
      const randomItem = data[Math.floor(Math.random() * data.length)].name;
      if (!options.includes(randomItem)) options.push(randomItem);
    }
    options = shuffle(options);

    const { imageMessage } = await generateWAMessageContent(
      { image: { url: img } },
      { upload: sock.waUploadToServer }
    );

    const buttons = options.map((option, index) => ({
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({
        display_text: `┊${index + 1}┊ ${option}`,
        id: `GUESS_${option}`
      })
    }));

    const generated = generateWAMessageFromContent(
      chatId,
      {
        interactiveMessage: proto.Message.InteractiveMessage.create({
          header: proto.Message.InteractiveMessage.Header.fromObject({
            title: "اختر اسم الشخصية الصحيح ⇊",
            hasMediaAttachment: true,
            imageMessage
          }),
          body: proto.Message.InteractiveMessage.Body.create({
            text: `*👑 تنغن للألعاب 👑*\n*_🎭 لعبة احزر شخصية أنمي من صورتها._*\n\n*⏱️ الوقت: ${TIMEOUT_MS / 1000} ثانية*\n*💰 الجائزة: 500xp*\n*⚔️ المحاولات: 2 فقط*\n*════ • 🏆 • ════*`
          }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: "BY: BLUE SKY 👑" }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
        })
      },
      { quoted: msg }
    );

    await sock.relayMessage(chatId, generated.message, {
      messageId: generated.key.id,
      additionalNodes: buildInteractiveNodes(chatId)
    });

    activeGuess[chatId] = {
      correctAnswer: name,
      attempts: 2,
      timer: setTimeout(async () => {
        if (activeGuess[chatId]) {
          delete activeGuess[chatId];
          await sock.sendMessage(chatId, {
            text: `*👑 تنغن للألعاب 👑*\n*⌛ انتهى الوقت!* \n*💡 الإجابة الصحيحة: ${name}*\n*══════ • 🏆 • ══════*`
          });
        }
      }, TIMEOUT_MS)
    };

  } catch (e) {
    console.error("[احزر]", e);
    await sock.sendMessage(chatId, {
      text: "*👑 تنغن للألعاب 👑*\n*❌ فشل بدء اللعبة. تأكد من رابط المصدر.*"
    }, { quoted: msg });
  }
}

export default { BlueSky, execute };
