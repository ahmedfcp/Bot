import { award as _award, awardMany as _awardMany } from "../../handlers/rewards.js";
const mafiaGames = {};

export const BlueSky = {
  command: ["مافيا"],
  description: "لعبة المافيا الجماعية - اكتشف المافيا قبل ما يذبحوكم كلهم",
  elite: "off",
  group: true,
  prv: false,
  lock: "off"
};

async function execute({ sock, msg, sender }) {
  const from = msg.key.remoteJid;
  const isGroup = from.endsWith("@g.us");
  const user = sender?.pn || msg.key.participant || msg.key.remoteJid;

  if (!isGroup) {
    return sock.sendMessage(from, { text: "❌ هذا الأمر يعمل فقط في المجموعات." }, { quoted: msg });
  }

  try {
    if (mafiaGames[from]) {
      const game = mafiaGames[from];

      const controlPanel = `
✦━━━ *لوحة تحكم المافيا* ━━━✦

الحالة: ${game.started ? '🟢 جارية' : '🟡 في التسجيل'}
اللاعبين: ${game.players.length}
${game.started ? `الجولة: ${game.round} | ${game.nightPhase ? '🌙 ليل' : '☀️ نهار'}` : ''}

📋 *الأوامر المتاحة:*

▶️ *تشغيل* - بدء اللعبة
⏹️ *إيقاف* - إيقاف اللعبة فوراً
🔄 *من جديد* - حذف اللعبة الحالية وبدء جديدة
➕ *اضف (لقب)* - إضافة لاعب يدوياً
➖ *حذف (لقب)* - حذف لاعب من اللعبة
📋 *اللاعبين* - عرض قائمة اللاعبين
📤 *تفاصيل* - إرسال تفاصيل اللاعبين للخاص

ارسل الأمر المناسب:
      `;

      return await sock.sendMessage(from, { text: controlPanel }, { quoted: msg });
    }

    await createNewGame(sock, from);

  } catch (e) {
    console.error(e);
    await sock.sendMessage(from, { text: `❌ خطأ:\n${e.message}` }, { quoted: msg });
  }
}

async function createNewGame(sock, group) {
  mafiaGames[group] = {
    started: false,
    players: [],
    activePlayers: [],
    round: 0,
    nightPhase: false,
    votes: {},
    mafiaTarget: null,
    doctorTarget: null,
    detectiveTarget: null,
    phaseTimer: null,
    phaseTime: 60 * 1000,
    adminJid: null
  };

  const instructions = `
✦━━━ *لعبة المافيا* ━━━✦
🎭 الهدف: اكتشف المافيا قبل ما يذبحوكم كلهم!

📝 *التعليمات:*
1️⃣ اكتب *شارك (لقبك)* للدخول
   مثال: شارك الأسطورة

2️⃣ ارسل *تشغيل* لبدء اللعبة

3️⃣ 🌙 *الليل* (بالخاص):
   • المافيا: *اقتل (اللقب)*
   • الدكتور: *احمي (اللقب)*
   • المحقق: *حقق (اللقب)*

4️⃣ ☀️ *النهار* (بالقروب):
   ارسل *لقب* الشخص للتصويت عليه مباشرة

⚙️ *أوامر الإدارة:*
• *إيقاف* - إيقاف اللعبة
• *من جديد* - إعادة اللعبة من الصفر
• *اضف (لقب)* - إضافة لاعب
• *حذف (لقب)* - حذف لاعب
• *اللاعبين* - عرض القائمة
• *تفاصيل* - إرسال التفاصيل للخاص

✦ ارسل "شارك (لقبك)" للانضمام!
    `;

  await sock.sendMessage(group, { text: instructions });

  bind(sock);
}

