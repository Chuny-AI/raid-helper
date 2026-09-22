const {
  EmbedBuilder, PermissionFlagsBits, escapeMarkdown,
} = require('discord.js');
const AlbionRegistrationConfig = require('../database/models/AlbionRegistrationConfig');
const AlbionMembershipRule = require('../database/models/AlbionMembershipRule');
const AlbionRegistration = require('../database/models/AlbionRegistration');
const albionApi = require('./albionApiService');

const DEFAULT_INTERVAL_MINUTES = 360;
const MISMATCH_RECHECK_MINUTES = 12 * 60;
const MISMATCH_GRACE_MINUTES = 72 * 60;
const MIN_MISMATCH_CONFIRMATIONS = 3;
const MAX_RULES = 25;
const runningUsers = new Set();
let sweepRunning = false;

class RegistrationError extends Error {
  constructor(message, code = 'registration_error') {
    super(message);
    this.name = 'RegistrationError';
    this.code = code;
  }
}

const clean = (text) => escapeMarkdown(String(text || '').replace(/\s+/g, ' ')).slice(0, 100);
const lockKey = (guildId, userId) => `${guildId}:${userId}`;
const nextCheckAt = (minutes) => new Date(Date.now() + minutes * 60_000);

const getConfig = (guildId) => AlbionRegistrationConfig.findOne({ guildId });
const getRules = (guildId) => AlbionMembershipRule.find({ guildId, entityType: 'guild' }).sort({ entityName: 1 });
const getRegistration = (guildId, discordUserId) => AlbionRegistration.findOne({ guildId, discordUserId });

const configure = async ({ guildId, region, auditChannelId, updatedBy }) => {
  if (!Object.hasOwn(albionApi.REGION_BASE_URLS, region)) {
    throw new RegistrationError('Selecciona Americas, Europe o Asia.');
  }
  const previous = await getConfig(guildId);
  const registeredCount = await AlbionRegistration.countDocuments({ guildId });
  const ruleCount = await AlbionMembershipRule.countDocuments({ guildId, entityType: 'guild' });
  if (previous && previous.region !== region && (registeredCount > 0 || ruleCount > 0)) {
    throw new RegistrationError('Hay reglas o personajes vinculados en esta región. Elimínalos antes de cambiarla.');
  }
  return AlbionRegistrationConfig.findOneAndUpdate(
    { guildId },
    { $set: { region, approvalMode: 'automatic', auditChannelId, updatedBy, updatedAt: new Date(), enabled: true } },
    { upsert: true, new: true, runValidators: true },
  );
};

const validateRoles = (guild, roleIds) => {
  const ids = [...new Set(roleIds || [])];
  if (ids.length < 1 || ids.length > 25) throw new RegistrationError('Selecciona entre 1 y 25 roles.');
  const bot = guild.members.me;
  if (!bot?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    throw new RegistrationError('El bot necesita el permiso Gestionar roles.');
  }
  for (const id of ids) {
    const role = guild.roles.cache.get(id);
    if (!role || role.id === guild.id || role.managed || !bot.roles.highest || role.position >= bot.roles.highest.position) {
      throw new RegistrationError('Selecciona roles existentes, editables y por debajo del rol más alto del bot.');
    }
  }
  return ids;
};

const ruleRoles = (rule) => [...new Set(rule.primaryRoleId
  ? [rule.primaryRoleId, ...(rule.additionalRoleIds || [])]
  : (rule.roleIds || []))];
