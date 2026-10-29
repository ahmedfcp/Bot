import { award as _award, awardMany as _awardMany } from "../../handlers/rewards.js";
import { delay } from "@whiskeysockets/baileys";

const activeGames = new Map();
let isListenerAttached = false;

export const BlueSky = {
    command: ["اربعة"],
    description: "لعبة أربعة في صف (مع صديق أو ضد البوت)",
    usage: ".اربعة [@منشن | بوت]",
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

class ConnectFour {
    constructor(p1, p2) {
        this.ROWS = 6;
        this.COLS = 7;
        // إنشاء لوحة فارغة (0: فارغ، 1: اللاعب الأول، 2: اللاعب الثاني)
        this.board = Array(this.ROWS).fill(null).map(() => Array(this.COLS).fill(0));
        
        // تعديل لون اللاعب الثاني إلى الأزرق
        this.players = { 
            '🔴': { ...p1, mark: '🔴', id: 1 }, 
            '🔵': { ...p2, mark: '🔵', id: 2 } 
        };
        this.turn = '🔴';
        this.winner = null;
    }

    isTurn(id) {
        const p = this.players[this.turn];
        const n = normalizeJID(id);
        return p.pn === n || (p.lid && p.lid === n);
    }

    findPlayer(id) {
        const n = normalizeJID(id);
        for (const m of ['🔴', '🔵']) {
            const p = this.players[m];
            if (p.pn === n || (p.lid && p.lid === n)) return p;
        }
        return null;    
    }

    checkWin(r, c) {
        const player = this.board[r][c];
        if (player === 0) return false;

        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

        for (let [dr, dc] of directions) {
            let count = 1;
            for (let i = 1; i < 4; i++) {
                const nr = r + dr * i, nc = c + dc * i;
                if (nr >= 0 && nr < this.ROWS && nc >= 0 && nc < this.COLS && this.board[nr][nc] === player) count++;
                else break;
            }
            for (let i = 1; i < 4; i++) {
                const nr = r - dr * i, nc = c - dc * i;
                if (nr >= 0 && nr < this.ROWS && nc >= 0 && nc < this.COLS && this.board[nr][nc] === player) count++;
                else break;
            }
            if (count >= 4) return true;
        }
        return false;
    }

    play(col) {
        if (this.winner || col < 0 || col >= this.COLS) return false;

        for (let r = this.ROWS - 1; r >= 0; r--) {
            if (this.board[r][col] === 0) {
                const playerId = this.players[this.turn].id;
                this.board[r][col] = playerId;
                
                if (this.checkWin(r, col)) {
                    this.winner = this.turn;
                } else if (this.board[0].every(c => c !== 0)) {
                    this.winner = 'draw';
                } else {
                    this.turn = this.turn === '🔴' ? '🔵' : '🔴';
                }
                return true;
            }
        }
        return false; 
    }

    botPlay() {
        const bot = this.players['🔵'];
        if (bot.pn !== 'BOT' || this.winner) return;

        for (let c = 0; c < this.COLS; c++) {
            const r = this.getDropRow(c);
            if (r !== -1) {
                this.board[r][c] = bot.id;
                if (this.checkWin(r, c)) {
                    this.board[r][c] = 0;
                    this.play(c);
                    return;
                }
                this.board[r][c] = 0;
            }
        }

        const opponentId = this.players['🔴'].id;
        for (let c = 0; c < this.COLS; c++) {
            const r = this.getDropRow(c);
            if (r !== -1) {
                this.board[r][c] = opponentId;
                if (this.checkWin(r, c)) {
                    this.board[r][c] = 0;
                    this.play(c); 
                    return;
                }
                this.board[r][c] = 0;
            }
        }

        const availableCols = [];
        for (let c = 0; c < this.COLS; c++) {
            if (this.getDropRow(c) !== -1) availableCols.push(c);
        }
        
        if (availableCols.length > 0) {
            this.play(availableCols[Math.floor(Math.random() * availableCols.length)]);
        }
    }

    getDropRow(col) {
        for (let r = this.ROWS - 1; r >= 0; r--) {
            if (this.board[r][col] === 0) return r;
        }
        return -1;
    }
}

async function showBoard(sock, jid, game, quotedMsg) {
    let txt = '🎮 *Blue Sky - Connect 4*\n\n';
    
    // رسم الخريطة بالشكل المطلوب
    for (let r = 0; r < game.ROWS; r++) {
        txt += '┃';
        for (let c = 0; c < game.COLS; c++) {
            if (game.board[r][c] === 1) txt += '🔴 ';
            else if (game.board[r][c] === 2) txt += '🔵 ';
            else txt += '⚪ ';
        }
        txt = txt.trimEnd() + '\n';
    }
    txt += '┃1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣\n\n';
    
    const p1 = normalizeJID(game.players['🔴'].pn);
    const p2 = game.players['🔵'].pn === 'BOT' ? 'BOT' : normalizeJID(game.players['🔵'].pn);
    
    txt += `🔴 @${p1.split('@')[0]}\n`;
    txt += `🔵 ${p2 === 'BOT' ? '🤖 البوت' : '@' + p2.split('@')[0]}\n\n`;
    
    if (game.winner) {
        if (game.winner === 'draw') {
            txt += `🤝 *تعادل! اللوحة ممتلئة.*`;
        } else {
            const w = game.players[game.winner];
            await _award(sock, jid, w.pn, "اربعة");
            txt += `🏆 *الفائز:* ${w.pn === 'BOT' ? '🤖 البوت' : '@' + normalizeJID(w.pn).split('@')[0]} 🎉`;
        }
        activeGames.delete(jid);
    } else {
        const t = game.players[game.turn];
        txt += `⏳ *الدور:* ${t.pn === 'BOT' ? '🤖 البوت' : '@' + normalizeJID(t.pn).split('@')[0]}\n`;
        txt += `📌 ضع أربع كرات بالطول أو العرض للفوز\n🏳 للانسحاب اكتب:*استسلام*`;
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
        
        if (body === 'اربعة الغاء' || body === '.اربعة الغاء' || body === 'الغاء') {
            const pl = game.findPlayer(senderID);
            if (pl) { 
                activeGames.delete(chatId); 
                await sock.sendMessage(chatId, { text: '🛑 تم إنهاء اللعبة.' }, { quoted: msg }); 
            }
            return;
        }
        
        const pl = game.findPlayer(senderID);
        if (body === 'استسلام' && pl) {
            const wm = pl.mark === '🔴' ? '🔵' : '🔴';
            game.winner = wm;
            const w = game.players[wm];
            await _award(sock, chatId, w.pn, "اربعة");
            await sock.sendMessage(chatId, { text: `🏳 *انسحاب!*\n🏆 الفائز: ${w.pn === 'BOT' ? '🤖 البوت' : '@' + normalizeJID(w.pn).split('@')[0]}`, mentions: [w.pn !== 'BOT' ? normalizeJID(w.pn) : null].filter(Boolean) }, { quoted: msg });
            activeGames.delete(chatId);
            return;
        }
        
        if (!/^[1-7]$/.test(body) || !pl || !game.isTurn(senderID)) {
            if (!msg.key.fromMe && /^[1-7]$/.test(body)) {
                await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });
            }
            return;
        }
        
        const col = parseInt(body) - 1;
        const success = game.play(col);
        
        if (!success) { 
            if (!msg.key.fromMe) await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }); 
            return; 
        }
        
        await showBoard(sock, chatId, game, msg);
        
        if (game.winner) return;
        
        if (game.players[game.turn].pn === 'BOT') {
            await delay(1200); 
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
        return sock.sendMessage(chatId, { text: '📌 الاستخدام:\n.اربعة @منشن\n.اربعة بوت' }, { quoted: msg });
    }
    
    if (p2.pn === p1.pn) {
        return sock.sendMessage(chatId, { text: '❌ لا يمكنك اللعب ضد نفسك!' }, { quoted: msg });
    }
    
    const game = new ConnectFour(p1, p2);
    activeGames.set(chatId, game);
    
    // تم إلغاء رسالة الإعلان واستبدالها بعرض اللوحة مباشرة كما طلبت
    await showBoard(sock, chatId, game, msg);
}

export default { BlueSky, execute };
