const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, embedsMap, createMassNotificationEmbed, updateParticipantsCounter } = require("../../utils/embed");
const { parseUTCTime, parseMinutes } = require("../../utils/time");
const { isValidHex } = require("../../utils/regex");
const { createSelect } = require("../../utils/select");
const { getTemplateNames, getTemplateByName } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { createErrorEmbed, createWarningEmbed, safeReply } = require("../../utils/errorEmbeds");
const { checkAuthorizedRole } = require('../../middleware/roleCheck');
const { createRaidEvent, getRaidEvent } = require('../../services/raidEventService');


/**
 * Elimina a un usuario del embed de un raid y decrementa los contadores afectados.
 * Devuelve true si el usuario estaba en un grupo de armas o looters.
 * @param {Object} embed - EmbedBuilder con data.fields
 * @param {string} userMention - Mención del usuario (ej: "<@123456789>")
 * @returns {boolean}
 */
function kickUserFromEmbed(embed, userMention) {
  let wasInSlot = false;
  const escapedMention = userMention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  embed.data.fields.forEach((field) => {
    if (typeof field.value !== 'string' || !field.value.includes(userMention)) return;

    // Lista de espera / No puedo ir — solo eliminar la línea, sin tocar contadores
    if (field.name === '🕒 Lista de espera' || field.name === '🚫 No puedo ir') {
      const lines = field.value.split('\n').filter(l => !l.includes(userMention));
      field.value = lines.length > 0 ? lines.join('\n') : '\u200b';
      return;
    }

    // Campo Looters
    if (field.name.startsWith('👑 Looters')) {
      const lines = field.value.split('\n').filter(l => !l.includes(userMention));
      field.value = lines.join('\n') || '\u200b';
      const m = field.name.match(/(\d+)\/(\d+)/);
      if (m) {
        const cur = parseInt(m[1]);
        if (cur > 0) field.name = field.name.replace(/(\d+)\/(\d+)/, `${cur - 1}/${m[2]}`);
      }
      wasInSlot = true;
      return;
    }

    // Campos de grupos de armas — entradas con formato: \n<:emoji:id> Arma <@userId>
    const weaponLineRegex = new RegExp(`\\n<:[^:]+:[0-9]+>[^\\n]*${escapedMention}`, 'g');
    field.value = field.value.replace(weaponLineRegex, '');

    // Decrementar contador (X/Y) en el nombre del campo
    const unitMatch = field.name.match(/<:[\w]+:[\w]+>\s+.+?\s+\((\d+)\/(\d+)\):/);
    if (unitMatch) {
      const cur = parseInt(unitMatch[1]);
      const total = unitMatch[2];
      const newCount = Math.max(0, cur - 1);
      field.name = field.name.replace(/(\d+)\/(\d+)/, `${newCount}/${total}`);
      wasInSlot = true;
    }
  });

  return wasInSlot;
}

/**
 * Manejador del subcomando /raid kick
 */