function bind(sock) {
  if (sock.__mafiaBound) return;
  sock.__mafiaBound = true;

  // مستمع رسائل القروب
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const ms = m.messages[0];
      if (!ms?.message) return;

      const group = ms.key.remoteJid;
      if (!group.endsWith('@g.us')) return;
      if (!mafiaGames[group]) return;

      const game = mafiaGames[group];
      const body = (ms.message.conversation) || (ms.message.extendedTextMessage?.text) || "";
      const user = ms.key.participant || ms.key.remoteJid;
      const trimmed = body.trim();
      const lowerTrimmed = trimmed.toLowerCase();

      // ===== إرسال التفاصيل للخاص =====
      if (lowerTrimmed === 'تفاصيل' || lowerTrimmed === 'تفصيل') {
        if (game.players.length === 0) {
          await sock.sendMessage(group, { text: '❌ لا يوجد لاعبين مسجلين.' });
          return;
        }

        let detailsMsg = `📋 *تفاصيل لاعبي المافيا*\n\n`;
        detailsMsg += `الحالة: ${game.started ? '🟢 جارية' : '🟡 في التسجيل'}\n`;
        detailsMsg += `اللاعبين: ${game.players.length}\n`;
        if (game.started) {
          detailsMsg += `الجولة: ${game.round}\n`;
          detailsMsg += `الوقت: ${game.nightPhase ? '🌙 ليل' : '☀️ نهار'}\n`;
        }
        detailsMsg += `\n*قائمة اللاعبين:*\n`;

        game.players.forEach((p, i) => {
          const status = p.isAlive ? '✅ حي' : '💀 ميت';
          const role = game.started ? ` - ${getRoleName(p.role)}` : '';
          detailsMsg += `${i + 1}. ${p.nickname} ${status}${role}\n`;
        });

        try {
          await sock.sendMessage(user, { text: detailsMsg });
          await sock.sendMessage(group, {
            text: `📤 تم إرسال التفاصيل لـ @${user.split("@")[0]} في الخاص`,
            mentions: [user]
          });
        } catch (e) {
          await sock.sendMessage(group, { text: '❌ لا يمكن إرسال رسالة خاصة، تأكد من فتح الخاص.' });
        }
        return;
      }

      // ===== أوامر الإدارة =====
      if (lowerTrimmed === 'إيقاف' || lowerTrimmed === 'ايقاف') {
        if (game.phaseTimer) clearTimeout(game.phaseTimer);
        delete mafiaGames[group];
        await sock.sendMessage(group, { text: '⏹️ تم إيقاف اللعبة وحذفها.' });
        return;
      }

      if (lowerTrimmed === 'من جديد' || lowerTrimmed === 'منجديد') {
        if (game.phaseTimer) clearTimeout(game.phaseTimer);
        delete mafiaGames[group];
        await sock.sendMessage(group, { text: '🔄 تم حذف اللعبة السابقة...\n\nجاري إنشاء لعبة جديدة!' });
        setTimeout(() => createNewGame(sock, group), 1500);
        return;
      }

      if (lowerTrimmed === 'اللاعبين' || lowerTrimmed === 'قائمة') {
        if (game.players.length === 0) {
          await sock.sendMessage(group, { text: '📋 لا يوجد لاعبين مسجلين.' });
          return;
        }

        const list = game.players.map((p, i) =>
          `${i + 1}. ${p.nickname} ${p.isAlive ? '✅' : '💀'} ${p.role ? `(${getRoleName(p.role)})` : ''}`
        ).join('\n');

        await sock.sendMessage(group, {
          text: `📋 *قائمة اللاعبين (${game.players.length}):*\n\n${list}`,
          mentions: game.players.map(p => p.jid)
        });
        return;
      }

      if (lowerTrimmed.startsWith('اضف') || lowerTrimmed.startsWith('أضف') || lowerTrimmed.startsWith('add')) {
        const nickname = trimmed.substring(4).trim();
        if (!nickname) {
          await sock.sendMessage(group, { text: '❌ استخدم: اضف (اللقب)' });
          return;
        }

        if (game.players.find(p => p.nickname === nickname)) {
          await sock.sendMessage(group, { text: '❌ هذا اللقب موجود مسبقاً.' });
          return;
        }

        const fakeJid = `${nickname}@s.whatsapp.net`;
        game.players.push({
          jid: fakeJid,
          nickname: nickname,
          role: null,
          isAlive: true,
          isManual: true
        });

        await sock.sendMessage(group, { text: `➕ تم إضافة: ${nickname}` });
        return;
      }

      if (lowerTrimmed.startsWith('حذف') || lowerTrimmed.startsWith('remove') || lowerTrimmed.startsWith('delete')) {
        const nickname = trimmed.substring(4).trim();
        if (!nickname) {
          await sock.sendMessage(group, { text: '❌ استخدم: حذف (اللقب)' });
          return;
        }

        const playerIndex = game.players.findIndex(p => p.nickname === nickname);
        if (playerIndex === -1) {
          await sock.sendMessage(group, { text: '❌ اللاعب غير موجود.' });
          return;
        }

        game.players.splice(playerIndex, 1);
        await sock.sendMessage(group, { text: `➖ تم حذف: ${nickname}` });
        return;
      }

      // ===== أوامر اللعبة =====
      if (lowerTrimmed.startsWith('شارك')) {
        if (game.started) {
          await sock.sendMessage(group, { text: '❌ اللعبة بدأت، لا يمكن الانضمام.' });
          return;
        }

        const nickname = trimmed.substring(4).trim();
        if (!nickname) {
          await sock.sendMessage(group, { text: '❌ اكتب لقبك بعد كلمة شارك\nمثال: شارك الأسطورة' });
          return;
        }

        if (game.players.find(p => p.nickname === nickname)) {
          await sock.sendMessage(group, { text: '❌ هذا اللقب مستخدم، اختر لقب ثاني.' });
          return;
        }

        if (game.players.find(p => p.jid === user)) {
          await sock.sendMessage(group, { text: '❌ أنت مسجل مسبقاً.' });
          return;
        }

        game.players.push({
          jid: user,
          nickname: nickname,
          role: null,
          isAlive: true,
          isManual: false
        });

        await sock.sendMessage(group, {
          text: `✅ انضمام: *${nickname}* (@${user.split("@")[0]})\n👥 العدد: ${game.players.length}`,
          mentions: [user]
        });
        return;
      }

      if (lowerTrimmed === 'تشغيل' || lowerTrimmed === 'بدا' || lowerTrimmed === 'ابدأ') {
        if (game.started) {
          await sock.sendMessage(group, { text: '❌ اللعبة قيد التشغيل.' });
          return;
        }

        if (game.players.length < 4) {
          await sock.sendMessage(group, { text: '❌ يجب أن يكون على الأقل 4 لاعبين.' });
          return;
        }

        game.adminJid = user;
        await startMafiaGame(sock, group, game);
        return;
      }

      // التصويت بالنهار
      if (game.started && !game.nightPhase) {
        const voter = game.players.find(p => p.jid === user && p.isAlive);
        if (!voter) return;

        const targetNickname = trimmed;
        const target = game.players.find(p => p.nickname === targetNickname && p.isAlive);

        if (target) {
          game.votes[user] = target.jid;
          const totalVotes = Object.keys(game.votes).length;
          const aliveCount = game.players.filter(p => p.isAlive).length;

          await sock.sendMessage(group, {
            text: `🗳️ @${user.split("@")[0]} صوت ضد *${target.nickname}*\n📊 الأصوات: ${totalVotes}/${aliveCount}`,
            mentions: [user]
          });

          if (totalVotes >= aliveCount) {
            clearTimeout(game.phaseTimer);
            endDayPhase(sock, group, game);
          }
        }
        return;
      }

    } catch (err) { console.error("[MAFIA]", err); }
  });

  // مستمع للرسائل الخاصة (للأدوار)
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const ms = m.messages[0];
      if (!ms?.message) return;

      const userJid = ms.key.remoteJid;
      if (userJid.endsWith('@g.us')) return;

      let activeGame = null;
      let activeGroup = null;
      for (const [gid, g] of Object.entries(mafiaGames)) {
        if (g.players.find(p => p.jid === userJid)) {
          activeGame = g;
          activeGroup = gid;
          break;
        }
      }

      if (!activeGame || !activeGame.started || !activeGame.nightPhase) return;

      const player = activeGame.players.find(p => p.jid === userJid);
      if (!player || !player.isAlive) return;

      const body = (ms.message.conversation) || (ms.message.extendedTextMessage?.text) || "";
      const trimmed = body.trim();

      if (player.role === 'mafia' && trimmed.startsWith('اقتل')) {
        const targetNickname = trimmed.substring(4).trim();
        const target = activeGame.players.find(p => p.nickname === targetNickname && p.isAlive);
        if (target) {
          activeGame.mafiaTarget = target.jid;
          await sock.sendMessage(userJid, { text: `🔪 تم اختيار قتل: ${target.nickname}` });
          checkNightComplete(sock, activeGroup, activeGame);
        } else {
          await sock.sendMessage(userJid, { text: '❌ اللاعب غير موجود أو ميت.' });
        }
      }

      if (player.role === 'doctor' && trimmed.startsWith('احمي')) {
        const targetNickname = trimmed.substring(4).trim();
        const target = activeGame.players.find(p => p.nickname === targetNickname && p.isAlive);
        if (target) {
          activeGame.doctorTarget = target.jid;
          await sock.sendMessage(userJid, { text: `💉 تم اختيار حماية: ${target.nickname}` });
          checkNightComplete(sock, activeGroup, activeGame);
        } else {
          await sock.sendMessage(userJid, { text: '❌ اللاعب غير موجود أو ميت.' });
        }
      }

      if (player.role === 'detective' && trimmed.startsWith('حقق')) {
        const targetNickname = trimmed.substring(4).trim();
        const target = activeGame.players.find(p => p.nickname === targetNickname && p.isAlive);
        if (target) {
          activeGame.detectiveTarget = target.jid;
          const isMafia = target.role === 'mafia';
          await sock.sendMessage(userJid, { text: `🔍 نتيجة التحقيق عن ${target.nickname}:\n${isMafia ? '⚠️ هو مافيا!' : '✅ هو مواطن بريء.'}` });
          checkNightComplete(sock, activeGroup, activeGame);
        } else {
          await sock.sendMessage(userJid, { text: '❌ اللاعب غير موجود أو ميت.' });
        }
      }

    } catch (err) { console.error("[MAFIA]", err); }
  });
}

