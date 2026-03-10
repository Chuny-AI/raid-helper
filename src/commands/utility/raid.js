const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, embedsMap, createMassNotificationEmbed } = require("../../utils/embed");
const { parseUTCTime, parseMinutes } = require("../../utils/time");
const { isValidHex } = require("../../utils/regex");
const { createSelect } = require("../../utils/select");
const { getTemplateNames, getTemplateByName } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { createErrorEmbed, createWarningEmbed, safeReply } = require("../../utils/errorEmbeds");
const { checkAuthorizedRole } = require('../../middleware/roleCheck');


/**
 * Comando para crear raids usando templates del servidor
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Envía una notificación para una actividad usando una plantilla")
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
    .addStringOption((option) =>
      option
        .setName("roles_to_notify")
        .setDescription(
          "IDs de roles a notificar separados por comas (opcional)"
        )
        .setRequired(false)
    ),

  async autocomplete(interaction) {
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
      const rolesToNotifyInput = interaction.options.getString("roles_to_notify");
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

      let notificationRoles = [];
      if (rolesToNotifyInput) {
        try {
          const roleIds = rolesToNotifyInput.split(',').map(id => id.trim()).filter(id => id);

          for (const roleId of roleIds) {
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
              const availableRoles = interaction.guild.roles.cache
                .filter(r => r.name !== '@everyone' && !r.managed)
                .map(r => `${r.name} (${r.id})`)
                .slice(0, 10)
                .join('\n');

              const errorEmbed = createErrorEmbed(
                "Rol No Encontrado",
                `El rol con ID "${roleId}" no existe en este servidor.`,
                [{
                  name: "Solución",
                  value: "Verifica que el ID del rol sea correcto y que el rol exista en el servidor.",
                  inline: false
                }, {
                  name: "Roles Disponibles",
                  value: availableRoles || "No hay roles disponibles",
                  inline: false
                }, {
                  name: "Formato Correcto",
                  value: "Usa el formato: `123456789, 987654321` (IDs de roles separados por comas)",
                  inline: false
                }]
              );
              return await safeReply(interaction, {
                embeds: [errorEmbed],
                ephemeral: true,
              });
            }

            notificationRoles.push(role.id);
          }
        } catch (error) {
          const errorEmbed = createErrorEmbed(
            "Error Procesando Roles",
            "Error al procesar los IDs de los roles proporcionados.",
            [{
              name: "Formato Correcto",
              value: "Usa el formato: `123456789, 987654321` (IDs de roles separados por comas)",
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [errorEmbed],
            ephemeral: true,
          });
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

      const row = createSelect(template, templateName, interaction);

      const embed = createEmbed({
        title,
        eventTimestamp,
        template,
        color,
        image,
        description,
        user,
        finalRoles: finalNotificationRoles
      });

      if (!embedsMap[templateName]) {
        embedsMap[templateName] = [];
      }

      embedsMap[templateName].push({ id: interaction.id, embed });


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
        const extraRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`raid_waitlist-${templateName}-${interaction.id}`)
            .setLabel('Lista de espera')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🕒'),
          new ButtonBuilder()
            .setCustomId(`raid_cannotgo-${templateName}-${interaction.id}`)
            .setLabel('No puedo ir')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🚫')
        );
        raidMessage = await interaction.reply({
          embeds: [embed],
          components: [row, extraRow],
          content: notificationContent || undefined,
        });
      } else {
        console.log(`[DEBUG RAID] Publicando con safeReply() sin roles`);
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const extraRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`raid_waitlist-${templateName}-${interaction.id}`)
            .setLabel('Lista de espera')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🕒'),
          new ButtonBuilder()
            .setCustomId(`raid_cannotgo-${templateName}-${interaction.id}`)
            .setLabel('No puedo ir')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🚫')
        );
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

