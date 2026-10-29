import { award as _award, awardMany as _awardMany } from "../../handlers/rewards.js";
export const BlueSky = {
  command: "تجميع",
  description: "لعبة تجميع الحروف - البوت يبعت حروف مبعثرة وأسرع واحد يجمعها يفوز",
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

const activeGames = new Map(); // chatId -> { answer, expected, scrambled, timer }

function normalizeSpaces(str) {
  return str.replace(/\s+/g, " ").trim();
}

function shuffleWord(word) {
  const letters = word.replace(/\s+/g, "").split("");
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const shuffledJoined = letters.join("");

  // لو التقليب طلع نفس ترتيب الكلمة الأصلية بالصدفة، نعيد التقليب
  if (shuffledJoined === word.replace(/\s+/g, "") && letters.length > 1) {
    return shuffleWord(word);
  }
  return letters.join(" ");
}

function bind(sock) {
  if (sock.__assembleBound) return;
  sock.__assembleBound = true;

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      try {
        const chatId = m.key?.remoteJid;
        if (!chatId || !chatId.endsWith("@g.us") || !m.message) continue;

        const game = activeGames.get(chatId);
        if (!game) continue;

        // مفيش تجاهل لرسائل fromMe عشان المطور شغال بنفس رقم البوت (self-bot)

        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          "";
        if (!text) continue;

        if (normalizeSpaces(text) === game.expected) {
          clearTimeout(game.timer);
          activeGames.delete(chatId);

          const winner = m.key.participant || m.key.remoteJid;
          await _award(sock, chatId, winner, "تجميع");
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
        console.error("[ASSEMBLE]", e);
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
      { text: "⚠️ في لعبة تجميع شغالة بالفعل في الجروب ده، جاوب عليها الأول." },
      { quoted: msg }
    );
  }

  const answer = ALL_NAMES[Math.floor(Math.random() * ALL_NAMES.length)];
  const expected = normalizeSpaces(answer);
  const scrambled = shuffleWord(answer);

  const timer = setTimeout(async () => {
    if (activeGames.get(chatId)?.answer === answer) {
      activeGames.delete(chatId);
      try {
        await sock.sendMessage(chatId, { text: `⌛ خلص الوقت! محدش عرف يجمع الاسم.\nالإجابة كانت: *${expected}*` });
      } catch {}
    }
  }, ROUND_TIME_MS);

  activeGames.set(chatId, { answer, expected, scrambled, timer });

  return sock.sendMessage(
    chatId,
    {
      text:
        `🧩 *لعبة تجميع!*\n\n` +
        `📌جمع الحروف دي وطلعلي الاسم:\n\n` +
        `👉 *${scrambled}*\n\n` +
        `⏱️ عندكم دقيقة واحدة!`
    },
    { quoted: msg }
  );
}

export default { BlueSky, execute };
