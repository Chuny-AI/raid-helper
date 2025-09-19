const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, embedsMap, createMassNotificationEmbed } = require("../../utils/embed");
const { parseTime } = require("../../utils/time");
const { isValidHex } = require("../../utils/regex");
const { createSelect } = require("../../utils/select");
const { getTemplateNames, getTemplateByName } = require("../../services/templateService");
const { getOrCreateServer } = require("../../services/serverService");
const { checkPremium } = require("../../middleware/premiumCheck");
const { isUserAuthorized } = require("../../services/authorizedRoleService");

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
    .setDescription(
      "Envía una notificación para una actividad basada en una plantilla previamente creada con /add."
    )
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
    .addBooleanOption((option) =>
      option
        .setName("notify_all")
        .setDescription(
          "Enviar notificación a todos los usuarios del servidor (opcional)"
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
      /**
       * Verificar estado premium del servidor
       */
      const hasPremium = await checkPremium(interaction);
      if (!hasPremium) {
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
      const notifyAll = interaction.options.getBoolean("notify_all");
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
        return interaction.reply({
          content: `No se encontró la plantilla "${templateName}" en este servidor.`,
          ephemeral: true,
        });
      }

      let delayTime;
      try {
        delayTime = parseTime(time ?? template.time);
      } catch (timeError) {
        return interaction.reply({
          content: `❌ Error en el tiempo del evento: ${timeError.message}`,
          ephemeral: true,
        });
      }

      // Validar que el tiempo del evento no exceda 1 hora
      const maxEventTime = 60 * 60 * 1000; // 1 hora en milisegundos
      if (delayTime > maxEventTime) {
        return interaction.reply({
          content: "❌ El tiempo del evento no puede exceder 1 hora. Usa un tiempo menor (ej: 45m, 30m).",
          ephemeral: true,
        });
      }

      // Validar reminder si se proporcionó
      if (reminder) {
        let reminderTime;
        try {
          reminderTime = parseTime(reminder);
        } catch (reminderError) {
          return interaction.reply({
            content: `❌ Error en el tiempo del recordatorio: ${reminderError.message}`,
            ephemeral: true,
          });
        }
        
        if (reminderTime >= delayTime) {
          return interaction.reply({
            content: "❌ El tiempo del recordatorio debe ser menor al tiempo del evento.",
            ephemeral: true,
          });
        }
        if (reminderTime <= 0) {
          return interaction.reply({
            content: "❌ El tiempo del recordatorio debe ser mayor a 0.",
            ephemeral: true,
          });
        }
      }

      if (color && !isValidHex(color)) {
        return interaction.reply({
          content:
            "El color proporcionado no es válido. Usa el formato hexadecimal (#FFFFFF).",
          ephemeral: true,
        });
      }

      const row = createSelect(template, templateName, interaction);
      const embed = createEmbed({ title, delayTime, template, color, image, description, user });

      if (!embedsMap[templateName]) {
        embedsMap[templateName] = [];
      }

      embedsMap[templateName].push({ id: interaction.id, embed });

      /**
       * Verificar permisos para enviar notificaciones a todos los usuarios
       */
      if (notifyAll || template.notifyAll) {
        const hasNotificationPermission = await isUserAuthorized(interaction.member, guildId);
        
        if (!hasNotificationPermission) {
          return interaction.reply({
            content: "❌ No tienes permisos para enviar notificaciones a todos los usuarios. Solo los administradores y usuarios con roles autorizados pueden usar esta función. Usa `/roles list` para ver los roles autorizados.",
            ephemeral: true,
          });
        }
      }

      /**
       * Enviar notificación a todos los usuarios si notify_all está habilitado
       * (ya sea por parámetro del comando o por configuración del template)
       */
      if (notifyAll || template.notifyAll) {
        try {
          // Obtener todos los miembros del servidor
          const members = await interaction.guild.members.fetch();
          const memberList = members.map(member => member.user);
          
          // Crear embed de notificación masiva
          const activityTitle = title || template.title;
          const timeRemaining = time || template.time;
          const massNotificationEmbed = createMassNotificationEmbed(
            activityTitle,
            interaction.guild.name,
            timeRemaining,
            user.toString()
          );
          
          // Enviar DM a cada usuario
          for (const member of memberList) {
            try {
              await member.send({
                embeds: [massNotificationEmbed]
              });
            } catch (dmError) {
              // Ignorar errores de DM (usuarios con DMs deshabilitados, etc.)
              console.log(`[INFO] No se pudo enviar DM a ${member.username}: ${dmError.message}`);
            }
          }
          
          console.log(`[INFO] Notificación masiva enviada a ${memberList.length} usuarios del servidor`);
        } catch (notifyError) {
          console.error('[ERROR] Error enviando notificaciones:', notifyError);
        }
      }

      /**
       * Configurar recordatorio si se especificó
       */
      if (reminder) {
        try {
          const { createReminder, addInterestedUser } = require('../../utils/reminderManager');
          const activityTitle = title || template.title;
          const activityTime = time || template.time;
          
          createReminder(
            interaction.id,
            reminder,
            activityTime,
            templateName,
            interaction.channel.id,
            guildId,
            activityTitle,
            [] // Los participantes se actualizarán dinámicamente
          );
          
          // Agregar al creador del evento como usuario interesado
          addInterestedUser(interaction.id, interaction.user.id);
          
          console.log(`[INFO] Recordatorio configurado para ${templateName} en ${reminder}`);
        } catch (reminderError) {
          console.error('[ERROR] Error configurando recordatorio:', reminderError);
        }
      }

      /**
       * Interactuar con el usuario
       */
      await interaction.reply({
        embeds: [embed],
        components: [row],
        content: `${pingRoles(template)}`,
      });
    } catch (error) {
      console.error('[ERROR] Error en comando raid:', error);
      await interaction.reply({
        content: "Hubo un error ejecutando el comando. Inténtalo de nuevo.",
        ephemeral: true,
      });
    }
  },
};
