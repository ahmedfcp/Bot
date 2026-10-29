import { award as _award, awardMany as _awardMany } from "../../handlers/rewards.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import { generateWAMessageContent, generateWAMessageFromContent, proto } from "@whiskeysockets/baileys";

export const BlueSky = {
  command: ["علم", "country"],
  description: "لعبة خمن العلم بالأزرار - 100XP و2 كوكيز",
  elite: "off",
  group: true,
  prv: false,
  lock: "off"
};

const DATA_URL = "https://gist.githubusercontent.com/Kyutaka101/799d5646ceed992bf862026847473852/raw/dcbecff259b1d94615d7c48079ed1396ed42ef67/gistfile1.txt";
const DB_PATH = path.join(process.cwd(), "data", "flag_scores.json");

const gameActive = {}; // chatId -> { answer, timer }

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
  if (templateId?.startsWith("FLAG_")) return templateId.slice(5);
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
  if (sock.__flagGameBound) return;
  sock.__flagGameBound = true;

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      try {
        const chatId = m.key?.remoteJid;
        if (!chatId || !chatId.endsWith("@g.us") || !m.message) continue;

        const game = gameActive[chatId];
        if (!game) continue;

        const chosen = extractAnswerChoice(m);
        if (!chosen) continue;

        const sender = m.key.participant || m.key.remoteJid;
        clearTimeout(game.timer);
        delete gameActive[chatId];

        if (chosen === game.answer) {
          await _award(sock, chatId, sender, "علم");
          const profiles = loadProfiles();
          if (!profiles[sender]) profiles[sender] = { xp: 0, cookies: 0 };
          profiles[sender].xp += 100;
          profiles[sender].cookies += 2;
          saveProfiles(profiles);

          await sock.sendMessage(chatId, {
            image: { url: game.image },
            caption: `🎉 *صحيح صحيح* عاش جبت اسم العلم صح *100XP & 2 cookies*\n💡 هل هتعرف تكمل؟\n\n> اكتب *علم* عشان تلعب تاني`
          });
        } else {
          await sock.sendMessage(chatId, { text: `*❌ غلط!* الإجابة الصح كانت: *${game.answer}*` });
        }
      } catch (e) {
        console.error("[علم]", e);
      }
    }
  });
}

async function execute({ sock, msg }) {
  const chatId = msg.key.remoteJid;
  bind(sock);

  try {
    if (gameActive[chatId]) {
      return sock.sendMessage(chatId, { text: "⚠️ في سؤال شغال بالفعل، جاوب عليه الأول." }, { quoted: msg });
    }

    const { data } = await axios.get(DATA_URL, { timeout: 15000 });
    const country = data[Math.floor(Math.random() * data.length)];

    let options = [country.name];
    while (options.length < 4) {
      const randomItem = data[Math.floor(Math.random() * data.length)].name;
      if (!options.includes(randomItem)) options.push(randomItem);
    }
    options = shuffle(options);

    const { imageMessage } = await generateWAMessageContent(
      { image: { url: country.img } },
      { upload: sock.waUploadToServer }
    );

    const buttons = options.map((name) => ({
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({ display_text: name, id: `FLAG_${name}` })
    }));

    const generated = generateWAMessageFromContent(
      chatId,
      {
        interactiveMessage: proto.Message.InteractiveMessage.create({
          header: proto.Message.InteractiveMessage.Header.fromObject({
            title: "🌍 خمن العلم",
            hasMediaAttachment: true,
            imageMessage
          }),
          body: proto.Message.InteractiveMessage.Body.create({ text: "دوس على اسم الدولة الصح 👇" }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: "⏱️ عندك 30 ثانية" }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
        })
      },
      { quoted: msg }
    );

    await sock.relayMessage(chatId, generated.message, {
      messageId: generated.key.id,
      additionalNodes: buildInteractiveNodes(chatId)
    });

    gameActive[chatId] = {
      answer: country.name,
      image: country.img,
      timer: setTimeout(async () => {
        if (gameActive[chatId]) {
          const answer = gameActive[chatId].answer;
          delete gameActive[chatId];
          await sock.sendMessage(chatId, { text: `⏰ *أنتهى الوقت* الإجابة هي: *${answer}*` });
        }
      }, 30000)
    };

  } catch (e) {
    console.error("[علم]", e);
    await sock.sendMessage(chatId, { text: "❌ فشل بدء اللعبة." }, { quoted: msg });
  }
}

export default { BlueSky, execute };
