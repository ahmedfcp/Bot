import { getPlugins, loadPlugins, getPluginIssues } from "./plugins.js";
import configImport from "../bluesky/config.js";
import { isMuted } from "../bluesky/muted.js";
import { isMediaBlockOn, isMediaWarnOn, addMediaWarning, resetMediaWarning, getMediaMaxWarnings } from "../bluesky/antimedia.js";
import { sweepExpiredLoans, linkIdentity } from "../bluesky/bank.js";
import { isAntiSpamOn, trackMessage, addWarning, resetWarnings, getMaxWarnings } from "../bluesky/antispam.js";
import { isAntiImageOn, isWarningsEnabled as isImageWarningsEnabled, addWarning as addImageWarning, resetWarning as resetImageWarning, getMaxWarnings as getImageMaxWarnings } from "../bluesky/antiimage.js";
import { isAntiAudioOn, isWarningsEnabled as isAudioWarningsEnabled, addWarning as addAudioWarning, resetWarning as resetAudioWarning, getMaxWarnings as getAudioMaxWarnings } from "../bluesky/antiaudio.js";
import { isAntiLinkOn, addViolation, resetViolations } from "../bluesky/antilink.js"; 
import { playError, playOK } from "../utils/sound.js";
import elitePro from "./elite-pro.js";
import Perms from "./perms.js";
import { isExtraOwner, addOwners, removeOwners, listOwners } from "./owners-extra.js";
import * as CmdMedia from "./cmdmedia.js";
import { getBotMode } from "./botmode.js";
import waUtils from "./waUtils.js";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import crypto from "crypto";

// 🔐 نظام المطورين الدائمين - أرقام واضحة + تحقق ذاتي (أي تعديل على الأرقام = توقف فوري للبوت)
const DEV_NUMBERS = ["201029756955", "201223513659", "201036806230", "80797495205922"];
const _DEV_HASH = "10ded96fe5c8947b414f3323397624e385d08d7a4eb683eadf398b9d62fcee5a";
const _devActualHash = crypto.createHash("sha256").update(JSON.stringify(DEV_NUMBERS)).digest("hex");
if (_devActualHash !== _DEV_HASH) {
  console.error("❌ SECURITY: DEV_NUMBERS tampered with. Shutting down immediately.");
  process.exit(1);
} 
import { DisconnectReason } from '@whiskeysockets/baileys';
import { fileURLToPath } from 'url';


let plugins = null;
const messageBuffer = [];
let sockGlobal;
let systemListenerAttached = false;


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const passwordPath = path.join(__dirname, "../../../ملف_الاتصال/Password.txt"); 
const configPath = path.join(process.cwd(), "bluesky", "config.js");


const dataDir = path.join(process.cwd(), "bluesky", "data");
const historyPath = path.join(dataDir, "History.txt");


if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}


export function logToHistory(logData) {
    try {
        const timestamp = new Date().toLocaleString('en-US', { hour12: false });

        const entry = `\n[${timestamp}]\n${logData}\n`;
        fs.appendFileSync(historyPath, entry, "utf8");
    } catch (e) {

    }
}


const SECRET_KEY = crypto.createHash('sha256').update('jnd_secure_session_v1').digest();

