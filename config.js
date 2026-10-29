let prefix = '.';

//بيانات افتراضية
const config = {
    botName: 'Blue Sky',
    version: '4.0.0',
    owner: '972533933401',

    defaultPrefix: '.',

    pairing:{
        phone:null,
        code :null,
    },


    botState:{
        bot: "on",
        mode: "off",
        bluesky: "on",
    },


    blueSkyInfo: {
    ceiling: "𝐁𝐋𝐀𝐂𝐊 ✦",
    name: "𝐁𝐋𝐀𝐂𝐊 𝐔𝐋𝐓𝐑𝐀 𝐙𝐄𝐑𝐎",
    description: "𝚄𝙻𝚃𝚁𝙰 𝙽𝙾𝚅𝙰 𝚅𝙴𝚁",
    verification: true,
    media: false
},

    get prefix() {
        return prefix;
    },

    set prefix(newPrefix) {
        if (newPrefix && typeof newPrefix === 'string') {
            prefix = newPrefix;
        }
    },

    allowedGroups: [],

    messages: {
        error: '❌ حدث خطأ أثناء تنفيذ الأمر',
        noPermission: 'ليس لديك صلاحية لاستخدام هذا الأمر',
        groupOnly: 'هذا الأمر متاح فقط في المجموعات',
        ownerOnly: 'هذا الأمر متاح فقط للنخبة',
        notAllowedGroup: 'عذراً، البوت لا يعمل في هذه المجموعة'
    },

    colors: {
        success: '\x1b[38;2;255;255;0m',
        error:   '\x1b[38;2;255;80;120m',
        info:    '\x1b[38;2;140;120;255m',
        warn:    '\x1b[38;2;255;200;0m',
        reset:   '\x1b[0m'
    },
};

export default config;
