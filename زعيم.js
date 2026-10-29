import { award as _award, awardMany as _awardMany } from "../../handlers/rewards.js";
import fs from "fs";
import path from "path";
import { generateWAMessageFromContent, jidDecode } from "@whiskeysockets/baileys";

global.bossBattles = global.bossBattles || {};

// --- بيانات الزعماء ---
const BOSSES = [
    { name: "العنكبوت السام", hp: 100, attack: 15, defense: 5, reward: 50, element: "سم", desc: "عنكبوت عملاق يهاجم بالسم ويقلل الحركة" },
    { name: "التنين الناري", hp: 200, attack: 25, defense: 10, reward: 150, element: "نار", desc: "تنين قديم ينفث لهيباً يحرق كل من يقف أمامه" },
    { name: "الشبح الظلامي", hp: 150, attack: 20, defense: 15, reward: 100, element: "ظلام", desc: "شبح لا يُرى يهاجم من الظل ويسرق الطاقة" },
    { name: "العملاق الحجري", hp: 300, attack: 30, defense: 25, reward: 200, element: "أرض", desc: "عملاق من الصخور الصلبة يصعب كسر دفاعه" },
    { name: "الساحر الجليدي", hp: 180, attack: 35, defense: 8, reward: 180, element: "جليد", desc: "ساحر قوي يتحكم في الجليد ويجمد الخصوم" },
    { name: "ملك الأرواح", hp: 400, attack: 40, defense: 20, reward: 300, element: "روح", desc: "أقوى زعيم، ملك العالم الآخر، يحتاج لفريق لهزيمته" }
];

// --- نظام العناصر ---
const ELEMENTS = {
    "نار": { strong: ["أرض", "جليد"], weak: ["ماء"], emoji: "🔥" },
    "ماء": { strong: ["نار", "أرض"], weak: ["كهرباء"], emoji: "💧" },
    "أرض": { strong: ["كهرباء", "سم"], weak: ["نار"], emoji: "🪨" },
    "هواء": { strong: ["أرض", "سم"], weak: ["كهرباء"], emoji: "💨" },
    "كهرباء": { strong: ["ماء", "هواء"], weak: ["أرض"], emoji: "⚡" },
    "سم": { strong: ["روح", "هواء"], weak: ["أرض"], emoji: "☠️" },
    "ظلام": { strong: ["روح", "نار"], weak: ["نور"], emoji: "🌑" },
    "نور": { strong: ["ظلام", "سم"], weak: ["ظلام"], emoji: "✨" },
    "روح": { strong: ["ظلام", "نار"], weak: ["سم"], emoji: "👻" },
    "جليد": { strong: ["أرض", "هواء"], weak: ["نار"], emoji: "❄️" }
};

// --- دوال المساعدة ---
function calcDamage(attackerElement, defenderElement, baseDamage) {
    const elementData = ELEMENTS[attackerElement];
    if (!elementData) return baseDamage;
    if (elementData.strong.includes(defenderElement)) return Math.floor(baseDamage * 1.5);
    if (elementData.weak.includes(defenderElement)) return Math.floor(baseDamage * 0.5);
    return baseDamage;
}

function drawHP(current, max, label) {
    const percent = Math.max(0, Math.floor((current / max) * 20));
    const bar = '🟩'.repeat(percent) + '🟥'.repeat(20 - percent);
    return `${label}: [${bar}] ${current}/${max}`;
}

// --- إعدادات البوت الملكية ---
export const BlueSky = {
  command: "زعيم",
  description: "لعبة معركة الزعماء الملحمية — BLUE SKY",
  elite: "off",  
  lock: "off",
  bluesky: "on"
};

function decode(jid) {
  return (jidDecode(jid)?.user || jid.split("@")[0]) + "@s.whatsapp.net";
}

