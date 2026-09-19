const { EmbedBuilder, escapeMarkdown } = require('discord.js');
const MemberLogConfig = require('../database/models/MemberLogConfig');
const MemberIdentity = require('../database/models/MemberIdentity');

const getMemberLogConfig = (guildId) => MemberLogConfig.findOne({ guildId });

const setMemberLogConfig = ({ guildId, welcomeChannelId, farewellChannelId, updatedBy }) => (
  MemberLogConfig.findOneAndUpdate(
    { guildId },
    { guildId, welcomeChannelId, farewellChannelId, updatedBy, updatedAt: new Date() },
    { upsert: true, new: true, runValidators: true },
  )
);

const clearMemberLogConfig = async (guildId) => {
  const result = await MemberLogConfig.findOneAndDelete({ guildId });
  await MemberIdentity.deleteMany({ guildId });
  return result;
};

const avatarUrlFor = (user) => user?.displayAvatarURL?.({ extension: 'png', size: 4096 }) || '';

const identityFromMember = (member) => ({
  guildId: member.guild.id,
  userId: member.id,
  displayName: member.displayName || member.nickname || member.user.globalName || member.user.username,
  nickname: member.nickname || null,
  username: member.user.username,
  globalName: member.user.globalName || null,
  avatarUrl: avatarUrlFor(member.user),
  isBot: Boolean(member.user.bot),
  updatedAt: new Date(),
});

const saveMemberIdentity = (member) => {
  const identity = identityFromMember(member);
  return MemberIdentity.findOneAndUpdate(
    { guildId: identity.guildId, userId: identity.userId },
    identity,
    { upsert: true, new: true, runValidators: true },
  );
};

const syncGuildMembers = async (guild) => {
  const members = await guild.members.fetch();
  const operations = Array.from(members.values()).map((member) => {
    const identity = identityFromMember(member);
    return {
      updateOne: {
        filter: { guildId: identity.guildId, userId: identity.userId },
        update: { $set: identity },
        upsert: true,
      },
    };
  });
  for (let index = 0; index < operations.length; index += 1000) {
    await MemberIdentity.bulkWrite(operations.slice(index, index + 1000), { ordered: false });
  }
  return operations.length;
};

const syncConfiguredGuildMembers = async (client) => {
  const configs = await MemberLogConfig.find({}).select('guildId');
  let synced = 0;
  for (const config of configs) {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) continue;
    try {
      synced += await syncGuildMembers(guild);
    } catch (error) {
      console.error(`[WARN] No se pudieron sincronizar los nombres de ${guild.name}:`, error.message);
    }
  }
  return synced;
};

const safeName = (value, fallback = 'Sin nombre') => escapeMarkdown(String(value || fallback));

const buildMemberEmbed = ({ kind, member, identity, botUser }) => {
  const isWelcome = kind === 'welcome';
  const current = identity || identityFromMember(member);
  const assignedName = current.displayName || current.nickname || current.globalName || current.username;
  const originalName = current.globalName || current.username;
  const avatarUrl = avatarUrlFor(member.user) || current.avatarUrl;
  const botLogo = botUser?.displayAvatarURL?.({ extension: 'png', size: 256 });
  const embed = new EmbedBuilder()
    .setTitle(isWelcome ? '👋 Nuevo miembro' : '👋 Miembro que salió')
    .setColor(isWelcome ? 0x57f287 : 0xed4245)
    .setDescription(isWelcome
      ? `<@${member.id}> se unió a **${safeName(member.guild.name)}**.`
      : `El usuario con ID \`${member.id}\` salió de **${safeName(member.guild.name)}**.`)
    .addFields(
      { name: 'Nombre asignado en el servidor', value: safeName(assignedName), inline: true },
      { name: 'Nombre original', value: safeName(originalName), inline: true },
      { name: 'Usuario de Discord', value: `@${safeName(current.username)}`, inline: true },
      { name: 'Tipo de cuenta', value: current.isBot ? 'Bot' : 'Persona', inline: true },
      { name: 'Miembros en el servidor', value: String(member.guild.memberCount), inline: true },
      { name: 'ID', value: `\`${member.id}\``, inline: true },
    )
    .setTimestamp();
  if (avatarUrl) embed.setImage(avatarUrl);
  if (botLogo) {
    embed.setThumbnail(botLogo).setFooter({ text: botUser.username, iconURL: botLogo });
  }
  return embed;
};

const sendConfiguredLog = async ({ member, channelId, embed }) => {
  const channel = member.guild.channels.cache.get(channelId)
    || await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || typeof channel.send !== 'function') {
    console.warn(`[WARN] Canal de registro de miembros no disponible en ${member.guild.name}: ${channelId}`);
    return false;
  }
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  return true;
};

const handleMemberJoin = async (member, botUser = member.client?.user) => {
  const config = await getMemberLogConfig(member.guild.id);
  if (!config) return false;
  const identity = await saveMemberIdentity(member);
  const embed = buildMemberEmbed({ kind: 'welcome', member, identity, botUser });
  return sendConfiguredLog({ member, channelId: config.welcomeChannelId, embed });
};

const handleMemberUpdate = async (member) => {
  const config = await getMemberLogConfig(member.guild.id);
  if (!config) return false;
  await saveMemberIdentity(member);
  return true;
};

const handleMemberLeave = async (member, botUser = member.client?.user) => {
  const [config, storedIdentity] = await Promise.all([
    getMemberLogConfig(member.guild.id),
    MemberIdentity.findOne({ guildId: member.guild.id, userId: member.id }),
  ]);
  if (!config) return false;
  // GuildMemberRemove puede traer solo el usuario. La instantánea conserva el
  // último apodo que el miembro tenía dentro del servidor.
  const currentIdentity = identityFromMember(member);
  const stored = storedIdentity?.toObject?.() || storedIdentity;
  const identity = stored ? {
    ...stored,
    // El evento de salida sí incluye el User actual, aunque pueda omitir el
    // apodo del servidor. Así se conserva el nombre asignado y se refrescan la
    // identidad global y la foto de Discord.
    username: currentIdentity.username,
    globalName: currentIdentity.globalName,
    avatarUrl: currentIdentity.avatarUrl,
    isBot: currentIdentity.isBot,
  } : currentIdentity;
  const embed = buildMemberEmbed({ kind: 'farewell', member, identity, botUser });
  return sendConfiguredLog({ member, channelId: config.farewellChannelId, embed });
};

module.exports = {
  buildMemberEmbed,
  clearMemberLogConfig,
  getMemberLogConfig,
  handleMemberJoin,
  handleMemberLeave,
  handleMemberUpdate,
  identityFromMember,
  saveMemberIdentity,
  setMemberLogConfig,
  syncConfiguredGuildMembers,
  syncGuildMembers,
};