async function startMafiaGame(sock, group, game) {
  game.started = true;
  game.round = 0;

  const roles = assignRoles(game.players.length);
  game.players.forEach((player, index) => { player.role = roles[index]; });

  for (const player of game.players) {
    let roleMsg = '';
    let otherPlayers = game.players.filter(p => p.jid !== player.jid && p.isAlive).map(p => `• ${p.nickname}`).join('\n');

    switch (player.role) {
      case 'mafia':
        const otherMafia = game.players.filter(p => p.role === 'mafia' && p.jid !== player.jid).map(p => p.nickname);
        roleMsg = `🎭 أنت *المافيا*! 🔪\n\nمهمتك: اختيار شخص تذبحه كل ليلة.\n${otherMafia.length > 0 ? `👥 زملائك المافيا: ${otherMafia.join(', ')}` : '⚠️ أنت المافيا الوحيد'}\n\n📝 *كيفية اللعب:* ارسل: *اقتل (اللقب)*\n\n📋 اللاعبين:\n${otherPlayers}`;
        break;
      case 'doctor':
        roleMsg = `🎭 أنت *الدكتور*! 💉\n\nمهمتك: اختيار شخص تحميه من المافيا كل ليلة.\n\n📝 *كيفية اللعب:* ارسل: *احمي (اللقب)*\n\n📋 اللاعبين:\n${otherPlayers}`;
        break;
      case 'detective':
        roleMsg = `🎭 أنت *المحقق*! 🔍\n\nمهمتك: اكتشف من المافيا بالتحقق من لاعب كل ليلة.\n\n📝 *كيفية اللعب:* ارسل: *حقق (اللقب)*\n\n📋 اللاعبين:\n${otherPlayers}`;
        break;
      default:
        roleMsg = `🎭 أنت *مواطن بريء*! 👥\n\nمهمتك: اكتشف المافيا وصوت ضدهم بالنهار.\n\n📝 *كيفية التصويت:* بالنهار ارسل *لقب* الشخص مباشرة في القروب.`;
    }

    try { await sock.sendMessage(player.jid, { text: roleMsg }); } catch (e) {}
  }

  await sock.sendMessage(group, {
    text: `🎉 *بدأت لعبة المافيا!*\n\n👥 اللاعبين (${game.players.length}):\n${game.players.map(p => `• ${p.nickname}`).join('\n')}\n\n🌙 ستبدأ الليلة الأولى بعد 5 ثواني...`,
    mentions: game.players.map(p => p.jid)
  });

  setTimeout(() => startNightPhase(sock, group, game), 5000);
}

