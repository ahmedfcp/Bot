import { award as _award, awardMany as _awardMany } from "../../handlers/rewards.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import { generateWAMessageContent, generateWAMessageFromContent, proto } from "@whiskeysockets/baileys";

export const BlueSky = {
  command: ["عين", "eye"],
  description: "لعبة تخمين شخصية الأنمي من الصورة بأزرار سريعة تحت الصورة - 10 جولات",
  elite: "off",
  group: true,
  prv: false,
  lock: "off"
};

const MAX_ROUNDS = 10;
const CHAR_DATA_URL = "https://raw.githubusercontent.com/fjfilhfjjg-boop/Pomni-AI/refs/heads/main/%D8%B9%D9%8A%D9%86.md";
const DB_PATH = path.join(process.cwd(), "data", "eye_scores.json");

const NAMES = [
  "ايرين","نيزوكو","سوكونا","موازن","كيلوا","غون","ايتاتشي","ساسكي","دابي","اوبيتو",
  "نوبارا","ليفاي","يوتا","فريدا","شيده","ياماتو","نامي","ايمو","انيا","جينبي",
  "بوروتو","شانكس","لاو","لوفي","زورو","اكازا","ميكاسا","رين","دوما","كانيكي",
  "غوجو","ساي","نيجي","انمي","ساكورا","اوريتشمارو","ماهيتو","جيرايا","روبين",
  "سانجي","ميهوك","كايدو","مايكي","كورابيكا","شيغاراكي","تينغن","تانجيرو",
  "ميدوريا","كونان","الكيورا","شوتو","غاتارو","بارو","غارا","باكوغو","ماكيما",
  "توجا","باين","كوراما"
];

const gameEye = {};

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

function getPrize(rank) {
  if (rank === 0) return { xp: 500, cookies: 10, emoji: "🎉" };
  if (rank === 1) return { xp: 300, cookies: 5, emoji: "🎖" };
  return { xp: 100, cookies: 2, emoji: "⭐" };
}

