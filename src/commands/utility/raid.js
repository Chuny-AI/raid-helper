const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { createMassNotificationEmbed } = require("../../utils/embed");
const { renderRaidEmbed, renderRaidComponents } = require("../../utils/raidRender");
const { parseUTCTime, parseMinutes } = require("../../utils/time");
const { isValidHex } = require("../../utils/regex");
const {
  emptyOverrides,
  ensureGroup,
  ensureWeapon,
  resetGroup,
  toDisabledWeapons,
  toPositiveInt,
  getTotalCapacity,
  describeOverrides,
} = require("../../utils/raidWeaponConfig");
const {
  parseId,
  buildOverviewPanel,
  buildGroupPanel,
  buildWeaponPanel,
  buildGroupMaxModal,
  buildWeaponUnitsModal,
} = require("../../lib/raid/raid-weapon-config-ui");
const { getTemplateNames, getTemplateByName } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { createErrorEmbed, createWarningEmbed, safeReply } = require("../../utils/errorEmbeds");
const { checkAuthorizedRole } = require('../../middleware/roleCheck');
const raidState = require('../../services/raidState');
const raidRegistry = require('../../services/raidRegistry');
const { getOrLoadRuntime, finishRaid } = require('../../utils/raidInteractions');

/**
 * Almacena temporalmente los parámetros de raid pendiente de publicación.
 * key: originalInteractionId, value: { ...raidParams, weaponOverrides }
 * Se limpian automáticamente a los 15 minutos (expiración del token de Discord).
 */
const pendingRaids = new Map();

/**
 * Manejador del subcomando /raid kick
 */
async function executeKickSubcommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const raidId = interaction.options.getString('raid_id').toUpperCase().trim();
  const targetUser = interaction.options.getUser('usuario');

  const runtime = await getOrLoadRuntime({ raidId, guild: interaction.guild });
  if (!runtime) {
    return interaction.editReply({
      content: `No se encontró ningún raid con el ID **${raidId}**. Verifica el ID en el footer del embed del raid.`,
    });
  }
  if (runtime.raid.status !== 'active') {
    return interaction.editReply({ content: `🔒 El raid **#${raidId}** ya está finalizado.` });
  }
  if (!raidState.canManageRaid(runtime.raid, interaction.member)) {
    return interaction.editReply({ content: 'Solo el líder del raid puede expulsar participantes.' });
  }

  const result = await raidRegistry.withRaidLock(raidId, async () => {
    const kickResult = raidState.kickUser(runtime.raid, targetUser.id);
    if (!kickResult.wasInSlot && !kickResult.wasLooter) return kickResult;

    await raidRegistry.renderAndEdit(raidId);
    raidRegistry.persistRaid(raidId);

    let promoted = [];
    if (kickResult.freedSlotIds.length > 0) {
      promoted = raidState.promoteFromWaitlist(runtime.raid, kickResult.freedSlotIds);
      if (promoted.length > 0) {
        await raidRegistry.renderAndEdit(raidId);
        raidRegistry.persistRaid(raidId);
      }
    }
    return { ...kickResult, promoted };
  });

  if (!result.wasInSlot && !result.wasLooter) {
    return interaction.editReply({ content: `**${targetUser.username}** no está en este raid.` });
  }

  const promotedNote = result.promoted?.length > 0
    ? ` <@${result.promoted[0].userId}> ha sido promovido desde la lista de espera.`
    : '';
  await interaction.editReply({
    content: `✅ **${targetUser.username}** ha sido expulsado del raid **#${raidId}**.${promotedNote}`,
  });

  setImmediate(async () => {
    try {
      await targetUser.send({ content: 'Has sido removido del raid por el líder.' });
    } catch (e) {
      console.log(`[INFO] kick: No se pudo enviar DM al expulsado: ${e.message}`);
    }

    for (const p of (result.promoted || [])) {
      try {
        const promotedMember = await interaction.guild.members.fetch(p.userId);
        await promotedMember.send({
          content: `✅ Se liberó un espacio en el raid y has sido movido automáticamente desde la lista de espera a **${p.weaponLabel}**. ¡Buena suerte!`,
        });
      } catch (e) {
        console.log(`[INFO] kick: No se pudo enviar DM al promovido: ${e.message}`);
      }
    }

    if ((result.promoted || []).length === 0 && result.wasInSlot && runtime.raid.leaderId) {
      try {
        const leader = await interaction.guild.members.fetch(runtime.raid.leaderId);
        await leader.send({
          content: `⚠️ **${targetUser.username}** ha sido expulsado del raid **#${raidId}** y se ha liberado un slot.`,
        });
      } catch (e) {
        console.log(`[INFO] kick: No se pudo enviar DM de notificación al líder: ${e.message}`);
      }
    }
  });
}