function assignRoles(playerCount) {
  let roles = [];
  if (playerCount >= 8) roles = ['mafia', 'mafia', 'doctor', 'detective'];
  else if (playerCount >= 6) roles = ['mafia', 'mafia', 'doctor', 'detective'];
  else if (playerCount >= 4) roles = ['mafia', 'doctor', 'detective'];
  while (roles.length < playerCount) roles.push('citizen');
  return roles.sort(() => Math.random() - 0.5);
}

async function startNightPhase(sock, group, game) {
  game.nightPhase = true;
  game.round++;
  game.mafiaTarget = game.doctorTarget = game.detectiveTarget = null;
  game.votes = {};

  const aliveMafia = game.players.filter(p => p.role === 'mafia' && p.isAlive).length;
  const aliveDoctor = game.players.filter(p => p.role === 'doctor' && p.isAlive).length;
  const aliveDetective = game.players.filter(p => p.role === 'detective' && p.isAlive).length;

  await sock.sendMessage(group, {
    text: `🌙 *الليلة ${game.round}*\n\nالجميع ناموا... 😴\n${aliveMafia > 0 ? '🔪 المافيا تختار ضحيتها\n' : ''}${aliveDoctor > 0 ? '💉 الدكتور يختار من يحمي\n' : ''}${aliveDetective > 0 ? '🔍 المحقق يحقق\n' : ''}\n⏱️ لديكم 60 ثانية.`
  });

  game.phaseTimer = setTimeout(() => endNightPhase(sock, group, game), game.phaseTime);
}