function loadProfiles() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch { return {}; }
}
function saveProfiles(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// 🔑 الشكل الحقيقي لرد أزرار quick_reply عندك: templateButtonReplyMessage.selectedId
function extractAnswerChoice(m, validOptions) {
  const templateId = m.message?.templateButtonReplyMessage?.selectedId;
  if (templateId?.startsWith("ANS_")) return templateId.slice(4);

  const paramsJson = m.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (paramsJson) {
    try {
      const parsed = JSON.parse(paramsJson);
      if (parsed?.id?.startsWith("ANS_")) return parsed.id.slice(4);
    } catch {}
  }

  const btnId = m.message?.buttonsResponseMessage?.selectedButtonId;
  if (btnId?.startsWith("ANS_")) return btnId.slice(4);

  const listId = m.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
  if (listId?.startsWith("ANS_")) return listId.slice(4);

  const text = (m.message?.conversation || m.message?.extendedTextMessage?.text || "").trim();
  if (validOptions.includes(text)) return text;

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

async function sendQuestion(sock, chatId, roundNum, img, opts) {
  const { imageMessage } = await generateWAMessageContent(
    { image: { url: img } },
    { upload: sock.waUploadToServer }
  );

  const buttons = opts.map((name) => ({
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({ display_text: name, id: `ANS_${name}` })
  }));

  const generated = generateWAMessageFromContent(
    chatId,
    {
      interactiveMessage: proto.Message.InteractiveMessage.create({
        header: proto.Message.InteractiveMessage.Header.fromObject({
          title: `👁 خمن الشخصية (${roundNum}/${MAX_ROUNDS})`,
          hasMediaAttachment: true,
          imageMessage
        }),
        body: proto.Message.InteractiveMessage.Body.create({ text: "دوس على اسم الشخصية الصح 👇" }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: "⏱️ عندك 30 ثانية" }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
      })
    },
    {}
  );

  await sock.relayMessage(chatId, generated.message, {
    messageId: generated.key.id,
    additionalNodes: buildInteractiveNodes(chatId)
  });

  return generated.key;
}

async function startRound(sock, chatId) {
  const g = gameEye[chatId];
  g.round++;

  const { data } = await axios.get(CHAR_DATA_URL, { timeout: 15000 });
  const char = data[Math.floor(Math.random() * data.length)];

  const wrong = shuffle(NAMES.filter((n) => n !== char.name)).slice(0, 3);
  const opts = shuffle([char.name, ...wrong]);

  const key = await sendQuestion(sock, chatId, g.round, char.img, opts);

  g.current = {
    answer: char.name,
    opts,
    id: key.id,
    timer: setTimeout(async () => {
      if (gameEye[chatId]?.current) {
        const ans = gameEye[chatId].current.answer;
        gameEye[chatId].current = null;
        await sock.sendMessage(chatId, { text: `⏰ الوقت انتهى! الإجابة: *${ans}*\nاكتب "عين" للبدء من جديد` });
      }
    }, 30000)
  };
}

function bind(sock) {
  if (sock.__eyeGameBound) return;
  sock.__eyeGameBound = true;

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      try {
        const chatId = m.key?.remoteJid;
        if (!chatId || !chatId.endsWith("@g.us") || !m.message) continue;

        const g = gameEye[chatId];
        if (!g?.current) continue;

        const cur = g.current;
        const chosen = extractAnswerChoice(m, cur.opts);
        if (!chosen) continue;

        const sender = m.key.participant || m.key.remoteJid;

        clearTimeout(cur.timer);
        g.current = null;

        if (chosen === cur.answer) {
          await _award(sock, chatId, sender, "عين");
          g.scores[sender] = (g.scores[sender] || 0) + 1;
          await sock.sendMessage(chatId, {
            text: `✅ صح! عندك ${g.scores[sender]} نقطة\nانتظر الجولة القادمة...`,
            mentions: [sender]
          });
          setTimeout(() => startRound(sock, chatId).catch((e) => console.error("[عين]", e)), 1500);
        } else {
          await sock.sendMessage(chatId, {
            text: `❌ غلط يا @${sender.split("@")[0]}`,
            mentions: [sender]
          });
          gameEye[chatId].current = cur;
          gameEye[chatId].current.timer = setTimeout(async () => {
            if (gameEye[chatId]?.current) {
              const ans = gameEye[chatId].current.answer;
              gameEye[chatId].current = null;
              await sock.sendMessage(chatId, { text: `⏰ الوقت انتهى! الإجابة: *${ans}*\nاكتب "عين" للبدء من جديد` });
            }
          }, 30000);
        }
      } catch (e) {
        console.error("[عين]", e);
      }
    }
  });
}

async function execute({ sock, msg }) {
  const chatId = msg.key.remoteJid;
  bind(sock);

  if (!chatId.endsWith("@g.us")) {
    return sock.sendMessage(chatId, { text: "❌ الأمر ده للجروبات فقط." }, { quoted: msg });
  }

  try {
    const g = gameEye[chatId];

    if (g?.current) {
      return sock.sendMessage(chatId, { text: "⚠️ في سؤال شغال بالفعل، جاوب عليه الأول." }, { quoted: msg });
    }

    if (!g || g.round >= MAX_ROUNDS) {
      if (g) {
        const sorted = Object.entries(g.scores).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
          const profiles = loadProfiles();
          const prizes = [];

          sorted.forEach(([jid, score], i) => {
            const prize = getPrize(i);
            if (!profiles[jid]) profiles[jid] = { xp: 0, cookies: 0 };
            profiles[jid].xp += prize.xp;
            profiles[jid].cookies += prize.cookies;
            prizes.push(`${prize.emoji} @${jid.split("@")[0]} - ${score} نقطة (+${prize.xp}xp)`);
          });

          saveProfiles(profiles);

          await sock.sendMessage(chatId, {
            text: `🏆 *انتهت اللعبة*\n\n${prizes.join("\n")}`,
            mentions: sorted.map((s) => s[0])
          });
        }
      }
      gameEye[chatId] = { round: 0, scores: {}, current: null };
    }

    await startRound(sock, chatId);

  } catch (e) {
    console.error("[عين]", e);
    await sock.sendMessage(chatId, { text: "❌ حصل خطأ أثناء تشغيل اللعبة." }, { quoted: msg });
  }
}

export default { BlueSky, execute };