/**
 * Genera un ID corto único para identificar un raid (6 caracteres alfanuméricos).
 * Excluye O, I, 0, 1 para mejor legibilidad.
 */
function generateRaidId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Manejador del subcomando /raid edit
 */
async function executeEditSubcommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const raidId = interaction.options.getString('raid_id').toUpperCase().trim();
  const newTime = interaction.options.getString('time');
  const newDescription = interaction.options.getString('description');
  const newColor = interaction.options.getString('color');
  const newTitle = interaction.options.getString('title');

  const runtime = await getOrLoadRuntime({ raidId, guild: interaction.guild });
  if (!runtime) {
    return interaction.editReply({ content: `No se encontró ningún raid activo con el ID **${raidId}**.` });
  }
  if (runtime.raid.status !== 'active') {
    return interaction.editReply({ content: `🔒 El raid **#${raidId}** ya está finalizado.` });
  }
  if (!raidState.canManageRaid(runtime.raid, interaction.member)) {
    return interaction.editReply({ content: 'Solo el líder del raid puede editarlo.' });
  }
  if (newColor && !isValidHex(newColor)) {
    return interaction.editReply({ content: 'Color inválido. Usa formato hexadecimal: `#FFFFFF`' });
  }

  if (newTitle) runtime.raid.title = newTitle;
  if (newDescription) runtime.raid.description = newDescription;
  if (newColor) runtime.raid.color = newColor;
  if (newTime) {
    let eventTimestamp;
    try {
      eventTimestamp = parseUTCTime(newTime);
    } catch (e) {
      return interaction.editReply({ content: `Hora inválida: ${e.message}` });
    }
    runtime.raid.time = newTime;
    runtime.raid.eventTimestamp = eventTimestamp;
  }

  try {
    await raidRegistry.withRaidLock(raidId, async () => {
      await raidRegistry.renderAndEdit(raidId);
      raidRegistry.persistRaid(raidId);
    });
  } catch (e) {
    console.error('[ERROR] edit: No se pudo actualizar el mensaje:', e);
    return interaction.editReply({ content: 'No se pudo actualizar el mensaje del raid.' });
  }

  await interaction.editReply({ content: `✅ Raid **#${raidId}** actualizado correctamente.` });
}

/**
 * Manejador del subcomando /raid close
 */
async function executeCloseSubcommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const raidId = interaction.options.getString('raid_id').toUpperCase().trim();

  const runtime = await getOrLoadRuntime({ raidId, guild: interaction.guild });
  if (!runtime) {
    return interaction.editReply({ content: `No se encontró ningún raid activo con ID **${raidId}**.` });
  }
  if (!raidState.canManageRaid(runtime.raid, interaction.member)) {
    return interaction.editReply({ content: 'Solo el líder del raid puede cerrarlo.' });
  }

  const result = await finishRaid(raidId, interaction.user.id, interaction.guild);
  if (!result.ok) {
    return interaction.editReply({
      content: result.reason === 'already_closed'
        ? `🔒 El raid **#${raidId}** ya estaba finalizado.`
        : 'No se pudo cerrar el raid.',
    });
  }

  await interaction.editReply({ content: `✅ Raid **#${raidId}** finalizado correctamente.` });
}

/**
 * Enrutador de todas las interacciones del panel de configuración de armas
 * de `/raid create` (customId con prefijo `raidcfg-`).
 *
 * Cubre: selección de grupo/arma, botones de deshabilitar y restablecer,
 * y los modales de cupo del grupo / cupo del arma.
 * @param {import('discord.js').Interaction} interaction
 */
