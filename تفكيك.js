import { award as _award, awardMany as _awardMany } from "../../handlers/rewards.js";
export const BlueSky = {
  command: "تفكيك",
  description: "لعبة تفكيك الأسماء - أنمي ولاعبين كورة، أسرع واحد يفكك الاسم يفوز",
  elite: "off",
  group: true,
  prv: false,
  lock: "off"
};

const ANIME_NAMES = [
  "ناروتو", "ساسكي", "ساكورا", "كاكاشي", "ايتاتشي", "جيرايا", "تسونادي", "اوروشيمارو",
  "مادارا", "اوبيتو", "هيناتا", "نيجي", "شيكامارو", "غارا", "لوفي", "زورو",
  "نامي", "سانجي", "تشوبر", "روبن", "فرانكي", "بروك", "اوسوب", "ايس",
  "شانكس", "ليفاي", "ايرين", "ميكاسا", "ارمين", "غوكو", "فيجيتا", "بيكولو",
  "غوهان", "ترانكس", "فريزا", "سيل", "بوو", "برولي", "كريلين", "ليلوش",
  "لايت", "ريوك", "اسونا", "كيريتو", "تانجيرو", "نيزوكو", "زينيتسو", "اينوسكي",
  "غيوجرو", "ايدو"
];

const FOOTBALL_PLAYERS = [
  "ميسي", "رونالدو", "نيمار", "مبابي", "هالاند", "صلاح", "بنزيما", "مودريتش",
  "دي بروين", "لوكاكو", "غريزمان", "سواريز", "راموس", "بوسكيتس", "تشافي", "اينيستا",
  "بيكيه", "كاسياس", "بوفون", "مالديني", "زيدان", "رونالدينيو", "كاكا", "هنري",
  "بيكهام", "لامبارد", "جيرارد", "تيري", "دروغبا", "اغويرو", "دي ماريا", "مارسيلو",
  "بيليه", "مارادونا", "كرويف", "بيكنباور", "بلاتيني", "فان باستن", "شيفتشينكو", "ريكيلمي",
  "كانتي", "بوغبا", "فيرمينو", "فان دايك", "بيدري", "غافي", "بيلينغهام", "فينيسيوس",
  "رودري", "هافيرتز"
];

const ALL_NAMES = [...ANIME_NAMES, ...FOOTBALL_PLAYERS];
const ROUND_TIME_MS = 60000;

const activeGames = new Map(); // chatId -> { answer, expected, timer }

function splitLetters(word) {
  return word.split("").join(" ");
}

function normalizeSpaces(str) {
  return str.replace(/\s+/g, " ").trim();
}

function bind(sock) {
  if (sock.__unscrambleBound) return;
  sock.__unscrambleBound = true;

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      try {
        const chatId = m.key?.remoteJid;
        if (!chatId || !chatId.endsWith("@g.us") || !m.message) continue;

        const game = activeGames.get(chatId);
        if (!game) continue;

        // ملاحظة: مفيش تجاهل لرسائل fromMe هنا، عشان المطور شغال بنفس رقم البوت (self-bot)
        // ولو تجاهلناها هتتجاهل إجابته هو كمان.

        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          "";
        if (!text) continue;

        if (normalizeSpaces(text) === game.expected) {
          clearTimeout(game.timer);
          activeGames.delete(chatId);

          const winner = m.key.participant || m.key.remoteJid;
          await _award(sock, chatId, winner, "تفكيك");
          await sock.sendMessage(
            chatId,
            {
              text:
                `🏆 *برافو!*\n` +
                `الاسم كان: *${game.expected}*\n` +
                `الفايز: @${winner.split("@")[0]}`,
              mentions: [winner]
            }
          );
        }
      } catch (e) {
        console.error("[UNSCRAMBLE]", e);
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

  if (activeGames.has(chatId)) {
    return sock.sendMessage(
      chatId,
      { text: "⚠️ في لعبة تفكيك شغالة بالفعل في الجروب ده، جاوب عليها الأول." },
      { quoted: msg }
    );
  }

  const answer = ALL_NAMES[Math.floor(Math.random() * ALL_NAMES.length)];
  const expected = normalizeSpaces(splitLetters(answer));

  const timer = setTimeout(async () => {
    if (activeGames.get(chatId)?.answer === answer) {
      activeGames.delete(chatId);
      try {
        await sock.sendMessage(chatId, { text: `⌛ خلص الوقت! محدش عرف يفكك الاسم.\nالإجابة كانت: *${expected}*` });
      } catch {}
    }
  }, ROUND_TIME_MS);

  activeGames.set(chatId, { answer, expected, timer });

  return sock.sendMessage(
    chatId,
    {
      text:
        `🧩 *لعبة تفكيك!*\n\n` +
        `📌فكك كلمة: *${answer}*\n\n` +
        `⏱️ عندكم دقيقة واحدة!`
    },
    { quoted: msg }
  );
}

export default { BlueSky, execute };
