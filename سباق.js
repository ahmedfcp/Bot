import { award as _award, awardMany as _awardMany } from "../../handlers/rewards.js";
import { delay } from "@whiskeysockets/baileys";

const activeGames = new Map();
let isListenerAttached = false;

export const BlueSky = {
    command: ["سباق"],
    description: "لعبة سباق الألغام (مع صديق أو ضد البوت)",
    usage: ".لغم [@منشن | بوت]",
    elite: "off",
    group: true,
    prv: false,
    lock: "off",
    category: "games"
};

const normalizeJID = (jid) => {
    if (!jid) return "";
    let clean = jid.split(':')[0];
    if (clean.includes('@lid')) return clean;
    return clean.includes('@s.whatsapp.net') ? clean : `${clean}@s.whatsapp.net`;
};

class MineRace {
    constructor(p1, p2) {
        this.COLS = 5;
        this.ROWS = 7;
        this.board = Array(this.ROWS).fill(null).map(() => Array(this.COLS).fill(0));
        this.mines = this.genMines();
        this.players = { 
            '❎': { ...p1, mark: '❎', row: -1, col: -1 }, 
            '⭕': { ...p2, mark: '⭕', row: -1, col: -1 } 
        };
        this.turn = '❎';
        this.winner = null;
    }
    genMines() {
        const mines = Array(this.ROWS).fill(null).map(() => Array(this.COLS).fill(false));
        for (let r = 0; r < this.ROWS; r++) {
            const cols = [];
            while (cols.length < 2) {
                const c = Math.floor(Math.random() * this.COLS);
                if (!cols.includes(c)) cols.push(c);
            }
            cols.forEach(c => mines[r][c] = true);
        }
        return mines;
    }
    isTurn(id) {
        const p = this.players[this.turn];
        const n = normalizeJID(id);
        return p.pn === n || (p.lid && p.lid === n);
    }
    findPlayer(id) {
        const n = normalizeJID(id);
        for (const m of ['❎', '⭕']) {
            const p = this.players[m];
            if (p.pn === n || (p.lid && p.lid === n)) return p;
        }
        return null;    
    }
    move(mark, col) {
        const p = this.players[mark];
        const nr = p.row + 1;
        if (nr >= this.ROWS || this.board[nr][col] !== 0) return null;
        if (this.mines[nr][col]) {
            this.board[nr][col] = 2; // علامة اللغم
            this.turn = this.turn === '❎' ? '⭕' : '❎';
            return { mine: true };
        } else {
            this.board[nr][col] = 1; // علامة الأمان
            p.row = nr;
            p.col = col;
            if (p.row >= this.ROWS - 1) this.winner = mark;
            this.turn = this.turn === '❎' ? '⭕' : '❎';
            return { mine: false, nr };
        }
    }
    botPlay() {
        const bot = this.players['⭕'];
        if (bot.pn !== 'BOT') return;
        const nr = bot.row + 1;
        if (nr >= this.ROWS) return;
        const avail = [];
        for (let c = 0; c < this.COLS; c++) {
            if (this.board[nr][c] === 0) avail.push(c);
        }
        if (avail.length === 0) return;
        this.move('⭕', avail[Math.floor(Math.random() * avail.length)]);
    }
}

async function showBoard(sock, jid, game, quotedMsg) {
    let txt = '🎮 *Blue Sky - Mine Race*\n\n';
    for (let r = 0; r < game.ROWS; r++) {
        txt += '┃ ';
        for (let c = 0; c < game.COLS; c++) {
            const isP1 = game.players['❎'].row === r && game.players['❎'].col === c;
            const isP2 = game.players['⭕'].row === r && game.players['⭕'].col === c;
            
            if (isP1 && isP2) txt += '⚔️ ';
            else if (isP1) txt += '🏃 ';
            else if (isP2) txt += '🏃‍♀️ ';
            else if (game.board[r][c] === 2) txt += '💥 ';
            else txt += '🟫 ';
        }
        txt += '\n';
    }
    
    const p1 = normalizeJID(game.players['❎'].pn);
    const p2 = game.players['⭕'].pn === 'BOT' ? 'BOT' : normalizeJID(game.players['⭕'].pn);
    
    txt += `\n🏃 @${p1.split('@')[0]} (${game.players['❎'].row + 1}/7)\n`;
    txt += `🏃‍♀️ ${p2 === 'BOT' ? '🤖 البوت' : '@' + p2.split('@')[0]} (${game.players['⭕'].row + 1}/7)\n\n`;
    
    if (game.winner) {        
        const w = game.players[game.winner];
        await _award(sock, jid, w.pn, "سباق");
        txt += `🏆 *الفائز:* ${w.pn === 'BOT' ? '🤖 البوت' : '@' + normalizeJID(w.pn).split('@')[0]}`;
        activeGames.delete(jid);
    } else {
        const t = game.players[game.turn];
        txt += `⏳ *الدور:* ${t.pn === 'BOT' ? '🤖 البوت' : '@' + normalizeJID(t.pn).split('@')[0]}\n`;
        txt += `📌 اكتب رقم المسار (1 إلى 5)\n🏳 اكتب *استسلام* أو *الغاء* لإنهاء اللعبة`;
    }
    
    const mentions = [p1, p2].filter(x => x !== 'BOT' && x).map(normalizeJID);
    await sock.sendMessage(jid, { text: txt, mentions }, { quoted: quotedMsg });
}