async function handleWeaponConfigInteraction(interaction) {
  const parsed = parseId(interaction.customId);
  if (!parsed) return;

  const { action, pendingId, groupKey, weaponIndex } = parsed;
  const pending = pendingRaids.get(pendingId);

  if (!pending) {
    const expired = {
      content: '⏰ Esta sesión de creación ha expirado (15 min). Ejecuta `/raid create` nuevamente.',
      embeds: [],
      components: [],
    };
    try {
      if (interaction.isModalSubmit() && !interaction.isFromMessage?.()) {
        await interaction.reply({ ...expired, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.update(expired);
      }
    } catch { /* ignored */ }
    return;
  }

  // Sólo el líder que lanzó el comando puede tocar el panel
  if (pending.user?.id && interaction.user.id !== pending.user.id) {
    try {
      await interaction.reply({
        content: 'Solo quien ejecutó `/raid create` puede configurar este raid.',
        flags: MessageFlags.Ephemeral,
      });
    } catch { /* ignored */ }
    return;
  }

  const { template } = pending;
  const overrides = pending.weaponOverrides;

  // Validar que el grupo/arma referidos sigan existiendo en el template
  const group = groupKey ? template.weapons?.[groupKey] : null;
  if (groupKey && !group) {
    try {
      await interaction.update(buildOverviewPanel(template, overrides, pendingId));
    } catch { /* ignored */ }
    return;
  }
  const hasWeapon = weaponIndex !== null && !isNaN(weaponIndex)
    && Array.isArray(group?.data) && !!group.data[weaponIndex];

  try {
    switch (action) {
      // ── Navegación
      case 'home':
        return await interaction.update(buildOverviewPanel(template, overrides, pendingId));

      case 'grp': {
        const selected = interaction.values?.[0];
        if (!selected || !template.weapons?.[selected]) {
          return await interaction.update(buildOverviewPanel(template, overrides, pendingId));
        }
        return await interaction.update(buildGroupPanel(template, overrides, pendingId, selected));
      }

      case 'gback':
        return await interaction.update(buildGroupPanel(template, overrides, pendingId, groupKey));

      case 'wpn': {
        const selectedIndex = parseInt(interaction.values?.[0], 10);
        if (isNaN(selectedIndex) || !group.data?.[selectedIndex]) {
          return await interaction.update(buildGroupPanel(template, overrides, pendingId, groupKey));
        }
        return await interaction.update(
          buildWeaponPanel(template, overrides, pendingId, groupKey, selectedIndex)
        );
      }

      // ── Acciones sobre el grupo
      case 'gtoggle': {
        const entry = ensureGroup(overrides, groupKey);
        entry.disabled = !entry.disabled;
        return await interaction.update(buildGroupPanel(template, overrides, pendingId, groupKey));
      }

      case 'greset': {
        resetGroup(overrides, groupKey);
        return await interaction.update(buildGroupPanel(template, overrides, pendingId, groupKey));
      }

      case 'resetall': {
        pending.weaponOverrides = emptyOverrides();
        return await interaction.update(
          buildOverviewPanel(template, pending.weaponOverrides, pendingId)
        );
      }

      case 'gmax':
        return await interaction.showModal(
          buildGroupMaxModal(template, overrides, pendingId, groupKey)
        );

      // ── Acciones sobre un arma
      case 'wtoggle': {
        if (!hasWeapon) {
          return await interaction.update(buildGroupPanel(template, overrides, pendingId, groupKey));
        }
        const entry = ensureWeapon(overrides, groupKey, weaponIndex);
        entry.disabled = !entry.disabled;
        return await interaction.update(
          buildWeaponPanel(template, overrides, pendingId, groupKey, weaponIndex)
        );
      }

      case 'wreset': {
        if (!hasWeapon) {
          return await interaction.update(buildGroupPanel(template, overrides, pendingId, groupKey));
        }
        delete overrides.groups?.[groupKey]?.weapons?.[String(weaponIndex)];
        return await interaction.update(
          buildWeaponPanel(template, overrides, pendingId, groupKey, weaponIndex)
        );
      }

      case 'wunits': {
        if (!hasWeapon) {
          return await interaction.update(buildGroupPanel(template, overrides, pendingId, groupKey));
        }
        return await interaction.showModal(
          buildWeaponUnitsModal(template, overrides, pendingId, groupKey, weaponIndex)
        );
      }

      // ── Modales
      case 'mgmax': {
        const raw = interaction.fields.getTextInputValue('value').trim();
        const entry = ensureGroup(overrides, groupKey);

        if (raw === '') {
          // Vacío = volver al valor del template (auto = suma de armas)
          entry.maxPlayers = null;
        } else {
          const parsedValue = toPositiveInt(raw);
          if (parsedValue === null) {
            return await interaction.reply({
              content: '⚠️ El cupo del grupo debe ser un número mayor a 0 (o vacío para usar el del template).',
              flags: MessageFlags.Ephemeral,
            });
          }
          entry.maxPlayers = parsedValue;
        }
        return await interaction.update(buildGroupPanel(template, overrides, pendingId, groupKey));
      }

      case 'mwunits': {
        if (!hasWeapon) {
          return await interaction.update(buildGroupPanel(template, overrides, pendingId, groupKey));
        }
        const raw = interaction.fields.getTextInputValue('value').trim();
        const entry = ensureWeapon(overrides, groupKey, weaponIndex);

        if (raw === '0') {
          // 0 equivale a deshabilitar el arma
          entry.disabled = true;
          entry.units = null;
        } else {
          const parsedValue = toPositiveInt(raw);
          if (parsedValue === null) {
            return await interaction.reply({
              content: '⚠️ El cupo del arma debe ser un número mayor o igual a 0 (0 la deshabilita).',
              flags: MessageFlags.Ephemeral,
            });
          }
          entry.units = parsedValue;
          entry.disabled = false;
        }
        return await interaction.update(
          buildWeaponPanel(template, overrides, pendingId, groupKey, weaponIndex)
        );
      }

      default:
        console.warn('[WARN] handleWeaponConfigInteraction: acción no reconocida:', action);
        return await interaction.update(buildOverviewPanel(template, overrides, pendingId));
    }
  } catch (error) {
    console.error('[ERROR] handleWeaponConfigInteraction:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'No se pudo aplicar el cambio de configuración. Inténtalo de nuevo.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch { /* ignored */ }
  }
}

/**
 * Manejador del botón de confirmar y publicar raid.
 * Lee los parámetros pendientes, construye el estado estructurado del raid
 * (grupos/slots congelados desde el template) y lo publica.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleConfirmRaidCreate(interaction) {
  const originalId = interaction.customId.substring('raid_confirm_create-'.length);
  const pending = pendingRaids.get(originalId);

  if (!pending) {
    await interaction.update({
      content: '⏰ Esta sesión de creación ha expirado (15 min). Ejecuta `/raid create` nuevamente.',
      components: [],
    });
    return;
  }

  const {
    templateName, template, eventTimestamp, title, color, image, description,
    finalReminder, finalNotificationRoles, looters, guildId, user,
  } = pending;

  const weaponOverrides = pending.weaponOverrides || emptyOverrides();

  // No tiene sentido publicar un raid sin ninguna plaza disponible
  if (getTotalCapacity(template, weaponOverrides) <= 0) {
    await interaction.update({
      content: '⚠️ No puedes publicar el raid: todas las armas están deshabilitadas. ' +
        'Habilita al menos un grupo o arma antes de confirmar.',
      ...buildOverviewPanel(template, weaponOverrides, originalId),
    });
    return;
  }

  // Marcar como procesado para evitar dobles publicaciones
  pendingRaids.delete(originalId);

  const raidId = generateRaidId();
  const disabledWeaponValues = toDisabledWeapons(weaponOverrides);

  const RaidEvent = require('../../database/models/RaidEvent');
  const initialState = raidState.buildInitialState({
    template,
    weaponOverrides,
    lootersMax: looters || 0,
    leaderId: user.id,
  });

  const raidDoc = new RaidEvent({
    eventId: raidId,
    guildId,
    channelId: interaction.channel.id,
    templateName,
    title: title || template.title,
    description: description || template.description,
    time: pending.time,
    eventTimestamp,
    color: color || null,
    image: image || null,
    reminder: finalReminder || null,
    rolesToNotify: finalNotificationRoles,
    leaderId: user.id,
    stateVersion: 2,
    groups: initialState.groups,
    slots: initialState.slots,
    waitlist: [],
    cannotGo: [],
    looters: initialState.looters,
    fullNotificationSent: false,
    disabledWeapons: disabledWeaponValues,
    weaponOverrides,
    status: 'active',
  });

  // Registrar ANTES de publicar para que los botones puedan resolverlo en cuanto exista el mensaje.
  raidRegistry.register({ raidId, raid: raidDoc, message: null, templateName });

  const embed = renderRaidEmbed(raidDoc, raidDoc);
  const components = renderRaidComponents(raidDoc, raidDoc);

  // Publicar el raid en el canal
  let raidMessage;
  let notificationContent = '';
  if (finalNotificationRoles.length > 0) {
    notificationContent = finalNotificationRoles.map(id => `<@&${id}>`).join(' ') + '\n';
  }

  try {
    raidMessage = await interaction.channel.send({
      content: notificationContent || undefined,
      embeds: [embed],
      components,
      allowedMentions: finalNotificationRoles.length > 0 ? { roles: finalNotificationRoles } : undefined,
    });
  } catch (publishError) {
    console.error('[ERROR] handleConfirmRaidCreate: Error publicando raid:', publishError);
    await interaction.update({
      content: '❌ No se pudo publicar el raid. Intenta de nuevo.',
      components: [],
    });
    raidRegistry.unregister(raidId);
    return;
  }

  raidRegistry.setMessage(raidId, raidMessage);
  raidDoc.messageId = raidMessage.id;

  // Confirmar al líder que el raid fue publicado (actualiza el mensaje ephemeral)
  await interaction.update({
    content: `✅ Raid **#${raidId}** publicado correctamente.${disabledWeaponValues.length > 0 ? ` (${disabledWeaponValues.length} arma(s)/grupo(s) deshabilitados)` : ''}`,
    components: [],
  });

  // Configurar recordatorio si aplica (clave = raidId, sobrevive a un reinicio vía migración)
  if (finalReminder) {
    try {
      const { createReminder, addInterestedUser } = require('../../utils/reminderManager');
      const activityTitle = title || template.title;
      createReminder(
        raidId,
        finalReminder,
        eventTimestamp * 1000,
        templateName,
        interaction.channel?.id,
        guildId,
        activityTitle,
        []
      );
      addInterestedUser(raidId, user.id);
    } catch (reminderError) {
      console.error('[ERROR] handleConfirmRaidCreate: Error configurando recordatorio:', reminderError);
    }
  }

  // Enviar DMs de notificación masiva (no bloqueante)
  if (finalNotificationRoles.length > 0 && raidMessage) {
    setImmediate(async () => {
      try {
        const members = await interaction.guild.members.fetch();
        const targetMembers = members.filter(member =>
          finalNotificationRoles.some(roleId => member.roles.cache.has(roleId))
        );
        const activityTitle = title || template.title;
        const discordTimestamp = `<t:${eventTimestamp}:F>`;
        const messageUrl = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${raidMessage.id}`;
        const massNotification = createMassNotificationEmbed(
          activityTitle,
          interaction.guild.name,
          discordTimestamp,
          user.toString(),
          messageUrl
        );
        for (const member of targetMembers.values()) {
          try {
            await member.send({ embeds: massNotification.embeds, components: massNotification.components });
          } catch { /* DMs cerrados, ignorar */ }
          await new Promise((r) => setTimeout(r, 250));
        }
        console.log(`[INFO] Notificación enviada a ${targetMembers.size} miembros`);
      } catch (e) {
        console.error('[ERROR] handleConfirmRaidCreate: Error enviando notificaciones:', e);
      }
    });
  }

  // Guardar en BD (no bloqueante)
  setImmediate(async () => {
    try {
      await raidDoc.save();
      console.log(`[INFO] Raid #${raidId} guardado en DB (messageId: ${raidMessage.id})`);
    } catch (dbError) {
      console.error('[ERROR] handleConfirmRaidCreate: Error guardando raid en DB:', dbError);
    }
  });
}