function checkNightComplete(sock, group, game) {
  const aliveMafia = game.players.filter(p => p.role === 'mafia' && p.isAlive).length;
  const aliveDoctor = game.players.filter(p => p.role === 'doctor' && p.isAlive).length;
  const aliveDetective = game.players.filter(p => p.role === 'detective' && p.isAlive).length;

  if ((aliveMafia === 0 || game.mafiaTarget) && (aliveDoctor === 0 || game.doctorTarget) && (aliveDetective === 0 || game.detectiveTarget)) {
    clearTimeout(game.phaseTimer);
    endNightPhase(sock, group, game);
  }
}

async function endNightPhase(sock, group, game) {
  game.nightPhase = false;
  let resultMsg = `☀️ *شروق الشمس - الليلة ${game.round}*\n\n`;
  let killed = null;

  if (game.mafiaTarget && game.mafiaTarget !== game.doctorTarget) {
    killed = game.players.find(p => p.jid === game.mafiaTarget);
    if (killed) { killed.isAlive = false; resultMsg += `💀 *${killed.nickname}* [تم قتله هذه الليلة! كان] ${getRoleName(killed.role)}.\n\n`; }
  } else if (game.mafiaTarget && game.mafiaTarget === game.doctorTarget) {
    const saved = game.players.find(p => p.jid === game.doctorTarget);
    resultMsg += `💉 *${saved.nickname}* نجا من محاولة القتل بفضل الدكتور!\n\n`;
  } else { resultMsg += `🌙 لم يقتل أحد هذه الليلة.\n\n`; }

  if (await checkWin(sock, group, game, resultMsg)) return;

  const alivePlayers = game.players.filter(p => p.isAlive);
  resultMsg += `👥 *الأحياء (${alivePlayers.length}):*\n${alivePlayers.map(p => `• ${p.nickname}`).join('\n')}\n\n🗳️ *ارسل لقب الشخص للتصويت عليه!* (60 ثانية)`;
  await sock.sendMessage(group, { text: resultMsg, mentions: game.players.map(p => p.jid) });
  game.phaseTimer = setTimeout(() => endDayPhase(sock, group, game), game.phaseTime);
}

