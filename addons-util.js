// أدوات مشتركة لأوامر "اضافات" (ليست أمرًا، لذلك خارج مجلد plugins)
export const FLAGS = { elite: "off", lock: "off", group: false, prv: false, bluesky: "on" };

export const replier = (sock, msg) => (text, extra = {}) =>
  sock.sendMessage(msg.key.remoteJid, { text, ...extra }, { quoted: msg });

// نص الإدخال: من الأرغومنتس أو من الرسالة المردود عليها
export function inputText(msg, args) {
  const typed = (args || []).join(" ").trim();
  if (typed) return typed;
  const q = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  return (q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || "").trim();
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const frame = (title, lines) =>
  `╭━━〔 ${title} 〕━━╮\n┃\n${lines.map((l) => `┃ ${l}`).join("\n")}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`;