/**
 * Comando para crear raids usando templates del servidor
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Gestiona raids del servidor")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Crea un raid usando una plantilla")
        .addStringOption((option) =>
          option
            .setName("template")
            .setDescription("Selecciona la plantilla para esta actividad")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName("time")
            .setDescription(
              'Hora del evento en UTC (formato HH:MM) ej: "17:00", "21:30"'
            )
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription(
              "Especifica un título personalizado para la actividad (opcional)"
            )
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription(
              "Especifica una descripción personalizada para la actividad (opcional)"
        )
          .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("color")
            .setDescription(
              "Especifica el color del embed en formato hexadecimal (#FFFFFF) (opcional)"
            )
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("image")
            .setDescription(
              "Proporciona una URL para la imagen del embed (opcional)"
            )
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("reminder")
            .setDescription(
              'Minutos antes del evento para enviar recordatorio ej: "10", "30" (opcional)'
            )
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role_to_notify_1")
            .setDescription("Primer rol del servidor a notificar (opcional)")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role_to_notify_2")
            .setDescription("Segundo rol del servidor a notificar (opcional)")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role_to_notify_3")
            .setDescription("Tercer rol del servidor a notificar (opcional)")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("looters")
            .setDescription("Número máximo de looters permitidos (opcional)")
            .setRequired(false)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("kick")
        .setDescription("Expulsa a un participante inscrito del raid")
        .addStringOption((option) =>
          option
            .setName("raid_id")
            .setDescription("ID de 6 caracteres del raid (visible en el footer del embed)")
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName("usuario")
            .setDescription("Usuario a expulsar del raid")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edita parámetros de un raid activo")
        .addStringOption((option) =>
          option
            .setName("raid_id")
            .setDescription("ID de 6 caracteres del raid")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Nuevo título del raid (opcional)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("time")
            .setDescription('Nueva hora en UTC (formato HH:MM, opcional)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Nueva descripción del raid (opcional)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("color")
            .setDescription("Nuevo color en hexadecimal (#FFFFFF, opcional)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("close")
        .setDescription("Cierra manualmente un raid activo")
        .addStringOption((option) =>
          option
            .setName("raid_id")
            .setDescription("ID de 6 caracteres del raid")
            .setRequired(true)
        )
    ),

  async autocomplete(interaction) {
    let subcommand;
    try { subcommand = interaction.options.getSubcommand(); } catch { subcommand = null; }
    if (subcommand !== 'create') return;

    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'template') {
      // Crear timeout para evitar interacciones que se cuelguen
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Autocomplete timeout')), 2500) // 2.5 segundos
      );

      try {
        const guildId = interaction.guild.id;

        // Ejecutar la consulta con timeout
        const templates = await Promise.race([
          getTemplateNames(guildId),
          timeoutPromise
        ]);

        const filtered = templates
          .filter(template =>
            template.name.toLowerCase().includes(focusedOption.value.toLowerCase())
          )
          .slice(0, 25); // Discord limita a 25 opciones

        // Solo responder si la interacción no ha sido respondida
        if (!interaction.responded && !interaction.deferred && !interaction.replied) {
          await interaction.respond(
            filtered.map(template => ({
              name: template.name,
              value: template.name
            }))
          );
        }
      } catch (error) {
        console.error('[ERROR] Error en autocomplete:', error.message);

        // Solo responder si la interacción no ha sido respondida
        try {
          if (!interaction.responded && !interaction.deferred && !interaction.replied) {
            await interaction.respond([]);
          }
        } catch (responseError) {
          // Si falla al responder, solo loggear el código de error
          if (responseError.code !== 40060) { // No loggear si ya fue reconocida
            console.error('[WARN] Error respondiendo autocomplete:', responseError.code);
          }
        }
      }
    }
  },

  async execute(interaction) {
    // Rutear al manejador del subcomando correspondiente
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'kick') {
      return executeKickSubcommand(interaction);
    }
    if (subcommand === 'edit') {
      return executeEditSubcommand(interaction);
    }
    if (subcommand === 'close') {
      return executeCloseSubcommand(interaction);
    }

    // Subcomando 'create' — flujo de creación de raid
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Verificar roles autorizados (authorizedroles), independiente de economy/decode
      const hasAuthorizedRole = await checkAuthorizedRole(interaction);
      if (!hasAuthorizedRole) {
        const errorEmbed = createErrorEmbed(
          'Acceso denegado',
          'No tienes un rol autorizado para usar el comando /raid en este servidor.\nPide a un administrador que te agregue a la lista de roles autorizados.'
        );
        await safeReply(interaction, { embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        return;
      }

      /**
       * Obtener los parámetros del comando slash
       */
      const templateName = interaction.options.getString("template");
      const title = interaction.options.getString("title");
      const time = interaction.options.getString("time");
      const color = interaction.options.getString("color");
      const image = interaction.options.getString("image");
      const description = interaction.options.getString("description");
      const reminder = interaction.options.getString("reminder");
      const roleToNotify1 = interaction.options.getRole("role_to_notify_1");
      const roleToNotify2 = interaction.options.getRole("role_to_notify_2");
      const roleToNotify3 = interaction.options.getRole("role_to_notify_3");
      const looters = interaction.options.getInteger("looters");
      const user = interaction.user;
      const guildId = interaction.guild.id;

      /**
       * Asegurar que el servidor existe en la base de datos
       */
      await getOrCreateServer(guildId, interaction.guild.name);

      /**
       * Obtener la plantilla de la base de datos
       */
      const template = await getTemplateByName(templateName, guildId);

      if (!template) {
        const errorEmbed = createErrorEmbed(
          "Plantilla No Encontrada",
          `No se encontró la plantilla "${templateName}" en este servidor.`,
          [{
            name: "Solución",
            value: "Verifica que el nombre de la plantilla sea correcto o crea una nueva plantilla.",
            inline: false
          }]
        );
        return await safeReply(interaction, {
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }

      let eventTimestamp;
      try {
        eventTimestamp = parseUTCTime(time);
      } catch (timeError) {
        const errorEmbed = createErrorEmbed(
          "Error en el Tiempo del Evento",
          `Error procesando la hora del evento: ${timeError.message}`,
          [{
            name: "Formato Correcto",
            value: "Usa el formato HH:MM en UTC: `17:00`, `21:30`, `09:00`",
            inline: false
          }]
        );
        return await safeReply(interaction, {
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }

      let finalReminder = reminder;

      if (finalReminder) {
        let reminderTimeMs;
        try {
          reminderTimeMs = parseMinutes(finalReminder);
        } catch (reminderError) {
          const errorEmbed = createErrorEmbed(
            "Error en el Tiempo del Recordatorio",
            `Error procesando el tiempo del recordatorio: ${reminderError.message}`,
            [{
              name: "Formato Correcto",
              value: "Usa un número de minutos: `10`, `30`, `60`",
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [errorEmbed],
            ephemeral: true,
          });
        }

        // El recordatorio debe dispararse antes del evento
        const msUntilEvent = eventTimestamp * 1000 - Date.now();
        if (reminderTimeMs >= msUntilEvent) {
          const warningEmbed = createWarningEmbed(
            "Tiempo de Recordatorio Inválido",
            "El recordatorio debe programarse antes de la hora del evento.",
            [{
              name: "Ejemplo",
              value: `Para un evento en ${Math.round(msUntilEvent / 60000)} minutos, el recordatorio máximo permitido es ${Math.floor((msUntilEvent - 60000) / 60000)} minutos`,
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [warningEmbed],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (reminderTimeMs <= 0) {
          const warningEmbed = createWarningEmbed(
            "Tiempo de Recordatorio Inválido",
            "El tiempo del recordatorio debe ser mayor a 0.",
            [{
              name: "Ejemplo",
              value: "Usa números como: `5`, `10`, `30`",
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [warningEmbed],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      if (color && !isValidHex(color)) {
        const errorEmbed = createErrorEmbed(
          "Color Inválido",
          "El color proporcionado no es válido.",
          [{
            name: "Formato Correcto",
            value: "Usa el formato hexadecimal: `#FFFFFF`, `#FF0000`, `#00FF00`",
            inline: false
          }]
        );
        return await safeReply(interaction, {
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }

      const notificationRoles = [];
      for (const role of [roleToNotify1, roleToNotify2, roleToNotify3]) {
        if (role && !notificationRoles.includes(role.id)) {
          notificationRoles.push(role.id);
        }
      }

      let finalNotificationRoles = [];
      if (notificationRoles.length > 0) {
        finalNotificationRoles = notificationRoles;
        console.log(`[DEBUG RAID] Usando roles del comando:`, finalNotificationRoles);
      } else {
        console.log(`[DEBUG RAID] No se especificaron roles para notificar`);
      }

      // Almacenar los parámetros del raid pendiente de confirmación
      const weaponOverrides = emptyOverrides();
      pendingRaids.set(interaction.id, {
        templateName,
        template,
        eventTimestamp,
        time,
        title,
        color,
        image,
        description,
        finalReminder,
        finalNotificationRoles,
        looters,
        guildId,
        user,
        weaponOverrides,
      });
      // Auto-limpiar tras 15 minutos (expiración del token de Discord)
      setTimeout(() => pendingRaids.delete(interaction.id), 15 * 60 * 1000);

      // Mostrar el panel de configuración de armas antes de publicar
      await interaction.editReply(buildOverviewPanel(template, weaponOverrides, interaction.id));

    } catch (error) {
      console.error('[ERROR] Error en comando raid create:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de raid.",
        [{
          name: "Solución",
          value: "Intenta ejecutar el comando de nuevo. Si el problema persiste, contacta al soporte.",
          inline: false
        }]
      );
      await safeReply(interaction, {
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  pendingRaids,
  handleWeaponConfigInteraction,
  handleConfirmRaidCreate,
};