async function endDayPhase(sock, group, game) {
  const voteCounts = {};
  for (const [voterJid, votedJid] of Object.entries(game.votes)) voteCounts[votedJid] = (voteCounts[votedJid] || 0) + 1;

  let maxVotes = 0, executedJid = null, tie = false;
  for (const [jid, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) { maxVotes = count; executedJid = jid; tie = false; }
    else if (count === maxVotes && maxVotes > 0) tie = true;
  }

  let resultMsg = `🌅 *انتهى النهار*\n\n`;
  if (executedJid && !tie && maxVotes > 0) {
    const executed = game.players.find(p => p.jid === executedJid);
    executed.isAlive = false;
    resultMsg += `⚰️ تم إعدام *${executed.nickname}*!\n🎭 كان ${getRoleName(executed.role)}\n\n`;
  } else { resultMsg += `🤷 لم يتم إعدام أحد ${tie ? '(تعادل الأصوات)' : ''}\n\n`; }

  if (await checkWin(sock, group, game, resultMsg)) return;
  await sock.sendMessage(group, { text: resultMsg, mentions: game.players.map(p => p.jid) });
  setTimeout(() => startNightPhase(sock, group, game), 5000);
}

async function checkWin(sock, group, game, currentMsg) {
  const aliveMafia = game.players.filter(p => p.role === 'mafia' && p.isAlive).length;
  const aliveCitizens = game.players.filter(p => p.role !== 'mafia' && p.isAlive).length;

  if (aliveMafia === 0) {
    await _awardMany(sock, group, game.players.filter((p) => p.role !== 'mafia').map((p) => p.jid), "مافيا");
    await sock.sendMessage(group, { text: currentMsg + `🏆 *فاز المواطنون!* المافيا تم القضاء عليها.`, mentions: game.players.map(p => p.jid) });
    delete mafiaGames[group]; return true;
  }
  if (aliveMafia >= aliveCitizens) {
    await _awardMany(sock, group, game.players.filter((p) => p.role === 'mafia').map((p) => p.jid), "مافيا");
    await sock.sendMessage(group, { text: currentMsg + `🗡️ *فازت المافيا!* سيطروا على القرية.`, mentions: game.players.map(p => p.jid) });
    delete mafiaGames[group]; return true;
  }
  return false;
}

function getRoleName(role) {
  return { 'mafia': 'مافيا 🔪', 'doctor': 'دكتور 💉', 'detective': 'محقق 🔍', 'citizen': 'مواطن بريء 👥' }[role] || 'مجهول';
}

export default { BlueSky, execute };