const ruleTag = (rule) => String(rule.entityTag || rule.entityName || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase();

const saveGuildRule = async ({ guild, entity, tag, primaryRoleId, additionalRoleIds = [], createdBy }) => {
  const config = await getConfig(guild.id);
  if (!config?.enabled) throw new RegistrationError('Selecciona la región en `/setup-registro`.');
  const normalizedTag = String(tag || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(normalizedTag)) throw new RegistrationError('La etiqueta debe tener entre 1 y 12 letras o números.');
  const ids = validateRoles(guild, [primaryRoleId, ...additionalRoleIds]);
  const existing = await AlbionMembershipRule.findOne({ guildId: guild.id, entityType: 'guild', entityId: entity.id });
  if (!existing && await AlbionMembershipRule.countDocuments({ guildId: guild.id, entityType: 'guild' }) >= MAX_RULES) {
    throw new RegistrationError(`Este servidor alcanzó el límite de ${MAX_RULES} reglas.`);
  }
  const rule = await AlbionMembershipRule.findOneAndUpdate(
    { guildId: guild.id, entityType: 'guild', entityId: entity.id },
    {
      $set: {
        entityName: entity.name,
        entityTag: normalizedTag,
        primaryRoleId,
        additionalRoleIds: ids.filter((id) => id !== primaryRoleId),
        roleIds: ids,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdBy, createdAt: new Date() },
    },
    { upsert: true, new: true, runValidators: true },
  );
  await AlbionRegistration.updateMany({ guildId: guild.id }, { $set: { nextCheckAt: new Date() } });
  return rule;
};

const matchingRule = (player, rules) => rules.find((rule) => rule.entityType === 'guild' && player.guildId && rule.entityId === player.guildId);
const matchingRoleIds = (player, rules) => new Set(ruleRoles(matchingRule(player, rules) || {}));

const removeGuildRule = async ({ guildId, entityId }) => {
  const result = await AlbionMembershipRule.deleteOne({ guildId, entityType: 'guild', entityId });
  if (result.deletedCount) await AlbionRegistration.updateMany({ guildId }, { $set: { nextCheckAt: new Date() } });
  return Boolean(result.deletedCount);
};

const sendAudit = async (guild, config, title, fields) => {
  if (!config?.auditChannelId) return false;
  try {
    const channel = await guild.channels.fetch(config.auditChannelId);
    if (!channel?.send) return false;
    const embed = new EmbedBuilder().setTitle(title).setColor(0x5865f2).addFields(fields).setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    console.error(`[WARN] No se pudo publicar auditoría Albion en ${guild.id}:`, error?.message);
    return false;
  }
};

const syncNickname = async (member, registration, player, rule) => {
  const bot = member.guild.members.me;
  if (!bot?.permissions?.has(PermissionFlagsBits.ManageNicknames) || !member.manageable) return false;
  const expected = rule ? `[${ruleTag(rule)}] ${player.name}`.slice(0, 32) : registration.originalNickname;
  if (!rule && member.nickname !== registration.managedNickname) return false;
  if (rule && !registration.managedNickname) registration.originalNickname = member.nickname || null;
  if (member.nickname !== expected) await member.setNickname(expected, rule ? 'Registro de gremio Albion' : 'Salida del gremio Albion');
  registration.managedNickname = rule ? expected : null;
  return true;
};

const reconcileRoles = async ({ member, registration, desired, rules }) => {
  const bot = member.guild.members.me;
  if (!bot?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    throw new RegistrationError('El bot perdió el permiso Gestionar roles.');
  }
  const previouslyAssigned = new Set(registration.assignedRoleIds || []);
  const toRemove = [...previouslyAssigned].filter((id) => !desired.has(id) && member.roles.cache.has(id));
  const toAdd = [...desired].filter((id) => !member.roles.cache.has(id));
  for (const id of [...toAdd, ...toRemove]) {
    const role = member.guild.roles.cache.get(id);
    if (!role) {
      if (toAdd.includes(id)) throw new RegistrationError(`Falta un rol configurado (${id}).`);
      continue;
    }
    if (role.managed || role.position >= bot.roles.highest.position) {
      throw new RegistrationError(`El bot no puede gestionar el rol ${role.name}.`);
    }
  }
  if (toRemove.length) await member.roles.remove(toRemove, 'Verificación de gremio en Albion');
  // Guardar primero la eliminación permite reintentar si Mongo falla justo
  // después de modificar Discord. Para altas, se reserva la propiedad del rol
  // antes de asignarlo; si Discord falla, el siguiente ciclo puede reintentar.
  const tracked = [...desired];
  if (tracked.length !== previouslyAssigned.size || tracked.some((id) => !previouslyAssigned.has(id))) {
    // Cada rol seleccionado en una regla queda bajo control del registro,
    // incluso si un administrador ya lo había concedido antes del registro.
    // Así también se retira cuando el personaje abandona el gremio.
    registration.assignedRoleIds = tracked;
    await registration.save();
  }
  if (toAdd.length) {
    await member.roles.add(toAdd, 'Verificación de gremio en Albion');
  }
  return { added: toAdd, removed: toRemove };
};

const applyPlayer = async ({ member, registration, player, config, rules }) => {
  const desired = matchingRoleIds(player, rules);
  const result = await reconcileRoles({ member, registration, desired, rules });
  const rule = matchingRule(player, rules);
  let nicknameUpdated = false;
  try {
    nicknameUpdated = await syncNickname(member, registration, player, rule);
  } catch (error) {
    console.error(`[WARN] No se pudo cambiar el apodo Albion de ${member.id}:`, error?.message);
  }
  registration.playerName = player.name;
  registration.lastGuildId = player.guildId;
  registration.lastGuildName = player.guildName;
  registration.lastAllianceId = player.allianceId;
  registration.lastAllianceName = player.allianceName;
  registration.lastValidatedAt = new Date();
  registration.nextCheckAt = nextCheckAt(desired.size ? (config.checkIntervalMinutes || DEFAULT_INTERVAL_MINUTES) : 60);
  registration.consecutiveMismatches = 0;
  registration.mismatchStartedAt = null;
  registration.mismatchGuildId = null;
  registration.lastError = null;
  registration.status = desired.size ? 'active' : 'unmatched';
  registration.updatedAt = new Date();
  await registration.save();
  if (result.added.length || result.removed.length) {
    await sendAudit(member.guild, config, '🔄 Roles de Albion actualizados', [
      { name: 'Miembro', value: `<@${member.id}>`, inline: true },
      { name: 'Personaje', value: clean(player.name), inline: true },
      { name: 'Gremio', value: clean(player.guildName || 'Sin gremio'), inline: true },
      { name: 'Añadidos', value: result.added.map((id) => `<@&${id}>`).join(', ') || 'Ninguno' },
      { name: 'Retirados', value: result.removed.map((id) => `<@&${id}>`).join(', ') || 'Ninguno' },
    ]);
  }
  return { ...result, desired, nicknameUpdated };
};

const registerPlayer = async ({ member, playerName }) => {
  const config = await getConfig(member.guild.id);
  if (!config?.enabled) throw new RegistrationError('El registro de Albion aún no está configurado.');
  const rules = await getRules(member.guild.id);
  if (!rules.length) throw new RegistrationError('Aún no hay gremios configurados.');
  const key = lockKey(member.guild.id, member.id);
  if (runningUsers.has(key)) throw new RegistrationError('Ya se está validando tu personaje. Espera un momento.');
  runningUsers.add(key);
  try {
    const player = await albionApi.findPlayerByName(config.region, playerName);
    const desired = matchingRoleIds(player, rules);
    if (!desired.size) throw new RegistrationError('Ese personaje no pertenece a ninguno de los gremios configurados.');
    const claimed = await AlbionRegistration.findOne({
      guildId: member.guild.id, region: config.region, playerId: player.id,
    });
    if (claimed && claimed.discordUserId !== member.id) {
      throw new RegistrationError('Ese personaje ya está vinculado a otra cuenta de Discord. Contacta a un administrador.');
    }
    let registration = await getRegistration(member.guild.id, member.id);
    if (registration && registration.playerId !== player.id) {
      throw new RegistrationError('Ya tienes otro personaje vinculado. Un administrador debe desvincularlo primero.');
    }
    const isNew = !registration;
    if (isNew) {
      registration = new AlbionRegistration({
        guildId: member.guild.id, discordUserId: member.id, playerId: player.id,
        playerName: player.name, region: config.region,
        status: 'active',
      });
      // Reserva el personaje antes de conceder roles para impedir que otra
      // cuenta se registre a la vez. Un índice único resuelve la carrera.
      await registration.save();
    }
    const result = await applyPlayer({ member, registration, player, config, rules });
    return { player, result, registration };
  } catch (error) {
    if (error?.code === 11000) {
      throw new RegistrationError('Este personaje ya está vinculado. Vuelve a intentarlo o consulta a un administrador.');
    }
    throw error;
  } finally {
    runningUsers.delete(key);
  }
};

const checkRegistration = async (guild, registration) => {
  const key = lockKey(guild.id, registration.discordUserId);
  if (runningUsers.has(key)) return { status: 'busy' };
  runningUsers.add(key);
  try {
    const config = await getConfig(guild.id);
    if (!config?.enabled || config.region !== registration.region) return { status: 'disabled' };
    const member = await guild.members.fetch(registration.discordUserId).catch(() => null);
    if (!member) {
      registration.status = 'discord_absent';
      registration.nextCheckAt = nextCheckAt(config.checkIntervalMinutes || DEFAULT_INTERVAL_MINUTES);
      await registration.save();
      return { status: 'discord_absent' };
    }
    const player = await albionApi.getPlayer(registration.region, registration.playerId);
    const rules = await getRules(guild.id);
    const desired = matchingRoleIds(player, rules);
    const current = new Set(registration.assignedRoleIds || []);
    const losesRole = [...current].some((id) => !desired.has(id));
    // Un cambio de reglas con el mismo gremio es inmediato; una salida o
    // cambio de gremio informado por la API necesita confirmaciones duraderas.
    if (losesRole && player.guildId !== registration.lastGuildId) {
      const now = new Date();
      const candidateGuildId = player.guildId || null;
      const priorCount = registration.consecutiveMismatches || 0;
      const priorAt = registration.lastValidatedAt ? new Date(registration.lastValidatedAt).getTime() : 0;
      const sameCandidate = priorCount > 0 && registration.mismatchGuildId === candidateGuildId;
      const startedAt = sameCandidate
        ? new Date(registration.mismatchStartedAt || registration.lastValidatedAt)
        : now;
      const separated = now.getTime() - priorAt >= MISMATCH_RECHECK_MINUTES * 60_000;
      const count = sameCandidate
        ? Math.min(MIN_MISMATCH_CONFIRMATIONS, priorCount + (separated ? 1 : 0))
        : 1;
      if (count < MIN_MISMATCH_CONFIRMATIONS
        || now.getTime() - startedAt.getTime() < MISMATCH_GRACE_MINUTES * 60_000) {
        registration.consecutiveMismatches = count;
        registration.mismatchStartedAt = startedAt;
        registration.mismatchGuildId = candidateGuildId;
        if (!sameCandidate || separated) registration.lastValidatedAt = now;
        registration.nextCheckAt = new Date(Math.max(
          now.getTime() + 60_000,
          new Date(registration.lastValidatedAt).getTime() + MISMATCH_RECHECK_MINUTES * 60_000,
        ));
        registration.lastError = null;
        await registration.save();
        return { status: 'pending_confirmation', player };
      }
    }
    const result = await applyPlayer({ member, registration, player, config, rules });
    return { status: 'synced', player, result };
  } catch (error) {
    registration.lastError = String(error.message || error).slice(0, 500);
    registration.nextCheckAt = nextCheckAt(60);
    await registration.save().catch(() => {});
    throw error;
  } finally {
    runningUsers.delete(key);
  }
};

const sweepRegistrations = async (client, limit = 20) => {
  if (sweepRunning) return 0;
  sweepRunning = true;
  let checked = 0;
  try {
    const due = await AlbionRegistration.find({
      status: { $in: ['pending', 'active', 'unmatched'] }, nextCheckAt: { $lte: new Date() },
    }).sort({ nextCheckAt: 1 }).limit(limit);
    for (const registration of due) {
      const guild = client.guilds.cache.get(registration.guildId);
      if (!guild) continue;
      try {
        await checkRegistration(guild, registration);
        checked += 1;
      } catch (error) {
        console.error(`[WARN] Verificación Albion ${registration.guildId}/${registration.discordUserId}:`, error?.message);
      }
    }
    return checked;
  } finally {
    sweepRunning = false;
  }
};

const handleDiscordMemberJoin = async (member) => {
  const entry = await getRegistration(member.guild.id, member.id);
  if (!entry) return false;
  entry.status = 'active';
  entry.nextCheckAt = new Date();
  await entry.save();
  await checkRegistration(member.guild, entry);
  return true;
};

const handleDiscordMemberLeave = async (member) => {
  const entry = await getRegistration(member.guild.id, member.id);
  if (!entry) return false;
  entry.status = 'discord_absent';
  entry.assignedRoleIds = [];
  entry.nextCheckAt = nextCheckAt(DEFAULT_INTERVAL_MINUTES);
  await entry.save();
  return true;
};

const removeRegistration = async (guild, userId) => {
  const registration = await getRegistration(guild.id, userId);
  if (!registration) return false;
  const key = lockKey(guild.id, userId);
  if (runningUsers.has(key)) throw new RegistrationError('La cuenta se está verificando. Inténtalo en unos segundos.');
  runningUsers.add(key);
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && registration.assignedRoleIds.length) {
      const removable = registration.assignedRoleIds.filter((id) => member.roles.cache.has(id));
      if (removable.length) await member.roles.remove(removable, 'Desvinculación del registro Albion');
    }
    if (member && registration.managedNickname && member.nickname === registration.managedNickname && member.manageable) {
      await member.setNickname(registration.originalNickname || null, 'Desvinculación del registro Albion').catch((error) => {
        console.error(`[WARN] No se pudo restaurar el apodo de ${userId}:`, error?.message);
      });
    }
    await AlbionRegistration.deleteOne({ _id: registration._id });
    const config = await getConfig(guild.id);
    await sendAudit(guild, config, '🗑️ Personaje desvinculado', [
      { name: 'Miembro', value: `<@${userId}>` },
      { name: 'Personaje', value: clean(registration.playerName) },
    ]);
    return true;
  } finally {
    runningUsers.delete(key);
  }
};

module.exports = {
  RegistrationError,
  MAX_RULES,
  applyPlayer,
  checkRegistration,
  configure,
  getConfig,
  getRegistration,
  getRules,
  handleDiscordMemberJoin,
  handleDiscordMemberLeave,
  matchingRoleIds,
  matchingRule,
  registerPlayer,
  removeGuildRule,
  removeRegistration,
  ruleRoles,
  ruleTag,
  saveGuildRule,
  sendAudit,
  sweepRegistrations,
  validateRoles,
};