async function execute({ sock, msg, args }) {
    // 🔏 حقن نظام الإرسال الآمن لـ BLUE SKY بدون أي تكرار للمتغيرات
    const _bluesky_origSend = sock.sendMessage;
    sock.sendMessage = async (jid, content, options = {}) => {
        if (options.edit) return await _bluesky_origSend.call(sock, jid, content, options);
        
        const isMedia = content.video || content.image || content.audio || content.document || content.sticker;
        if (isMedia) return await _bluesky_origSend.call(sock, jid, content, options);
        
        if (typeof BlueSky !== 'undefined' && BlueSky.bluesky === 'on') {
            const _textBody = content.text || content.caption;
            if (_textBody && typeof _textBody === 'string') {
                let _nD = { ceiling: "𝐴𝑁header𝐴𝑆𝑇𝐴𝑆𝐼𝐴", name: "𝐁𝐋𝐔𝐄 𝐒𝐊𝐘", description: "🌹 𝐙𝐄𝐑𝐎 𝐒𝐘𝐒𝐓𝐄𝐌 🌹", verification: true, media: true };
                try {
                    const _cfgPath = path.join(process.cwd(), "bluesky", "config.js");
                    const _cfgContent = fs.readFileSync(_cfgPath, "utf8");
                    const _match = _cfgContent.match(/blueSkyInfo:\s*({[\s\S]*?})(,|$)/);
                    if (_match) {
                        const _loaded = new Function("return " + _match[1])();
                        _nD = { ..._nD, ..._loaded };
                    }
                } catch(e) {}

                let _nTh = null;
                if (_nD.media !== false) {
                    try {
                        const _img = path.join(process.cwd(), "bluesky", "image.jpeg");
                        if (fs.existsSync(_img)) _nTh = fs.readFileSync(_img);
                    } catch(e) {}
                }

                let _finalQuoted = options.quoted || msg;
                if (_nD.verification === true) {
                    _finalQuoted = {
                        key: { fromMe: false, participant: "0@s.whatsapp.net", remoteJid: "0@s.whatsapp.net" },
                        message: { conversation: _nD.ceiling || "" }
                    };
                }

                const _contextInfo = {
                    mentionedJid: options.mentions || [],
                    stanzaId: "BLUESKY_" + Date.now(),
                    ...(_nD.verification ? { participant: "0@s.whatsapp.net" } : {}),
                    quotedMessage: _finalQuoted.message,
                    externalAdReply: (_nD.media !== false) ? {
                        title: _nD.name, body: _nD.description, mediaType: 1, 
                        renderLargerThumbnail: true, showAdAttribution: true, 
                        ...(_nTh ? { thumbnail: _nTh } : {})
                    } : null
                };

                const _nM = generateWAMessageFromContent(jid, {
                    extendedTextMessage: { text: _textBody, contextInfo: _contextInfo }
                }, { userJid: sock.user?.id, quoted: _finalQuoted, linkPreview: _nD.media !== false ? undefined : null });

                return await sock.relayMessage(jid, _nM.message, { messageId: _nM.key.id });
            }
        }
        return await _bluesky_origSend.call(sock, jid, content, options);
    };

    const from = msg.key.remoteJid;
    const senderJid = msg.key.participant || from;
    const userId = decode(senderJid);
    
    const input = (args && args.length > 0) ? args[0].trim() : '';
    const action = input.toLowerCase();

    try {
        // 1️⃣ إعادة تعيين المعركة وعمل ريزيت صريح
        if (action === 'reset') {
            delete global.bossBattles[userId];
            return await _bluesky_origSend.call(sock, from, { text: "╔══════════════════════╗\n║   🗑️ *تم تنظيف المعركة بنجاح* ║\n╚══════════════════════╝\n\n💡 ابدأ من جديد: `.زعيم`" }, { quoted: msg });
        }

        // 2️⃣ بدء الجيم وتوليد الزعيم
        if (!input || action === 'start' || action === 'ابدأ') {
            delete global.bossBattles[userId];
            const bossTemplate = BOSSES[Math.floor(Math.random() * BOSSES.length)];
            const playerElement = Object.keys(ELEMENTS)[Math.floor(Math.random() * Object.keys(ELEMENTS).length)];
            
            global.bossBattles[userId] = {
                boss: { ...bossTemplate, currentHp: bossTemplate.hp },
                player: { hp: 150, maxHp: 150, attack: 20, defense: 10, element: playerElement, potions: 2, specialUsed: false },
                turn: 'player',
                round: 1,
                createdAt: Date.now()
            };
            
            const game = global.bossBattles[userId];
            return await _bluesky_origSend.call(sock, from, {
                text: `╔══════════════════════╗\n║   ⚔️ *معركة الزعماء الملكية* ⚔️   ║\n╚══════════════════════╝\n\n👹 *الزعيم:* ${game.boss.name}\n📜 وصفه: ${game.boss.desc}\n${ELEMENTS[game.boss.element]?.emoji || ''} عنصر الزعيم: ${game.boss.element}\n\n${drawHP(game.boss.currentHp, game.boss.hp, '❤️ صحة الزعيم')}\n\n🧙 *المحارب:* ${msg.pushName || 'بطل'}\n${ELEMENTS[game.player.element]?.emoji || ''} عنصر قوتك: ${game.player.element}\n${drawHP(game.player.hp, game.player.maxHp, '❤️ صحتك')}\n🧪 الجرعات المتاحة: ${game.player.potions}\n⚡ ضربة خاصة: جاهزة\n\n🎮 *أوامر التحكم الملكية:*\n├ \`.زعيم هجوم\` - تنفيذ هجوم عادي 💥\n├ \`.زعيم دفاع\` - تفعيل وضع الحماية 🛡️\n├ \`.زعيم خاص\` - إطلاق الهجوم المدمّر ⚡\n├ \`.زعيم شفاء\` - تجديد الصحة بالجرعة 🧪\n└ \`.زعيم هرب\` - محاولة الانسحاب والهرب 🏃`
            }, { quoted: msg });
        }

        // 3️⃣ التحقق من الجلسة
        const battle = global.bossBattles[userId];
        if (!battle) {
            return await _bluesky_origSend.call(sock, from, { text: "❌ *لا توجد معركة نشطة حالياً.*\n💡 ابدأ المعركة بكتابة: `.زعيم`" }, { quoted: msg });
        }

        if (Date.now() - battle.createdAt > 900000) { 
            delete global.bossBattles[userId];
            return await _bluesky_origSend.call(sock, from, { text: "⏰ *انتهت صلاحية المعركة بسبب الخمول.*\n💡 ابدأ من جديد: `.زعيم`" }, { quoted: msg });
        }

        // 💥 خيار الهجوم
        if (['هجوم', 'attack', 'ضرب'].includes(action)) {
            if (battle.turn !== 'player') return await _bluesky_origSend.call(sock, from, { text: "⏳ انتظر دور حركات الزعيم!" }, { quoted: msg });
            
            const baseDmg = battle.player.attack + Math.floor(Math.random() * 10);
            const finalDmg = calcDamage(battle.player.element, battle.boss.element, baseDmg);
            battle.boss.currentHp = Math.max(0, battle.boss.currentHp - finalDmg);
            
            let log = `💥 *لقد هاجمت ${battle.boss.name}!*\n`;
            if (finalDmg > baseDmg) log += `🔥 *ضرر عنصري مضاعف قاسي!*\n`;
            log += `🗡️ الضرر الملحق: ${finalDmg}\n\n${drawHP(battle.boss.currentHp, battle.boss.hp, '❤️ صحة الزعيم')}\n`;
            
            if (battle.boss.currentHp <= 0) {
                await _award(sock, from, senderJid, "زعيم");
                delete global.bossBattles[userId];
                return await _bluesky_origSend.call(sock, from, { text: `╔══════════════════════╗\n║   🏆 *إنجاز ملحمي: فزت!* 🏆   ║\n╚══════════════════════╝\n\n${log}\n🎉 *لقد سحقت ${battle.boss.name} بنجاح!*\n💰 نقاط الجائزة المكتسبة: ${battle.boss.reward}` }, { quoted: msg });
            }
            
            battle.turn = 'boss';
            await _bluesky_origSend.call(sock, from, { text: log + `\n⏳ *جاري رد الزعيم...*` }, { quoted: msg });
            await new Promise(r => setTimeout(r, 1000));
            
            const bossDmg = calcDamage(battle.boss.element, battle.player.element, battle.boss.attack + Math.floor(Math.random() * 8));
            battle.player.hp = Math.max(0, battle.player.hp - bossDmg);
            
            if (battle.player.hp <= 0) {
                delete global.bossBattles[userId];
                return await _bluesky_origSend.call(sock, from, { text: `╔══════════════════════╗\n║   💀 *لقد قُتِلت في المعركة* 💀   ║\n╚══════════════════════╝\n\n😢 *هزمك ${battle.boss.name}.. أعد شحن طاقتك وحاول مجدداً.*\n💡 المحاولة الجديدة: \`.زعيم\`` }, { quoted: msg });
            }
            
            battle.turn = 'player';
            battle.round++;
            return await _bluesky_origSend.call(sock, from, { text: `👹 *باغتك ${battle.boss.name} بهجوم مضاد!*\n💥 الضرر المتلقى: ${bossDmg}\n\n${drawHP(battle.player.hp, battle.player.maxHp, '❤️ صحتك')}\n\n🔄 *الجولة ${battle.round} — الآن دورك مجدداً!*` }, { quoted: msg });
        }
        
        // 🛡️ خيار الدفاع
        if (['دفاع', 'defend', 'حماية'].includes(action)) {
            if (battle.turn !== 'player') return await _bluesky_origSend.call(sock, from, { text: "⏳ انتظر دور الزعيم!" }, { quoted: msg });
            
            await _bluesky_origSend.call(sock, from, { text: "🛡️ *شحنت درع الحماية العظمى!*\nسيتم تقليص ضرر الزعيم القادم بنسبة 50%.\n⏳ *دور الزعيم...*" }, { quoted: msg });
            await new Promise(r => setTimeout(r, 1000));
            
            const bossBaseDmg = battle.boss.attack + Math.floor(Math.random() * 8);
            const bossFinalDmg = calcDamage(battle.boss.element, battle.player.element, bossBaseDmg);
            const playerDmgTaken = Math.floor(bossFinalDmg * 0.5); 
            
            battle.player.hp = Math.max(0, battle.player.hp - playerDmgTaken);
            
            if (battle.player.hp <= 0) {
                delete global.bossBattles[userId];
                return await _bluesky_origSend.call(sock, from, { text: `💀 *سقط درعك وتمت هزيمتك بواسطة ${battle.boss.name}!*` }, { quoted: msg });
            }
            
            battle.turn = 'player';
            battle.round++;
            return await _bluesky_origSend.call(sock, from, { text: `👹 *ضرب الزعيم درعك الحصين!*\n🛡️ تم تقليص الضرر بنجاح!\n💥 الضرر الصافي عليك: ${playerDmgTaken}\n\n${drawHP(battle.player.hp, battle.player.maxHp, '❤️ صحتك')}\n\n🔄 *الجولة ${battle.round} — تصرف الآن!*` }, { quoted: msg });
        }

        // ⚡ الهجوم الخاص
        if (['خاص', 'special', 'power'].includes(action)) {
            if (battle.turn !== 'player') return await _bluesky_origSend.call(sock, from, { text: "⏳ انتظر دور الزعيم!" }, { quoted: msg });
            if (battle.player.specialUsed) return await _bluesky_origSend.call(sock, from, { text: "❌ *لقد استنفذت طاقتك الخاصة السحرية لهذه المعركة!*" }, { quoted: msg });
            
            const specialDmg = Math.floor(battle.player.attack * 2.5) + Math.floor(Math.random() * 15);
            const finalDmg = calcDamage(battle.player.element, battle.boss.element, specialDmg);
            battle.boss.currentHp = Math.max(0, battle.boss.currentHp - finalDmg);
            battle.player.specialUsed = true;
            
            let log = `⚡ *أطلقت ضربة القوة المظلمة المدمرة!*\n`;
            log += `💥 الضرر الأسطوري: ${finalDmg}\n\n${drawHP(battle.boss.currentHp, battle.boss.hp, '❤️ صحة الزعيم')}\n`;
            
            if (battle.boss.currentHp <= 0) {
                await _award(sock, from, senderJid, "زعيم");
                delete global.bossBattles[userId];
                return await _bluesky_origSend.call(sock, from, { text: `╔══════════════════════╗\n║   🏆 *إنجاز ملحمي: فزت!* 🏆   ║\n╚══════════════════════╝\n\n${log}\n🎉 *تهانينا ملوك الهجوم الخاص! هزمت ${battle.boss.name}!*` }, { quoted: msg });
            }
            
            battle.turn = 'boss';
            await _bluesky_origSend.call(sock, from, { text: log + `\n⏳ *الزعيم يترنح ويستعد للرد...*` }, { quoted: msg });
            await new Promise(r => setTimeout(r, 1000));
            
            const bossDmg = calcDamage(battle.boss.element, battle.player.element, battle.boss.attack + Math.floor(Math.random() * 8));
            battle.player.hp = Math.max(0, battle.player.hp - bossDmg);
            if (battle.player.hp <= 0) {
                delete global.bossBattles[userId];
                return await _bluesky_origSend.call(sock, from, { text: `💀 *مُتّ متأثراً بضربة غضب الزعيم الأخيرة!*` }, { quoted: msg });
            }
            
            battle.turn = 'player';
            battle.round++;
            return await _bluesky_origSend.call(sock, from, { text: `👹 *هاجمك الزعيم بكل غيظه!*\n💥 الضرر عليك: ${bossDmg}\n\n${drawHP(battle.player.hp, battle.player.maxHp, '❤️ صحتك')}\n\n🔄 *الجولة ${battle.round} — دورك!*` }, { quoted: msg });
        }

        // 🧪 شفاء
        if (['شفاء', 'heal', 'علاج'].includes(action)) {
            if (battle.turn !== 'player') return await _bluesky_origSend.call(sock, from, { text: "⏳ انتظر دور الزعيم!" }, { quoted: msg });
            if (battle.player.potions <= 0) return await _bluesky_origSend.call(sock, from, { text: "❌ *نفذت جرعات جرعات إكسير الشفاء تماماً!*" }, { quoted: msg });
            
            battle.player.hp = Math.min(battle.player.maxHp, battle.player.hp + 40);
            battle.player.potions--;
            
            let log = `🧪 *تجرعت جرعة الإكسير الملكي!*\n❤️ تم استعادة 40 نقطة صحة.\n${drawHP(battle.player.hp, battle.player.maxHp, '❤️ صحتك')}\n🧪 المتبقي: ${battle.player.potions}\n`;
            
            battle.turn = 'boss';
            await _bluesky_origSend.call(sock, from, { text: log + `\n⏳ *دور هجوم الزعيم...*` }, { quoted: msg });
            await new Promise(r => setTimeout(r, 1000));
            
            const bossDmg = calcDamage(battle.boss.element, battle.player.element, battle.boss.attack + Math.floor(Math.random() * 8));
            battle.player.hp = Math.max(0, battle.player.hp - bossDmg);
            
            if (battle.player.hp <= 0) {
                delete global.bossBattles[userId];
                return await _bluesky_origSend.call(sock, from, { text: `💀 *تم سحقك أثناء محاولة معالجة جراحك.*` }, { quoted: msg });
            }
            
            battle.turn = 'player';
            battle.round++;
            return await _bluesky_origSend.call(sock, from, { text: `👹 *استغل الزعيم علاجك وضربك!*\n💥 الضرر عليك: ${bossDmg}\n\n${drawHP(battle.player.hp, battle.player.maxHp, '❤️ صحتك')}\n\n🔄 *الجولة ${battle.round} — دورك!*` }, { quoted: msg });
        }

        // 🏃 هرب
        if (['هرب', 'run', 'escape'].includes(action)) {
            if (Math.random() > 0.4) {
                delete global.bossBattles[userId];
                return await _bluesky_origSend.call(sock, from, { text: `🏃 *انسحبت وفتحت بوابات الهرب بنجاح!*\n💡 للبدء مجدداً: \`.زعيم\`` }, { quoted: msg });
            } else {
                await _bluesky_origSend.call(sock, from, { text: `❌ *تعثرت وفشلت في الهروب والانسحاب!*\n⏳ *دور الزعيم لضربك...*` }, { quoted: msg });
                await new Promise(r => setTimeout(r, 1000));
                
                const bossDmg = calcDamage(battle.boss.element, battle.player.element, battle.boss.attack + Math.floor(Math.random() * 8));
                battle.player.hp = Math.max(0, battle.player.hp - bossDmg);
                if (battle.player.hp <= 0) {
                    delete global.bossBattles[userId];
                    return await _bluesky_origSend.call(sock, from, { text: `💀 *تم تصفيتك أثناء محاولة الهرب الجبانة!*` }, { quoted: msg });
                }
                
                battle.turn = 'player';
                battle.round++;
                return await _bluesky_origSend.call(sock, from, { text: `👹 *ضربك الزعيم في ظهرك وأنت تهرب!*\n💥 الضرر المتلقى: ${bossDmg}\n\n${drawHP(battle.player.hp, battle.player.maxHp, '❤️ صحتك')}\n\n🔄 *الجولة ${battle.round} — تصرف ببطولة واهجم!*` }, { quoted: msg });
            }
        }

        // 📖 فتح قائمة دليل اللعبة المساعدة
        if (['مساعدة', 'help', 'info'].includes(action)) {
            return await _bluesky_origSend.call(sock, from, {
                text: `╔══════════════════════╗\n║   ⚔️ *دليل معركة الزعماء* ⚔️   ║\n╚══════════════════════╝\n\n📌 *مخطط تفوق العناصر:*\n├ 🔥 نار > 🪨 أرض > ⚡ كهرباء > 💧 ماء\n├ ☠️ سم > 👻 روح > 🌑 ظلام > ☠️ سم\n└ ❄️ جليد > 🪨 أرض > 💨 هواء\n\n🎮 *التحكم:*\n├ \`.زعيم\` - بدء الجيم\n├ \`.زعيم هجوم\` - ضربة 💥\n├ \`.زعيم دفاع\` - حماية 50% 🛡️\n├ \`.زعيم خاص\` - ضربة مرعبة ⚡\n├ \`.زعيم شفاء\` - استعادة 40 دم 🧪\n├ \`.زعيم هرب\` - هروب مباغت 🏃\n└ \`.زعيم reset\` - إنهاء المعركة وتصفيتها 🗑️`
            }, { quoted: msg });
        }

        return await _bluesky_origSend.call(sock, from, { text: "⚠️ *أمر مجهول..* اكتب `.زعيم مساعدة` لمعرفة الأوامر." }, { quoted: msg });

    } catch (err) {
        console.error(`[ERROR]`, err);
        if (userId && global.bossBattles) delete global.bossBattles[userId];
        return await _bluesky_origSend.call(sock, from, { text: `⚠️ خطأ في المعالجة: ${err.message}\nاكتب \`.زعيم reset\` لحل التعليق.` }, { quoted: msg });
    }
}

export default { BlueSky, execute };