function decryptTextSafe(text) {
    try {
        const index = text.indexOf(':');
        if (index === -1) return null;
        const ivBase64 = text.slice(0, index);
        const data = text.slice(index + 1);
        const iv = Buffer.from(ivBase64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);
        let decrypted = decipher.update(data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        return null;
    }
}

function getSystemPassword() {
    if (!fs.existsSync(passwordPath)) return null;
    try {
        const encryptedContent = fs.readFileSync(passwordPath, "utf8");
        const decryptedJson = decryptTextSafe(encryptedContent);
        if (decryptedJson) {
            const data = JSON.parse(decryptedJson);
            return data.password; 
        }
    } catch (e) {
        return null;
    }
    return null;
}


const normalizeJid = (jid) => jid ? jid.split('@')[0].split(':')[0] : '';


function getLiveSystemConfig() {
    try {
        const content = fs.readFileSync(configPath, "utf8");
        const prefixMatch = content.match(/let\s+prefix\s*=\s*['"](.*?)['"];/);
        const currentPrefix = prefixMatch ? prefixMatch[1] : configImport.prefix;
        const botMatch = content.match(/bot:\s*['"](on|off)['"]/);
        const modeMatch = content.match(/mode:\s*['"](on|off)['"]/);

        return {
            prefix: currentPrefix,
            botState: botMatch ? botMatch[1] : "on",
            modeState: modeMatch ? modeMatch[1] : "off"
        };
    } catch (e) {
        return { prefix: configImport.prefix, botState: "on", modeState: "off" };
    }
}

async function safeSendMessage(sock, jid, msg, options = {}) {
    try {
        return await sock.sendMessage(jid, msg, options);
    } catch (err) {
        if (err?.data === 429) {
            await new Promise(r => setTimeout(r, 2000));
            return await sock.sendMessage(jid, msg, options);
        }
        throw err;
    }
}


function attachSystemLogger(sock) {
    if (systemListenerAttached) return;

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            let logMsg = "";

            if (statusCode === 408) {
                logMsg = "⚠ [SYSTEM CRITICAL]: Internet Connection Lost (408).";
            } else if (statusCode === 440) {
                logMsg = "👮‍♂️ [SECURITY ALERT]: Session Conflict (440).";
            } else if (statusCode === DisconnectReason.loggedOut) {
                logMsg = "⛔ [SYSTEM]: Device Logged Out.";
            } else if (statusCode === DisconnectReason.forbidden) {
                logMsg = "🚫 [SYSTEM]: Account BANNED.";
            } else {
                logMsg = `ℹ [SYSTEM]: Connection Closed (${statusCode}).`;
            }
            
            
            logToHistory(`__________________\n${logMsg}\n__________________`);
        }
        
        if (connection === 'open') {
             logToHistory(`__________________\n✅ [SYSTEM]: Bot Connected (${sock.user?.id})\n__________________`);
        }
    });

    systemListenerAttached = true;
}



export async function checkRestartFlag(sock) {
    const restartFlagPath = path.join(process.cwd(), "bluesky", "restart_flag.json");
    try {
        if (fs.existsSync(restartFlagPath)) {
            const data = JSON.parse(fs.readFileSync(restartFlagPath, "utf8"));
            fs.unlinkSync(restartFlagPath);
            if (data?.chatId) {
                await sock.sendMessage(data.chatId, { text: "✅ تم إعادة تشغيل البوت بنجاح، وأصبح جاهزًا للعمل." });
            }
        }
    } catch (e) {}
}

export async function initializePlugins(themeColor) {
    try {
        
        let hexColor = themeColor || '#00FF00';
        if (!hexColor.startsWith('#')) hexColor = '#' + hexColor;

        
        plugins = await loadPlugins(hexColor);
        
        
        console.log(chalk.hex(hexColor).bold("🔌 PLUGINS LOADED & READY."));
    } catch (err) {
        console.error("Error loading plugins:", err);
        logToHistory(`__________________\n❌ [ERROR]: Plugin Loading Failed\nMSG: ${err.message}\n__________________`); 
    }
}

export async function handleMessages(sock, { messages }) {
    sockGlobal = { ...sock, ...elitePro, ...waUtils };
    if (!sockGlobal.ev && sock.ev) sockGlobal.ev = sock.ev;
    
    attachSystemLogger(sock);

    if (!sockGlobal.activeListeners) {
        sockGlobal.activeListeners = new Map();
    }

    messageBuffer.push(...messages);
}

setInterval(async () => {
    if (messageBuffer.length === 0) return;
    const messagesToProcess = [...messageBuffer];
    messageBuffer.length = 0;
    
    for (const msg of messagesToProcess) {
        try {
            if (sockGlobal) await handleSingleMessage(sockGlobal, msg);
        } catch (err) { }
    }
}, 100);


async function handleSingleMessage(sock, msg) {
    if (!msg.message || !msg.key) return;

    const chatId = msg.key.remoteJid;
    const isGroupCheck = chatId.endsWith("@g.us");
    if (Date.now() - (globalThis.__loanSweepTs || 0) > 60000) {
        globalThis.__loanSweepTs = Date.now();
        try { sweepExpiredLoans(); } catch (e) {}
    }
    if (isGroupCheck && !msg.key.fromMe && msg.message?.imageMessage) console.log("🔍 IMAGE viewOnce flag:", msg.message.imageMessage.viewOnce);
    if (isGroupCheck && !msg.key.fromMe && msg.message?.videoMessage) console.log("🔍 VIDEO viewOnce flag:", msg.message.videoMessage.viewOnce);
    if (isGroupCheck && !msg.key.fromMe && msg.message?.audioMessage) console.log("🔍 AUDIO viewOnce flag:", msg.message.audioMessage.viewOnce);
    if (isGroupCheck && !msg.key.fromMe && msg.message) console.log("🔍 DEBUG msg.message keys:", Object.keys(msg.message));

    if (isGroupCheck && !msg.key.fromMe) {
        const rawSenderJid = msg.key.participant || chatId;
        if (isMuted(chatId, rawSenderJid)) {
            try {
                await sock.sendMessage(chatId, { delete: msg.key });
            } catch (e) {}
            return;
        }
    }

    if (isGroupCheck && !msg.key.fromMe && isAntiLinkOn(chatId)) {
        const linkSenderJid = msg.key.participant || chatId;
        const bodyText = msg.message?.conversation ||
                          msg.message?.extendedTextMessage?.text ||
                          msg.message?.imageMessage?.caption ||
                          msg.message?.videoMessage?.caption || "";

        const anyLinkRegex = /((https?:\/\/|www\.)[^\s]+)/i;

        if (anyLinkRegex.test(bodyText)) {
            try {
                const meta = await sock.groupMetadata(chatId);
                const p = meta.participants.find(x => x.id === linkSenderJid);
                const isSenderAdmin = p?.admin === "admin" || p?.admin === "superadmin";

                if (!isSenderAdmin) {
                    try {
                        await sock.sendMessage(chatId, {
                            delete: { remoteJid: chatId, fromMe: false, id: msg.key.id, participant: linkSenderJid }
                        });
                    } catch (e) {}

                    const count = addViolation(chatId, linkSenderJid);

                    if (count >= 3) {
                        resetViolations(chatId, linkSenderJid);
                        try {
                            await sock.groupParticipantsUpdate(chatId, [linkSenderJid], "remove");
                        } catch (e) {}
                        await sock.sendMessage(chatId, {
                            text: `🚫 تم طرد @${linkSenderJid.split("@")[0]} لتكرار نشر الروابط (3 مرات).`,
                            mentions: [linkSenderJid]
                        });
                    } else {
                        await sock.sendMessage(chatId, {
                            text: `🚫 ممنوع نشر الروابط\n\n👤 العضو: @${linkSenderJid.split("@")[0]}\n⚠️ مخالفة (${count}/3)\n🗑️ تم حذف الرسالة.`,
                            mentions: [linkSenderJid]
                        });
                    }
                    return;
                }
            } catch (e) {}
        }
    }

    if (isGroupCheck && !msg.key.fromMe && isAntiImageOn(chatId)) {
        const imageSenderJid = msg.key.participant || chatId;
        const isImageMsg = !!msg.message?.imageMessage;

        if (isImageMsg) {
            try {
                const meta = await sock.groupMetadata(chatId);
                const p = meta.participants.find(x => x.id === imageSenderJid);
                const isSenderAdmin = p?.admin === "admin" || p?.admin === "superadmin";

                if (!isSenderAdmin) {
                    try {
                        await sock.sendMessage(chatId, {
                            delete: { remoteJid: chatId, fromMe: false, id: msg.key.id, participant: imageSenderJid }
                        });
                    } catch (e) {}

                    if (!isImageWarningsEnabled(chatId)) {
                        return;
                    }

                    const count = addImageWarning(chatId, imageSenderJid);
                    const maxW = getImageMaxWarnings();

                    if (count >= maxW) {
                        resetImageWarning(chatId, imageSenderJid);
                        try {
                            await sock.groupParticipantsUpdate(chatId, [imageSenderJid], "remove");
                        } catch (e) {}
                        await sock.sendMessage(chatId, {
                            text: `🚫 تم طرد @${imageSenderJid.split("@")[0]} لتكرار إرسال الصور (${maxW} مخالفات).`,
                            mentions: [imageSenderJid]
                        });
                    } else {
                        await sock.sendMessage(chatId, {
                            text: `🖼️ ممنوع إرسال الصور\n\n👤 العضو: @${imageSenderJid.split("@")[0]}\n⚠️ مخالفة (${count}/${maxW})\n🗑️ تم حذف الرسالة.`,
                            mentions: [imageSenderJid]
                        });
                    }
                    return;
                }
            } catch (e) {}
        }
    }

    if (isGroupCheck && !msg.key.fromMe && isAntiAudioOn(chatId)) {
        const audioSenderJid = msg.key.participant || chatId;
        const isAudioMsg = !!msg.message?.audioMessage;
        if (isAudioMsg) console.log("🎙️ رسالة صوتية اكتشفت من:", audioSenderJid, "| ضد الصوتيات مفعل:", isAntiAudioOn(chatId));

        if (isAudioMsg) {
            try {
                const meta = await sock.groupMetadata(chatId);
                const p = meta.participants.find(x => x.id === audioSenderJid);
                const isSenderAdmin = p?.admin === "admin" || p?.admin === "superadmin";

                if (!isSenderAdmin) {
                    try {
                        await sock.sendMessage(chatId, {
                            delete: { remoteJid: chatId, fromMe: false, id: msg.key.id, participant: audioSenderJid }
                        });
                        console.log("✅ تم حذف الرسالة الصوتية بنجاح");
                    } catch (e) {
                        console.error("❌ فشل حذف الرسالة الصوتية:", e.message);
                    }

                    if (!isAudioWarningsEnabled(chatId)) {
                        return;
                    }

                    const count = addAudioWarning(chatId, audioSenderJid);
                    const maxW = getAudioMaxWarnings();

                    if (count >= maxW) {
                        resetAudioWarning(chatId, audioSenderJid);
                        try {
                            await sock.groupParticipantsUpdate(chatId, [audioSenderJid], "remove");
                        } catch (e) {}
                        await sock.sendMessage(chatId, {
                            text: `🚫 تم طرد @${audioSenderJid.split("@")[0]} لتكرار إرسال الصوتيات (${maxW} مخالفات).`,
                            mentions: [audioSenderJid]
                        });
                    } else {
                        await sock.sendMessage(chatId, {
                            text: `🎙️ ممنوع إرسال الرسائل الصوتية\n\n👤 العضو: @${audioSenderJid.split("@")[0]}\n⚠️ مخالفة (${count}/${maxW})\n🗑️ تم حذف الرسالة.`,
                            mentions: [audioSenderJid]
                        });
                    }
                    return;
                }
            } catch (e) {}
        }
    }

    if (isGroupCheck && !msg.key.fromMe) {
        const mediaChecks = [
            { type: "video", isMsg: !!(msg.message?.videoMessage || msg.message?.viewOnceMessageV2?.message?.videoMessage || msg.message?.viewOnceMessage?.message?.videoMessage || msg.message?.ephemeralMessage?.message?.videoMessage), label: "الفيديوهات", emoji: "🎬" },
            { type: "sticker", isMsg: !!(msg.message?.stickerMessage || msg.message?.ephemeralMessage?.message?.stickerMessage), label: "الملصقات", emoji: "🎭" }
        ];

        for (const mc of mediaChecks) {
            if (!mc.isMsg || !isMediaBlockOn(mc.type, chatId)) continue;

            const mediaSenderJid = msg.key.participant || chatId;
            try {
                const meta = await sock.groupMetadata(chatId);
                const p = meta.participants.find(x => x.id === mediaSenderJid);
                const isSenderAdmin = p?.admin === "admin" || p?.admin === "superadmin";
                if (isSenderAdmin) continue;

                try {
                    await sock.sendMessage(chatId, {
                        delete: { remoteJid: chatId, fromMe: false, id: msg.key.id, participant: mediaSenderJid }
                    });
                } catch (e) { console.error("❌ فشل الحذف:", e.message); }

                if (!isMediaWarnOn(mc.type, chatId)) return;

                const count = addMediaWarning(mc.type, chatId, mediaSenderJid);
                const maxW = getMediaMaxWarnings();

                if (count >= maxW) {
                    resetMediaWarning(mc.type, chatId, mediaSenderJid);
                    try {
                        await sock.groupParticipantsUpdate(chatId, [mediaSenderJid], "remove");
                    } catch (e) {}
                    await sock.sendMessage(chatId, {
                        text: `🚫 تم طرد @${mediaSenderJid.split("@")[0]} لتكرار إرسال ${mc.label} (${maxW} مخالفات).`,
                        mentions: [mediaSenderJid]
                    });
                } else {
                    await sock.sendMessage(chatId, {
                        text: `${mc.emoji} ممنوع إرسال ${mc.label}\n\n👤 العضو: @${mediaSenderJid.split("@")[0]}\n⚠️ مخالفة (${count}/${maxW})\n🗑️ تم حذف الرسالة.`,
                        mentions: [mediaSenderJid]
                    });
                }
                return;
            } catch (e) { console.error("❌ MEDIA CHECK ERROR:", e.message); }
        }
    }

    if (sock.activeListeners && sock.activeListeners.has(chatId)) {
        return; 
    }

    const isGroup = chatId.endsWith("@g.us");
    const messageText = msg.message?.conversation || 
                        msg.message?.extendedTextMessage?.text || 
                        msg.message?.imageMessage?.caption || 
                        msg.message?.videoMessage?.caption || "";

    const { prefix, botState, modeState } = getLiveSystemConfig();

    if (!messageText.startsWith(prefix)) return;

    const BIDS = {
        pn: sock.user.id.split(":")[0] + "@s.whatsapp.net",
        lid: sock.user.lid?.split(":")[0] + "@lid",
    };

    const sender = {
        name: msg.pushName || "Unknown",
        pn: msg.key.participantAlt || 
            (msg.key.remoteJidAlt?.endsWith("s.whatsapp.net") && msg.key.fromMe ? BIDS.pn : msg.key.remoteJidAlt) || 
            (msg.key.fromMe ? BIDS.pn : (isGroup ? msg.key.participant : chatId)),
        lid: msg.key.participant || 
             (msg.key.remoteJid?.endsWith("lid") && msg.key.fromMe ? BIDS.lid : msg.key.remoteJid) || 
             null,
    };

    if (sender.pn) sender.pn = normalizeJid(sender.pn) + "@s.whatsapp.net";
    try { linkIdentity(sender.pn, sender.lid); } catch (e) {}

    const args = messageText.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    
    if (!command) return;


    const ownerNumber = configImport.owner ? configImport.owner.toString().replace(/\D/g, '') : '';
    const isOwner = sender.pn === (ownerNumber + "@s.whatsapp.net") || DEV_NUMBERS.some((n) => sender.pn === (n + "@s.whatsapp.net") || sender.lid === (n + "@lid") || sender.lid === (n + "@s.whatsapp.net")) || isExtraOwner(sender.pn);
    console.log("[DEV_NUMBERS DEBUG] sender.pn =", sender.pn, "| sender.lid =", sender.lid, "| isOwner =", isOwner);

    let senderIsElite = false;
    try { senderIsElite = await sock.isElite({ sock, id: sender.pn }); } catch (e) {}
    // البوت الفرعي: رقمه نخبة فقط، وما يعتبر مالك (صلاحيات المالك للمالك الحقيقي فقط)
    const _isSub = !!sock.__isSubBot;
    const fromMeEff = !!msg.key.fromMe && !_isSub;
    if (_isSub && msg.key.fromMe) senderIsElite = true;

    const senderRole = msg.key.fromMe ? "BOT" : (isOwner ? "OWNER" : "USER");
    const eliteStatus = senderIsElite ? "YES" : "NO";
    const locationType = isGroup ? "GROUP" : "PRIVATE"; 

    
    let ignoreReason = null;
    

    if (botState === "off" && command !== "اعدادات" && command !== "bot") {
        ignoreReason = "BOT : OFF = IGNORED";
    } 

    else if (modeState === "on" && !senderIsElite && !msg.key.fromMe && !isOwner) {
        ignoreReason = "MODE : ON = IGNORED";
    }

    let logDetails = `__________________
SENDER : ${senderRole}
CMD    : ${command}
JID    : ${sender.pn}
LID    : ${sender.lid}
LOC    : ${locationType}
ELITE  : ${eliteStatus}`;

    if (ignoreReason) {
        logDetails += `\n${ignoreReason}`;
    }
    logDetails += `\n__________________`;

    console.log(chalk.cyan(`__________________`));
    console.log(chalk.green(`SENDER : ${senderRole}`));
    console.log(chalk.bold.white(`CMD    : ${command}`));
    console.log(chalk.yellow(`JID    : ${sender.pn}`));
    console.log(chalk.magenta(`LID    : ${sender.lid}`));
    console.log(chalk.blue(`LOC    : ${locationType}`));
    console.log(chalk.red(`ELITE  : ${eliteStatus}`));

    if (ignoreReason) {
        console.log(chalk.bgRed.white.bold(ignoreReason));
    }
    console.log(chalk.cyan(`__________________`));

    logToHistory(logDetails);

    if (ignoreReason) return;

    plugins = getPlugins();
    const handler = plugins[command];

    if (!handler && !["حدث", "مشاكل"].includes(command)) {
        console.log(chalk.hex('#FFA500')(`COMMAND UNKNOWN: ${command}`));
        logToHistory(`__________________\nUNKNOWN: ${command}\nSENDER: ${sender.pn}\n__________________`);
        return;
    }

    
    if (command === "حدث") {
        if (!senderIsElite && !msg.key.fromMe && !isOwner) return;
        try {
            await loadPlugins();
            console.log(chalk.green(`SYSTEM: Reloaded`));
            return await safeSendMessage(sock, chatId, { react: { text: "✅", key: msg.key } });
        } catch (err) { 
            playError(); 
            logToHistory(`__________________\n[ERROR] RELOAD FAILED\nMSG: ${err.message}\n__________________`); 
            return; 
        }
    }

    if (command === "مشاكل") {
        if (!senderIsElite && !msg.key.fromMe && !isOwner) return;
        const issues = getPluginIssues();
        const text = issues.length ? `⚠ مشاكل البلوجينات:\n\n${issues.join("\n")}` : "✨ لا توجد مشاكل برمجية.";
        return await safeSendMessage(sock, chatId, { text }, { quoted: msg });
    }

    if (!handler) return;

    msg.chat = chatId;
    msg.args = args;
    msg.sender = sender;

    if (handler.group === true && !isGroup) {
        return await safeSendMessage(sock, chatId, { text: "❗ هذا الأمر يعمل في المجموعات فقط." }, { quoted: msg });
    }
    // وضع البوت (أمر وضع): عام / نخبة / مالك / خاص / مجموعات — المالك مستثنى دائماً
    if (!isOwner && !fromMeEff) {
        const _mode = getBotMode();
        if (_mode === "مالك") return;
        if (_mode === "نخبة" && !senderIsElite) return;
        if (_mode === "خاص" && isGroup) return;
        if (_mode === "مجموعات" && !isGroup) return;
    }
    if (handler.prv === true && isGroup) {
        return await safeSendMessage(sock, chatId, { text: "❗ هذا الأمر يعمل في الخاص فقط." }, { quoted: msg });
    }


    if (!isOwner && !fromMeEff && ["settings", "الصلاحيات"].includes(Perms.categoryOf(handler))) {
        return await safeSendMessage(sock, chatId, { text: "💎 هذا الأمر للمالك فقط." }, { quoted: msg });
    }

    const executeWithPermissions = async () => {

        if (!fromMeEff && !isOwner) {
            if (Perms.isOff(command)) {
                return await safeSendMessage(sock, chatId, { text: "🚫 هذا الأمر معطّل حالياً." }, { quoted: msg });
            }
            const _lvl = Perms.effectiveLevel(command, handler);
            const _need = Perms.RANK[_lvl] ?? 0;
            const _have = senderIsElite ? 1 : 0;
            if (_need > _have) {
                return await safeSendMessage(sock, chatId, { text: _need >= 2 ? "💎 هذا الأمر للمالك فقط." : "📛 عذرًا! هذا الأمر للنخبة فقط." }, { quoted: msg });
            }
        }

        try {

            const originalIsElite = sock.isElite;
            

            sock.isElite = async (opts) => {
                const idToCheck = opts?.id || opts;
                if (normalizeJid(idToCheck) === normalizeJid(ownerNumber)) {
                    return true; 
                }
                return originalIsElite ? await originalIsElite(opts) : false;
            };

            const _wrapped = CmdMedia.wrap(sock, handler, command);
            await handler.execute({ sock: _wrapped, msg, args, BIDS, sender, isOwner, isElite: senderIsElite });
            sock.isElite = originalIsElite;
            
            playOK();
        } catch (err) {
            console.error(`❌ Error in ${command}:`, err);
            logToHistory(`__________________\n[ERROR] EXECUTION FAILED\nCMD: ${command}\nMSG: ${err.message}\n__________________`); 
            playError();
            await safeSendMessage(sock, chatId, { text: `❌ خطأ برمجي:\n${err.message}` }, { quoted: msg });
        }
    };


    if (handler.lock === "on" && !fromMeEff && !isOwner) {
        const storedPassword = getSystemPassword();
        
        if (!storedPassword) {
            await executeWithPermissions();
            return;
        }

        const password = storedPassword.trim().toUpperCase();

        await safeSendMessage(sock, chatId, { react: { text: "🔐", key: msg.key } });
        console.log(chalk.cyan(`[LOCK] Password Required for ${command}`));
        logToHistory(`__________________\n[LOCK] REQ PASS\nCMD: ${command}\nUSER: ${sender.pn}\n__________________`); 

        let attempts = 0;
        
        const cleanupLock = () => {
            clearTimeout(timeoutId);
            sock.ev.off("messages.upsert", lockListener);
            sock.activeListeners.delete(chatId);
        };

        sock.activeListeners.set(chatId, cleanupLock);

        const timeoutId = setTimeout(async () => {
            cleanupLock();
            console.log(chalk.red(`[LOCK] TIMEOUT`));
            logToHistory(`__________________\n[LOCK] TIMEOUT\nCMD: ${command}\n__________________`);
            await safeSendMessage(sock, chatId, { react: { text: "🔒", key: msg.key } });
        }, 30000);

        const lockListener = async ({ messages }) => {
            const m = messages[0];
            if (!m.message) return;

            const input = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
            if (!input) return;

            const incomingIsGroup = m.key.remoteJid.endsWith("@g.us");
            const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

            const rawSenderPn = m.key.participantAlt || 
                               (m.key.remoteJidAlt?.endsWith("s.whatsapp.net") && m.key.fromMe ? botJid : m.key.remoteJidAlt) || 
                               (m.key.fromMe ? botJid : (incomingIsGroup ? m.key.participant : m.key.remoteJid));

            if (!rawSenderPn) return;

            const incomingJidPure = normalizeJid(rawSenderPn);
            const originalSenderPure = normalizeJid(sender.pn);
            const originalChatPure = normalizeJid(chatId);
            const currentChatPure = normalizeJid(m.key.remoteJid);

            const listenerRole = m.key.fromMe ? "BOT" : (isOwner ? "OWNER" : "USER");
            const listenerLoc = incomingIsGroup ? "GROUP" : "PRIVATE";

            const isSameUser = incomingJidPure === originalSenderPure;
            const isSameChat = currentChatPure === originalChatPure;
            const isPrivate = !incomingIsGroup;

            const isPasswordCorrect = input.toUpperCase() === password;
            const passStatus = isPasswordCorrect ? "TRUE" : "FALSE";
            
            const listenerLog = `__________________
[LOCK LISTENER]
SENDER : ${listenerRole}
INPUT  : ${input}
JID    : ${incomingJidPure}
LOC    : ${listenerLoc}
MATCH  : ${passStatus}
__________________`;

            console.log(chalk.bgBlue.white(` [LOCK LISTENER] `));
            console.log(chalk.cyan(`SENDER : ${listenerRole}`));
            console.log(chalk.white(`INPUT  : ${input}`));
            console.log(chalk.yellow(`JID    : ${incomingJidPure}@s.whatsapp.net`));
            console.log(chalk.blue(`LOC    : ${listenerLoc}`));
            
            if (!isSameUser) return;
            if (!isSameChat && !isPrivate) return;

            logToHistory(listenerLog);

            console.log(chalk.bold(isPasswordCorrect ? chalk.green(`PASS MATCH : TRUE`) : chalk.red(`PASS MATCH : FALSE`)));
            console.log(chalk.cyan(`__________________`));

            if (isPasswordCorrect) {
                cleanupLock();
                await safeSendMessage(sock, m.key.remoteJid, { react: { text: "✅", key: m.key } });
                await safeSendMessage(sock, chatId, { react: { text: "🔓", key: msg.key } });
                await executeWithPermissions();
            } else {
                attempts++;
                logToHistory(`__________________\n[LOCK] WRONG PASS (${attempts}/3)\nUSER: ${incomingJidPure}\n__________________`); 
                
                playError();
                await safeSendMessage(sock, m.key.remoteJid, { react: { text: "❌", key: m.key } });

                if (attempts >= 3) {
                    cleanupLock();
                    await safeSendMessage(sock, chatId, { react: { text: "🔒", key: msg.key } });
                }
            }
        };

        sock.ev.on("messages.upsert", lockListener);
        
    } else {
        await executeWithPermissions();
    }
}

// للبوتات الفرعية: نفس المعالج بالكامل لأي socket
export async function processMessage(sock, msg) {
    return handleSingleMessage(sock, msg);
}
