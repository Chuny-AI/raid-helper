const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createEmbed, embedsMap, createMassNotificationEmbed } = require("../../utils/embed");
const { parseTime } = require("../../utils/time");
const { isValidHex } = require("../../utils/regex");
const { createSelect } = require("../../utils/select");
const { getTemplateNames, getTemplateByName } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { checkPremiumAccessWithOwnerBypass } = require("../../middleware/roleCheck");
const { isUserAuthorized } = require("../../services/authorizedRoleService");
const { createErrorEmbed, createWarningEmbed, createInfoEmbed, createSuccessEmbed, safeReply } = require("../../utils/errorEmbeds");


const pingRoles = (template) => {
  const roles = template.roles;
  if (roles && roles.length > 0) {
    return roles.map((roleId) => `<@&${roleId}>`).join(", ");
  }
};



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
        .setName("time")
        .setDescription(
          'Indica el tiempo restante para la actividad en formato "1h 30m" (opcional)'
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
          'Tiempo antes de la actividad para enviar recordatorio (ej: "10m", "30m", "1h") (opcional)'
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
      try {
        const guildId = interaction.guild.id;
        const templates = await getTemplateNames(guildId);

        const filtered = templates
          .filter(template =>
            template.name.toLowerCase().includes(focusedOption.value.toLowerCase())
          )
          .slice(0, 25); // Discord limita a 25 opciones

        await interaction.respond(
          filtered.map(template => ({
            name: template.name,
            value: template.name
          }))
        );
      } catch (error) {
        console.error('[ERROR] Error en autocomplete:', error);
        await interaction.respond([]);
      }
    }
  },

  async execute(interaction) {
    try {
      await interaction.deferReply();

      /**
       * Verificar acceso premium - SIN BYPASS PARA EL DUEÑO
       */
      const { isServerPremium } = require('../../services/serverService');
      const isPremium = await isServerPremium(interaction.guild.id);

      if (!isPremium) {
        const premiumEmbed = new EmbedBuilder()
          .setTitle("💎 Servidor Premium Requerido")
          .setDescription("Este comando solo está disponible en servidores premium. ¡Contacta a un administrador para activar premium en este servidor!")
          .setColor("#FFD700")
          .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
          .setTimestamp()
          .setFooter({
            text: "Chuny BOT - Premium",
            iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
          })
          .setAuthor({
            name: "Chuny Dev",
            iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
            url: "https://www.twitch.tv/chuny_dev",
          })
          .addFields(
            {
              name: "🔗 Mis Redes Sociales",
              value: "¡Sígueme para estar al día con las últimas actualizaciones!",
              inline: false
            },
            {
              name: "🎮 Twitch",
              value: "[@chuny_dev](https://www.twitch.tv/chuny_dev)",
              inline: true
            },
            {
              name: "💬 Discord",
              value: "[Mi Canal](https://discord.gg/6fFHsmewSn)",
              inline: true
            },
            {
              name: "👤 Contacto Directo",
              value: "<@464241835930419210>",
              inline: true
            },
            {
              name: "💡 ¿Cómo obtener Premium?",
              value: "Contacta directamente a <@464241835930419210> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para más información.",
              inline: false
            }
          );

        await interaction.editReply({ embeds: [premiumEmbed] });
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

      let delayTime;
      try {
        delayTime = parseTime(time ?? template.time);
      } catch (timeError) {
        const errorEmbed = createErrorEmbed(
          "Error en el Tiempo del Evento",
          `Error procesando el tiempo del evento: ${timeError.message}`,
          [{
            name: "Formato Correcto",
            value: "Usa formatos como: `1h 30m`, `45m`, `2h`, `30s`",
            inline: false
          }]
        );
        return await safeReply(interaction, {
          embeds: [errorEmbed],
          ephemeral: true,
        });
      }

      const maxEventTime = 60 * 60 * 1000; // 1 hora en milisegundos
      if (delayTime > maxEventTime) {
        const warningEmbed = createWarningEmbed(
          "Tiempo del Evento Excedido",
          "El tiempo del evento no puede exceder 1 hora.",
          [{
            name: "Tiempos Válidos",
            value: "Usa tiempos como: `45m`, `30m`, `15m`, `1h`",
            inline: false
          }]
        );
        return await safeReply(interaction, {
          embeds: [warningEmbed],
          ephemeral: true,
        });
      }

      let finalReminder = reminder;
      if (!reminder && template.reminder) {
        finalReminder = template.reminder;
      }

      if (finalReminder) {
        let reminderTime;
        try {
          reminderTime = parseTime(finalReminder);
        } catch (reminderError) {
          const errorEmbed = createErrorEmbed(
            "Error en el Tiempo del Recordatorio",
            `Error procesando el tiempo del recordatorio: ${reminderError.message}`,
            [{
              name: "Formato Correcto",
              value: "Usa formatos como: `10m`, `30m`, `1h`",
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [errorEmbed],
            ephemeral: true,
          });
        }

        if (reminderTime >= delayTime) {
          const warningEmbed = createWarningEmbed(
            "Tiempo de Recordatorio Inválido",
            "El tiempo del recordatorio debe ser menor al tiempo del evento.",
            [{
              name: "Ejemplo",
              value: "Si el evento es de `1h`, el recordatorio puede ser `30m` o `15m`",
              inline: false
            }]
          );
          return await safeReply(interaction, {
            embeds: [warningEmbed],
            ephemeral: true,
          });
        }
        if (reminderTime <= 0) {
          const warningEmbed = createWarningEmbed(
            "Tiempo de Recordatorio Inválido",
            "El tiempo del recordatorio debe ser mayor a 0.",
            [{
              name: "Ejemplo",
              value: "Usa tiempos como: `5m`, `10m`, `30m`",
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
      } else if (template.roles && template.roles.length > 0) {
        finalNotificationRoles = template.roles;
      }

      const row = createSelect(template, templateName, interaction);

      const embed = createEmbed({
        title,
        delayTime,
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
          const activityTime = time || template.time;

          createReminder(
            interaction.id,
            finalReminder,
            activityTime,
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
        const roleMentions = finalNotificationRoles.map(roleId => `<@&${roleId}>`).join(' ');
        notificationContent += `${roleMentions}\n`;
      }

      if (finalNotificationRoles.length > 0) {
        try {
          const members = await interaction.guild.members.fetch();
          const targetMembers = members.filter(member =>
            finalNotificationRoles.some(roleId => member.roles.cache.has(roleId))
          );

          const activityTitle = title || template.title;
          const timeRemaining = time || template.time;
          const massNotificationEmbed = createMassNotificationEmbed(
            activityTitle,
            interaction.guild.name,
            timeRemaining,
            user.toString()
          );

          for (const member of targetMembers.values()) {
            try {
              await member.send({
                embeds: [massNotificationEmbed]
              });
            } catch (dmError) {
              console.log(`[INFO] No se pudo enviar DM a ${member.user.username}: ${dmError.message}`);
            }
          }

          console.log(`[INFO] Notificación enviada a ${targetMembers.size} miembros con roles específicos`);
        } catch (notifyError) {
          console.error('[ERROR] Error enviando notificaciones a roles:', notifyError);
        }
      }

      /**
       * Interactuar con el usuario
       */
      await safeReply(interaction, {
        embeds: [embed],
        components: [row],
        content: notificationContent || undefined,
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