function attachListener(sock) {
    if (isListenerAttached) return;
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        const chatId = msg.key.remoteJid;
        const game = activeGames.get(chatId);
        if (!game) return;
        
        const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim().toLowerCase();
        let senderID = msg.key.fromMe ? sock.user.id : (msg.key.participant || msg.key.remoteJid);
        senderID = normalizeJID(senderID);
        
        if (body === 'لغم الغاء' || body === '.لغم الغاء' || body === 'الغاء') {
            const pl = game.findPlayer(senderID);
            if (pl) { 
                activeGames.delete(chatId); 
                await sock.sendMessage(chatId, { text: '🛑 تم إنهاء اللعبة.' }, { quoted: msg }); 
            }
            return;
        }
        
        const pl = game.findPlayer(senderID);
        if (body === 'استسلام' && pl) {
            const wm = pl.mark === '❎' ? '⭕' : '❎';
            game.winner = wm;
            const w = game.players[wm];
            await sock.sendMessage(chatId, { text: `🏳 *انسحاب!*\n🏆 الفائز: ${w.pn === 'BOT' ? '🤖 البوت' : '@' + normalizeJID(w.pn).split('@')[0]}`, mentions: [w.pn !== 'BOT' ? normalizeJID(w.pn) : null].filter(Boolean) }, { quoted: msg });
            activeGames.delete(chatId);
            return;
        }
        
        if (!/^[1-5]$/.test(body) || !pl || !game.isTurn(senderID)) {
            // تفاعل بسيط إذا كتب أحدهم رقماً في غير دوره
            if (!msg.key.fromMe && /^[1-5]$/.test(body)) {
                await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });
            }
            return;
        }
        
        const col = parseInt(body) - 1;
        const res = game.move(pl.mark, col);
        
        if (!res) { 
            if (!msg.key.fromMe) await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }); 
            return; 
        }
        
        const rm = res.mine ? `💥 بووووم! @${pl.pn.split('@')[0]} داس على لغم وخسر دوره!` : `🏃 آمن! @${pl.pn.split('@')[0]} تقدم بنجاح!`;
        await sock.sendMessage(chatId, { text: rm, mentions: [pl.pn].filter(x => x !== 'BOT') }, { quoted: msg });
        await showBoard(sock, chatId, game, msg);
        
        if (game.winner) return;
        
        if (game.players[game.turn].pn === 'BOT') {
            await delay(1000); // تأخير ليعطي انطباع أن البوت يفكر
            game.botPlay();            
            await showBoard(sock, chatId, game, msg);
        }
    });
    isListenerAttached = true;
}

async function execute({ sock, msg, args, sender }) {
    const chatId = msg.key.remoteJid;
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, { text: '❌ هذه اللعبة مخصصة للمجموعات فقط' }, { quoted: msg });
    }
    
    attachListener(sock);
    if (activeGames.has(chatId)) {
        return sock.sendMessage(chatId, { text: '⚠ هناك لعبة جارية بالفعل في هذه المجموعة!' }, { quoted: msg });
    }
    
    const p1 = { pn: normalizeJID(sender.pn), lid: sender.lid ? normalizeJID(sender.lid) : null };
    let p2 = null;
    const currentBotJid = sock.user?.id ? normalizeJID(sock.user.id) : '';

    if (args[0] && (args[0] === 'بوت' || args[0].toLowerCase() === 'bot')) {
        p2 = { pn: 'BOT', lid: 'BOT' };
    } else {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (mentioned) {
            const menNorm = normalizeJID(mentioned);
            p2 = (menNorm === currentBotJid) ? { pn: 'BOT', lid: 'BOT' } : { pn: menNorm, lid: null };
        }
    }

    if (!p2) {
        return sock.sendMessage(chatId, { text: '📌 الاستخدام:\n.لغم @منشن\n.لغم بوت' }, { quoted: msg });
    }
    
    if (p2.pn === p1.pn) {
        return sock.sendMessage(chatId, { text: '❌ لا يمكنك اللعب ضد نفسك!' }, { quoted: msg });
    }
    
    const game = new MineRace(p1, p2);
    activeGames.set(chatId, game);
    
    await sock.sendMessage(chatId, { 
        text: `🏁 *بدأ سباق الألغام!*\n🏃 التحدي ضد ${p2.pn === 'BOT' ? '🤖 البوت' : '@' + p2.pn.split('@')[0]}`, 
        mentions: p2.pn !== 'BOT' ? [p2.pn] : [] 
    }, { quoted: msg });
    
    await showBoard(sock, chatId, game, msg);
}

export default { BlueSky, execute };