async function executeKickSubcommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const raidId = interaction.options.getString('raid_id').toUpperCase().trim();
  const targetUser = interaction.options.getUser('usuario');

  // 1. Buscar el embed activo en memoria
  let targetEmbedEntry = null;
  let targetTemplateName = null;
  for (const [tmplName, entries] of Object.entries(embedsMap)) {
    const found = entries.find(e => e.raidId === raidId);
    if (found) {
      targetEmbedEntry = found;
      targetTemplateName = tmplName;
      break;
    }
  }

  if (!targetEmbedEntry) {
    return interaction.editReply({
      content: `No se encontró ningún raid activo con el ID **${raidId}**. Verifica el ID en el footer del embed del raid.`,
    });
  }

  const embed = targetEmbedEntry.embed;

  // 2. Verificar permisos: solo el líder del raid (o admin) puede expulsar
  const leaderField = embed.data.fields.find(f => f.name === 'Líder de la actividad:');
  const isLeader = leaderField && leaderField.value.includes(interaction.user.toString());
  const isAdmin = interaction.member.permissions.has('Administrator');

  if (!isLeader && !isAdmin) {
    return interaction.editReply({
      content: 'Solo el líder del raid puede expulsar participantes.',
    });
  }

  const userMention = targetUser.toString();

  // 3. Verificar que el usuario está inscrito en un grupo (no solo en waitlist/cannotgo)
  const activeGroupFields = embed.data.fields.filter(f =>
    typeof f.name === 'string' &&
    (f.name.startsWith('👑 Looters') || /\(\d+\/\d+\):/.test(f.name))
  );
  const isInGroup = activeGroupFields.some(f =>
    typeof f.value === 'string' && f.value.includes(userMention)
  );

  if (!isInGroup) {
    return interaction.editReply({
      content: `**${targetUser.username}** no está inscrito en ningún grupo de este raid.`,
    });
  }

  // 4. Eliminar usuario del embed
  const wasInSlot = kickUserFromEmbed(embed, userMention);

  // 5. Actualizar contador de participantes
  try {
    updateParticipantsCounter(embed);
  } catch (e) {
    console.error('[WARN] kick: No se pudo actualizar el contador:', e);
  }

  // 6. Promover primer usuario de la lista de espera (si existe)
  let promotedUserId = null;
  if (wasInSlot) {
    const waitlistField = embed.data.fields.find(f => f.name === '🕒 Lista de espera');
    if (waitlistField && waitlistField.value && waitlistField.value !== '\u200b') {
      const lines = waitlistField.value.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const firstMention = lines[0].trim();
        promotedUserId = firstMention.replace(/<@!?(\d+)>/, '$1');
        const remaining = lines.slice(1);
        waitlistField.value = remaining.length > 0 ? remaining.join('\n') : '\u200b';
      }
    }
  }

  // 7. Actualizar el mensaje del raid en Discord
  try {
    const raidEvent = await getRaidEvent(raidId);
    if (raidEvent) {
      const channel = await interaction.guild.channels.fetch(raidEvent.channelId);
      if (channel) {
        const message = await channel.messages.fetch(raidEvent.messageId);
        if (message) await message.edit({ embeds: [embed] });
      }
    }
  } catch (msgErr) {
    console.error('[ERROR] kick: No se pudo actualizar el mensaje del raid:', msgErr);
  }

  // 8. Confirmar al ejecutor
  await interaction.editReply({
    content: `✅ **${targetUser.username}** ha sido expulsado del raid **#${raidId}**.`,
  });

  // 9. DMs (no bloqueantes)
  setImmediate(async () => {
    try {
      await targetUser.send({ content: 'Has sido removido del raid por el líder.' });
    } catch (e) {
      console.log(`[INFO] kick: No se pudo enviar DM al expulsado: ${e.message}`);
    }

    if (promotedUserId) {
      try {
        const promotedMember = await interaction.guild.members.fetch(promotedUserId);
        await promotedMember.send({ content: 'Se ha liberado un slot en el raid y has sido movido automáticamente.' });
      } catch (e) {
        console.log(`[INFO] kick: No se pudo enviar DM al promovido: ${e.message}`);
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
        if (!interaction.responded) {
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
          if (!interaction.responded) {
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

    // Subcomando 'create' — flujo de creación de raid
    try {
      // No hacer defer todavía, necesitamos verificar si hay roles a notificar primero

      // Verificar roles autorizados (authorizedroles), independiente de economy/decode
      const hasAuthorizedRole = await checkAuthorizedRole(interaction);
      if (!hasAuthorizedRole) {
        const errorEmbed = createErrorEmbed(
          'Acceso denegado',
          'No tienes un rol autorizado para usar el comando /raid en este servidor.\nPide a un administrador que te agregue a la lista de roles autorizados.'
        );
        await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
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
          ephemeral: true,
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
          ephemeral: true,
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
            ephemeral: true,
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
            ephemeral: true,
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
          ephemeral: true,
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

      // Si NO hay roles a notificar, hacer defer para evitar timeout
      // Si SÍ hay roles, NO hacer defer para poder usar reply() con menciones
      const hasRolesToNotify = finalNotificationRoles.length > 0;
      if (!hasRolesToNotify) {
        await interaction.deferReply();
      }

      // Generar ID único del raid
      const raidId = generateRaidId();

      const row = createSelect(template, templateName, interaction);

      const embed = createEmbed({
        title,
        eventTimestamp,
        template,
        color,
        image,
        description,
        user,
        finalRoles: finalNotificationRoles,
        looters,
        raidId,
      });

      if (!embedsMap[templateName]) {
        embedsMap[templateName] = [];
      }

      embedsMap[templateName].push({ id: interaction.id, raidId, embed });


      /**
       * Configurar recordatorio si se especificó o si el template tiene uno
       */
      if (finalReminder) {
        try {
          const { createReminder, addInterestedUser } = require('../../utils/reminderManager');
          const activityTitle = title || template.title;

          createReminder(
            interaction.id,
            finalReminder,
            eventTimestamp * 1000,  // ms timestamp del evento
            templateName,
            interaction.channel.id,
            guildId,
            activityTitle,
            [] // Los participantes se actualizarán dinámicamente
          );

          addInterestedUser(interaction.id, interaction.user.id);

          console.log(`[INFO] Recordatorio configurado para ${templateName} en ${finalReminder}`);
        } catch (reminderError) {
          console.error('[ERROR] Error configurando recordatorio:', reminderError);
        }
      }

      let notificationContent = '';

      if (finalNotificationRoles.length > 0) {
        console.log(`[DEBUG RAID] Roles a notificar:`, finalNotificationRoles);
        const roleMentions = finalNotificationRoles.map(roleId => `<@&${roleId}>`).join(' ');
        notificationContent += `${roleMentions}\n`;
        console.log(`[DEBUG RAID] Contenido de notificación:`, notificationContent);
      } else {
        console.log(`[DEBUG RAID] No hay roles para notificar`);
      }

      /**
       * Primero publicar el mensaje del raid
       * Si hay roles a notificar, usar reply() directamente para que las menciones funcionen
       * Si no hay roles, usar safeReply() normal
       */
      let raidMessage;
      if (hasRolesToNotify) {
        console.log(`[DEBUG RAID] Publicando con reply() para mencionar roles`);
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const extraRowComponents = [
          new ButtonBuilder()
            .setCustomId(`raid_waitlist-${templateName}-${interaction.id}`)
            .setLabel('Lista de espera')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🕒'),
          new ButtonBuilder()
            .setCustomId(`raid_cannotgo-${templateName}-${interaction.id}`)
            .setLabel('No puedo ir')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🚫'),
        ];
        if (looters) {
          extraRowComponents.push(
            new ButtonBuilder()
              .setCustomId(`raid_looter-${templateName}-${interaction.id}`)
              .setLabel('Looters')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('👑')
          );
        }
        const extraRow = new ActionRowBuilder().addComponents(extraRowComponents);
        raidMessage = await interaction.reply({
          embeds: [embed],
          components: [row, extraRow],
          content: notificationContent || undefined,
        });
      } else {
        console.log(`[DEBUG RAID] Publicando con safeReply() sin roles`);
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const extraRowComponents = [
          new ButtonBuilder()
            .setCustomId(`raid_waitlist-${templateName}-${interaction.id}`)
            .setLabel('Lista de espera')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🕒'),
          new ButtonBuilder()
            .setCustomId(`raid_cannotgo-${templateName}-${interaction.id}`)
            .setLabel('No puedo ir')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🚫'),
        ];
        if (looters) {
          extraRowComponents.push(
            new ButtonBuilder()
              .setCustomId(`raid_looter-${templateName}-${interaction.id}`)
              .setLabel('Looters')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('👑')
          );
        }
        const extraRow = new ActionRowBuilder().addComponents(extraRowComponents);
        raidMessage = await safeReply(interaction, {
          embeds: [embed],
          components: [row, extraRow],
          content: notificationContent || undefined,
        });
      }

      /**
       * Enviar notificaciones por DM con enlace al evento después de publicar
       */
      if (finalNotificationRoles.length > 0 && raidMessage) {
        try {
          const members = await interaction.guild.members.fetch();
          const targetMembers = members.filter(member =>
            finalNotificationRoles.some(roleId => member.roles.cache.has(roleId))
          );

          const activityTitle = title || template.title;
          const discordTimestamp = `<t:${eventTimestamp}:F>`;

          // Crear el enlace al mensaje del raid
          const messageUrl = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${raidMessage.id || interaction.id}`;

          const massNotification = createMassNotificationEmbed(
            activityTitle,
            interaction.guild.name,
            discordTimestamp,
            user.toString(),
            messageUrl
          );

          for (const member of targetMembers.values()) {
            try {
              await member.send({
                embeds: massNotification.embeds,
                components: massNotification.components
              });
            } catch (dmError) {
              console.log(`[INFO] No se pudo enviar DM a ${member.user.username}: ${dmError.message}`);
            }
          }

          console.log(`[INFO] Notificación enviada a ${targetMembers.size} miembros con enlace al evento`);
        } catch (notifyError) {
          console.error('[ERROR] Error enviando notificaciones a roles:', notifyError);
        }
      }

      // Guardar el raid en la base de datos de forma no bloqueante
      setImmediate(async () => {
        try {
          const messageId = raidMessage?.id || interaction.id;
          await createRaidEvent({
            eventId: raidId,
            guildId,
            channelId: interaction.channel.id,
            messageId,
            templateName,
            title: title || template.title,
            description: description || template.description,
            time,
            reminder: finalReminder || null,
            rolesToNotify: finalNotificationRoles,
            participants: [],
            cannotGo: [],
            weaponAssignments: [],
            waitList: [],
          });
          console.log(`[INFO] Raid #${raidId} guardado en la base de datos (messageId: ${messageId})`);
        } catch (dbError) {
          console.error('[ERROR] Error guardando raid en DB:', dbError);
        }
      });
    } catch (error) {
      console.error('[ERROR] Error en comando raid:', error);
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
        ephemeral: true,
      });
    }
  },

};

