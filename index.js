const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences
    ]
});

const prefix = config.prefix;
const warns = new Map();
const mutes = new Map();
const cases = new Map();
const userMessages = new Map();

let caseNumber = 1;

client.on('ready', () => {
    console.log(`${client.user.tag} aktif!`);
    client.user.setActivity('Sunucuyu Koruyorum | !yardım', { type: 3 });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (config.serverSettings.antiSpamEnabled) {
        const userId = message.author.id;
        const userMsgs = userMessages.get(userId) || [];
        const now = Date.now();
        const recentMsgs = userMsgs.filter(timestamp => now - timestamp < config.autoMod.messageInterval);
        
        if (recentMsgs.length >= config.autoMod.maxMessages) {
            try {
                await message.delete();
                const warning = await message.channel.send(`${message.author} spam yapma!`);
                setTimeout(() => warning.delete(), 3000);
                return;
            } catch (e) {}
        }
        
        recentMsgs.push(now);
        userMessages.set(userId, recentMsgs);
    }

    if (config.serverSettings.antiLinkEnabled && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        if (message.content.match(/(https?:\/\/|www\.)/gi)) {
            try {
                await message.delete();
                const warning = await message.channel.send(`${message.author} link göndermek yasak!`);
                setTimeout(() => warning.delete(), 3000);
                return;
            } catch (e) {}
        }
    }

    if (config.serverSettings.autoModEnabled) {
        const content = message.content.toLowerCase();
        for (const word of config.autoMod.bannedWords) {
            if (content.includes(word.toLowerCase())) {
                try {
                    await message.delete();
                    const warning = await message.channel.send(`${message.author} küfür etme!`);
                    setTimeout(() => warning.delete(), 3000);
                    return;
                } catch (e) {}
            }
        }
    }

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'yardım' || command === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Moderasyon Bot - Komut Listesi')
            .setDescription('**Moderasyon Komutları (30 Komut)**')
            .addFields(
                { name: '👮 Temel Moderasyon', value: '`at`, `yasakla`, `yasakkaldır`, `sustur`, `susturkaldır`, `uyar`, `uyarılar`, `uyarısil`, `sil`, `kick`, `ban`, `unban`, `timeout`', inline: false },
                { name: '🔒 Kanal Yönetimi', value: '`kilitle`, `kilitleaç`, `yavaşmod`, `kapatgörünürlük`, `açgörünürlük`, `kanalolustur`, `kanalsil`, `yenile`', inline: false },
                { name: '👥 Üye Yönetimi', value: '`takmaadayarla`, `rolver`, `rolal`, `temizleroller`, `üyebilgi`, `rolbilgi`', inline: false },
                { name: '📊 Moderasyon Kayıtları', value: '`vakalar`, `vaka`, `sayaç`, `logayarla`, `modlog`', inline: false },
                { name: '⚙️ Ayarlar', value: '`automod`, `antispam`, `antilink`, `yasaklıkelime`, `ayarlar`', inline: false }
            )
            .setColor(config.colors.mod)
            .setFooter({ text: `Prefix: ${prefix}` });
        message.reply({ embeds: [embed] });
    }

    if (command === 'at' || command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('❌ Yetkin yok!');
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Bir üye etiketle!');
        if (!member.kickable) return message.reply('❌ Bu üyeyi atamam!');
        const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
        
        await member.kick(reason);
        
        const embed = new EmbedBuilder()
            .setTitle('👢 Üye Atıldı')
            .addFields(
                { name: 'Üye', value: `${member.user.tag} (${member.id})`, inline: true },
                { name: 'Yetkili', value: message.author.tag, inline: true },
                { name: 'Sebep', value: reason, inline: false }
            )
            .setColor(config.colors.error)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
        logAction('KICK', member.user, message.author, reason);
    }

    if (command === 'yasakla' || command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Yetkin yok!');
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Bir üye etiketle!');
        if (!member.bannable) return message.reply('❌ Bu üyeyi yasaklayamam!');
        const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
        
        await member.ban({ reason, deleteMessageDays: 1 });
        
        const embed = new EmbedBuilder()
            .setTitle('🔨 Üye Yasaklandı')
            .addFields(
                { name: 'Üye', value: `${member.user.tag} (${member.id})`, inline: true },
                { name: 'Yetkili', value: message.author.tag, inline: true },
                { name: 'Sebep', value: reason, inline: false }
            )
            .setColor(config.colors.error)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
        logAction('BAN', member.user, message.author, reason);
    }

    if (command === 'yasakkaldır' || command === 'unban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Yetkin yok!');
        const userId = args[0];
        if (!userId) return message.reply('❌ Bir kullanıcı ID gir!');
        
        try {
            await message.guild.members.unban(userId);
            message.reply(`✅ <@${userId}> yasağı kaldırıldı!`);
            logAction('UNBAN', { id: userId, tag: userId }, message.author, 'Yasak kaldırıldı');
        } catch (e) {
            message.reply('❌ Bu kullanıcı yasaklı değil veya geçersiz ID!');
        }
    }

    if (command === 'sustur' || command === 'timeout' || command === 'mute') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok!');
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Bir üye etiketle!');
        const duration = parseInt(args[1]) || 10;
        const reason = args.slice(2).join(' ') || 'Sebep belirtilmedi';
        
        await member.timeout(duration * 60 * 1000, reason);
        
        const embed = new EmbedBuilder()
            .setTitle('🔇 Üye Susturuldu')
            .addFields(
                { name: 'Üye', value: `${member.user.tag}`, inline: true },
                { name: 'Süre', value: `${duration} dakika`, inline: true },
                { name: 'Sebep', value: reason, inline: false }
            )
            .setColor(config.colors.warning)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
        logAction('TIMEOUT', member.user, message.author, `${duration}dk - ${reason}`);
    }

    if (command === 'susturkaldır' || command === 'untimeout' || command === 'unmute') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok!');
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Bir üye etiketle!');
        
        await member.timeout(null);
        message.reply(`✅ ${member.user.tag} susturması kaldırıldı!`);
        logAction('UNTIMEOUT', member.user, message.author, 'Susturma kaldırıldı');
    }

    if (command === 'uyar' || command === 'warn') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok!');
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Bir üye etiketle!');
        const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
        
        const userWarns = warns.get(member.id) || [];
        userWarns.push({ 
            reason, 
            moderator: message.author.tag, 
            date: new Date().toLocaleString('tr-TR'),
            id: userWarns.length + 1
        });
        warns.set(member.id, userWarns);
        
        const embed = new EmbedBuilder()
            .setTitle('⚠️ Uyarı Verildi')
            .addFields(
                { name: 'Üye', value: member.user.tag, inline: true },
                { name: 'Toplam Uyarı', value: `${userWarns.length}/${config.serverSettings.maxWarnsBeforeBan}`, inline: true },
                { name: 'Sebep', value: reason, inline: false }
            )
            .setColor(config.colors.warning)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
        
        if (userWarns.length >= config.serverSettings.maxWarnsBeforeBan) {
            await member.ban({ reason: `${config.serverSettings.maxWarnsBeforeBan} uyarıya ulaştı` });
            message.channel.send(`🔨 ${member.user.tag} ${config.serverSettings.maxWarnsBeforeBan} uyarıya ulaştığı için yasaklandı!`);
        }
        
        logAction('WARN', member.user, message.author, reason);
    }

    if (command === 'uyarılar' || command === 'warns') {
        const member = message.mentions.members.first() || message.member;
        const userWarns = warns.get(member.id) || [];
        
        if (userWarns.length === 0) return message.reply('✅ Bu kullanıcının uyarısı yok!');
        
        const embed = new EmbedBuilder()
            .setTitle(`⚠️ ${member.user.tag} - Uyarılar`)
            .setDescription(userWarns.map(w => `**#${w.id}** ${w.reason}\n*Yetkili: ${w.moderator} | ${w.date}*`).join('\n\n'))
            .setColor(config.colors.warning)
            .setFooter({ text: `Toplam: ${userWarns.length} uyarı` });
        
        message.reply({ embeds: [embed] });
    }

    if (command === 'uyarısil' || command === 'unwarn') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok!');
        const member = message.mentions.members.first();
        const warnId = parseInt(args[1]);
        
        if (!member) return message.reply('❌ Bir üye etiketle!');
        
        const userWarns = warns.get(member.id) || [];
        
        if (warnId) {
            const index = userWarns.findIndex(w => w.id === warnId);
            if (index === -1) return message.reply('❌ Uyarı bulunamadı!');
            userWarns.splice(index, 1);
            warns.set(member.id, userWarns);
            message.reply(`✅ ${member.user.tag} kullanıcısının #${warnId} numaralı uyarısı silindi!`);
        } else {
            warns.delete(member.id);
            message.reply(`✅ ${member.user.tag} kullanıcısının tüm uyarıları temizlendi!`);
        }
    }

    if (command === 'sil' || command === 'clear' || command === 'purge') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply('❌ Yetkin yok!');
        const amount = parseInt(args[0]);
        
        if (!amount || amount < 1 || amount > 100) return message.reply('❌ 1-100 arası sayı gir!');
        
        const messages = await message.channel.bulkDelete(amount + 1, true);
        const reply = await message.channel.send(`✅ ${messages.size - 1} mesaj silindi!`);
        setTimeout(() => reply.delete(), 3000);
        
        logAction('PURGE', null, message.author, `${messages.size - 1} mesaj silindi`);
    }

    if (command === 'kilitle' || command === 'lock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Yetkin yok!');
        
        await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
        
        const embed = new EmbedBuilder()
            .setDescription('🔒 Bu kanal kilitlendi!')
            .setColor(config.colors.error);
        
        message.reply({ embeds: [embed] });
        logAction('LOCK', null, message.author, `#${message.channel.name} kilitlendi`);
    }

    if (command === 'kilitleaç' || command === 'unlock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Yetkin yok!');
        
        await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
        
        const embed = new EmbedBuilder()
            .setDescription('🔓 Bu kanal kilidi açıldı!')
            .setColor(config.colors.success);
        
        message.reply({ embeds: [embed] });
        logAction('UNLOCK', null, message.author, `#${message.channel.name} kilidi açıldı`);
    }

    if (command === 'yavaşmod' || command === 'slowmode') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Yetkin yok!');
        const seconds = parseInt(args[0]);
        
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) return message.reply('❌ 0-21600 arası saniye gir!');
        
        await message.channel.setRateLimitPerUser(seconds);
        message.reply(`⏱️ Yavaş mod ${seconds} saniye olarak ayarlandı!`);
        logAction('SLOWMODE', null, message.author, `#${message.channel.name} - ${seconds}s`);
    }

    if (command === 'kapatgörünürlük' || command === 'hide') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Yetkin yok!');
        
        await message.channel.permissionOverwrites.edit(message.guild.id, { ViewChannel: false });
        message.reply('👁️ Kanal gizlendi!');
    }

    if (command === 'açgörünürlük' || command === 'show') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Yetkin yok!');
        
        await message.channel.permissionOverwrites.edit(message.guild.id, { ViewChannel: null });
        message.reply('👁️ Kanal görünür yapıldı!');
    }

    if (command === 'yenile' || command === 'nuke') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Yetkin yok!');
        
        const channel = message.channel;
        const position = channel.position;
        const newChannel = await channel.clone();
        await channel.delete();
        await newChannel.setPosition(position);
        
        const embed = new EmbedBuilder()
            .setTitle('💥 Kanal Yenilendi!')
            .setDescription('Bu kanal başarıyla yenilendi.')
            .setColor(config.colors.success);
        
        newChannel.send({ embeds: [embed] });
    }

    if (command === 'kanalolustur' || command === 'createchannel') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Yetkin yok!');
        const channelName = args.join('-');
        if (!channelName) return message.reply('❌ Kanal adı gir!');
        
        const channel = await message.guild.channels.create({ name: channelName });
        message.reply(`✅ ${channel} kanalı oluşturuldu!`);
    }

    if (command === 'kanalsil' || command === 'deletechannel') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Yetkin yok!');
        
        await message.channel.delete();
    }

    if (command === 'takmaadayarla' || command === 'setnick') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return message.reply('❌ Yetkin yok!');
        const member = message.mentions.members.first();
        const nickname = args.slice(1).join(' ');
        
        if (!member) return message.reply('❌ Bir üye etiketle!');
        
        await member.setNickname(nickname || null);
        message.reply(`✅ ${member.user.tag} takma adı değiştirildi!`);
    }

    if (command === 'rolver' || command === 'giverole') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkin yok!');
        const member = message.mentions.members.first();
        const role = message.mentions.roles.first();
        
        if (!member || !role) return message.reply('❌ Üye ve rol etiketle!');
        
        await member.roles.add(role);
        message.reply(`✅ ${member.user.tag} kullanıcısına ${role.name} rolü verildi!`);
        logAction('ROLE_ADD', member.user, message.author, `Rol: ${role.name}`);
    }

    if (command === 'rolal' || command === 'removerole') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkin yok!');
        const member = message.mentions.members.first();
        const role = message.mentions.roles.first();
        
        if (!member || !role) return message.reply('❌ Üye ve rol etiketle!');
        
        await member.roles.remove(role);
        message.reply(`✅ ${member.user.tag} kullanıcısından ${role.name} rolü alındı!`);
        logAction('ROLE_REMOVE', member.user, message.author, `Rol: ${role.name}`);
    }

    if (command === 'temizleroller' || command === 'clearroles') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkin yok!');
        const member = message.mentions.members.first();
        
        if (!member) return message.reply('❌ Bir üye etiketle!');
        
        await member.roles.set([]);
        message.reply(`✅ ${member.user.tag} kullanıcısının rolleri temizlendi!`);
    }

    if (command === 'üyebilgi' || command === 'memberinfo') {
        const member = message.mentions.members.first() || message.member;
        const roles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r).join(', ') || 'Rol yok';
        
        const embed = new EmbedBuilder()
            .setTitle(`👤 ${member.user.tag}`)
            .setThumbnail(member.user.displayAvatarURL({ size: 512 }))
            .addFields(
                { name: 'ID', value: member.id, inline: true },
                { name: 'Durum', value: member.presence?.status || 'Offline', inline: true },
                { name: 'Katılma', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
                { name: 'Hesap Oluşturma', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Roller', value: roles.length > 1024 ? 'Çok fazla rol' : roles, inline: false }
            )
            .setColor(config.colors.primary);
        
        message.reply({ embeds: [embed] });
    }

    if (command === 'rolbilgi' || command === 'roleinfo') {
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Bir rol etiketle!');
        
        const embed = new EmbedBuilder()
            .setTitle(`🎭 ${role.name}`)
            .addFields(
                { name: 'ID', value: role.id, inline: true },
                { name: 'Renk', value: role.hexColor, inline: true },
                { name: 'Üyeler', value: `${role.members.size}`, inline: true },
                { name: 'Sıralama', value: `${role.position}`, inline: true },
                { name: 'Oluşturma', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setColor(role.hexColor);
        
        message.reply({ embeds: [embed] });
    }

    if (command === 'vakalar' || command === 'cases') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok!');
        
        const allCases = Array.from(cases.values());
        if (allCases.length === 0) return message.reply('❌ Hiç vaka kaydı yok!');
        
        const embed = new EmbedBuilder()
            .setTitle('📋 Moderasyon Vakaları')
            .setDescription(allCases.slice(-10).map(c => `**#${c.id}** ${c.action} - ${c.target} - ${c.reason}`).join('\n'))
            .setColor(config.colors.mod)
            .setFooter({ text: `Toplam ${allCases.length} vaka` });
        
        message.reply({ embeds: [embed] });
    }

    if (command === 'vaka' || command === 'case') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok!');
        const caseId = parseInt(args[0]);
        
        if (!caseId) return message.reply('❌ Vaka numarası gir!');
        
        const caseData = cases.get(caseId);
        if (!caseData) return message.reply('❌ Vaka bulunamadı!');
        
        const embed = new EmbedBuilder()
            .setTitle(`📋 Vaka #${caseId}`)
            .addFields(
                { name: 'İşlem', value: caseData.action, inline: true },
                { name: 'Hedef', value: caseData.target, inline: true },
                { name: 'Yetkili', value: caseData.moderator, inline: true },
                { name: 'Sebep', value: caseData.reason, inline: false },
                { name: 'Tarih', value: caseData.date, inline: true }
            )
            .setColor(config.colors.mod);
        
        message.reply({ embeds: [embed] });
    }

    if (command === 'sayaç' || command === 'stats') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok!');
        
        const totalCases = cases.size;
        const totalWarns = Array.from(warns.values()).reduce((a, b) => a + b.length, 0);
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Moderasyon İstatistikleri')
            .addFields(
                { name: 'Toplam Vaka', value: `${totalCases}`, inline: true },
                { name: 'Toplam Uyarı', value: `${totalWarns}`, inline: true },
                { name: 'Aktif Susturma', value: `${mutes.size}`, inline: true }
            )
            .setColor(config.colors.mod);
        
        message.reply({ embeds: [embed] });
    }

    if (command === 'logayarla' || command === 'setlog') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('❌ Yetkin yok!');
        
        config.serverSettings.logChannelID = message.channel.id;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
        
        message.reply('✅ Log kanalı ayarlandı!');
    }

    if (command === 'automod') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('❌ Yetkin yok!');
        
        config.serverSettings.autoModEnabled = !config.serverSettings.autoModEnabled;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
        
        message.reply(`${config.serverSettings.autoModEnabled ? '✅ AutoMod açıldı!' : '❌ AutoMod kapatıldı!'}`);
    }

    if (command === 'antispam') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('❌ Yetkin yok!');
        
        config.serverSettings.antiSpamEnabled = !config.serverSettings.antiSpamEnabled;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
        
        message.reply(`${config.serverSettings.antiSpamEnabled ? '✅ Anti-Spam açıldı!' : '❌ Anti-Spam kapatıldı!'}`);
    }

    if (command === 'antilink') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('❌ Yetkin yok!');
        
        config.serverSettings.antiLinkEnabled = !config.serverSettings.antiLinkEnabled;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
        
        message.reply(`${config.serverSettings.antiLinkEnabled ? '✅ Anti-Link açıldı!' : '❌ Anti-Link kapatıldı!'}`);
    }

    if (command === 'yasaklıkelime' || command === 'badword') {
        if (!message.member.permissions.has(Perm
