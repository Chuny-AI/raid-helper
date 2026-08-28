const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

/**
 * Helpers de embeds que NO forman parte del ciclo de vida de un raid
 * (ese vive en src/utils/raidRender.js): builds de arma, notificaciones
 * masivas y recordatorios.
 *
 * Crea un embed atractivo para mostrar la build de un arma
 * @param {string} weaponCategory - Categoría del arma (ej: "Maza íncubo")
 * @param {string} weaponUrl - URL de la build
 * @param {string} emojiId - ID del emoji del arma
 * @param {string} templateName - Nombre del template
 * @returns {EmbedBuilder} - Embed de la build
 */
const createBuildEmbed = (weaponCategory, weaponUrl, emojiId, templateName) => {
  const embed = new EmbedBuilder()
    .setTitle(`🔗 Build para ${weaponCategory}`)
    .setDescription(`Aquí tienes la build que debes usar para el rol **${weaponCategory}** en la actividad **${templateName}**.`)
    .setColor("#00FFFF")
    .setTimestamp()
    .setFooter({
      text: "Creado con ❤️ por Chuny",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
    })
    .setAuthor({
      name: "Chuny BOT",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
      url: "https://github.com/M8-Babbage/avalon-raid-helper",
    });

  if (emojiId) {
    embed.setThumbnail(`https://cdn.discordapp.com/emojis/${emojiId}.png`);
  }

  embed.addFields({
    name: "🔗 Enlace de la Build",
    value: `[Ver build en Albion Free Market](${weaponUrl})`,
    inline: false,
  });

  embed.addFields({
    name: "📋 Instrucciones",
    value: "• Haz clic en el enlace para ver la build completa\n• Equípate con los items mostrados\n• ¡Prepárate para la actividad!",
    inline: false,
  });

  return embed;
};

/**
 * Crea un embed para cuando no hay build específica configurada
 * @param {string} weaponCategory - Categoría del arma
 * @param {string} templateName - Nombre del template
 * @returns {EmbedBuilder} - Embed informativo
 */
const createNoBuildEmbed = (weaponCategory, templateName) => {
  const embed = new EmbedBuilder()
    .setTitle(`⚠️ ${weaponCategory}`)
    .setDescription(`No hay una build específica configurada para el rol **${weaponCategory}** en la actividad **${templateName}**.`)
    .setColor("#FFA500")
    .setTimestamp()
    .setFooter({
      text: "Creado con ❤️ por Chuny",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
    })
    .setAuthor({
      name: "Chuny BOT",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
      url: "https://github.com/M8-Babbage/avalon-raid-helper",
    });

  embed.addFields({
    name: "📋 Instrucciones",
    value: "• Consulta con el líder de la actividad para más detalles\n• Revisa las reglas del servidor\n• ¡Prepárate para la actividad!",
    inline: false,
  });

  return embed;
};

/**
 * Crea un embed sutil para notificaciones masivas de actividad
 * @param {string} activityTitle - Título de la actividad
 * @param {string} serverName - Nombre del servidor
 * @param {string} timeRemaining - Tiempo restante formateado
 * @param {string} leaderName - Nombre del líder
 * @param {string} messageUrl - URL del mensaje del raid (opcional)
 * @returns {Object} - Objeto con embed y componentes
 */
const createMassNotificationEmbed = (activityTitle, serverName, timeRemaining, leaderName, messageUrl = null) => {
  const embed = new EmbedBuilder()
    .setTitle(`🔔 Nueva Actividad - ${activityTitle}`)
    .setDescription(`Se ha creado una nueva actividad en **${serverName}**`)
    .setColor("#7289DA") // Color sutil de Discord
    .setTimestamp()
    .setFooter({
      text: "Chuny BOT - Notificación",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
    })
    .setAuthor({
      name: "Chuny BOT",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
      url: "https://github.com/M8-Babbage/avalon-raid-helper",
    });

  embed.addFields({
    name: "📋 Actividad",
    value: activityTitle,
    inline: true,
  });

  embed.addFields({
    name: "🏰 Servidor",
    value: serverName,
    inline: true,
  });

  embed.addFields({
    name: "⏰ Tiempo Restante",
    value: timeRemaining,
    inline: true,
  });

  embed.addFields({
    name: "👑 Líder",
    value: leaderName,
    inline: true,
  });

  embed.addFields({
    name: "🚀 ¿Cómo unirse?",
    value: messageUrl ?
      "• Haz clic en el botón 'Ir al Evento' para ir directamente al raid\n• Usa los menús desplegables para seleccionar tu rol\n• ¡Prepárate para la aventura!" :
      "• Ve al canal donde se publicó el evento\n• Usa los menús desplegables para seleccionar tu rol\n• ¡Prepárate para la aventura!",
    inline: false,
  });

  // Crear componentes si hay messageUrl
  let components = [];
  if (messageUrl) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setURL(messageUrl)
          .setLabel('🚀 Ir al Evento')
      );
    components = [row];
  }

  return {
    embeds: [embed],
    components: components
  };
};

/**
 * Crea un embed atractivo para recordatorios de actividad
 * @param {string} activityTitle - Título de la actividad
 * @param {string} templateName - Nombre del template
 * @param {string} timeRemaining - Tiempo restante formateado
 * @param {Array} participants - Lista de participantes
 * @param {string} channelId - ID del canal donde se creó la actividad
 * @returns {EmbedBuilder} - Embed del recordatorio
 */
const createReminderEmbed = (activityTitle, templateName, timeRemaining, participants = [], channelId = null) => {
  const embed = new EmbedBuilder()
    .setTitle(`🔔 Recordatorio de Actividad`)
    .setDescription(`¡La actividad comenzará pronto! Prepárate para unirse.`)
    .setColor("#FFD700") // Color dorado para recordatorios
    .setTimestamp()
    .setFooter({
      text: "Chuny BOT - Recordatorio",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
    })
    .setAuthor({
      name: "Chuny BOT",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
      url: "https://github.com/M8-Babbage/avalon-raid-helper",
    });

  embed.addFields({
    name: "📋 Actividad",
    value: activityTitle,
    inline: true,
  });

  embed.addFields({
    name: "📝 Template",
    value: templateName,
    inline: true,
  });

  embed.addFields({
    name: "⏰ Tiempo Restante",
    value: timeRemaining,
    inline: true,
  });

  if (participants.length > 0) {
    const participantsList = participants.slice(0, 10).map(p => `• ${p}`).join('\n');
    const moreText = participants.length > 10 ? `\n... y ${participants.length - 10} más` : '';

    embed.addFields({
      name: `👥 Participantes (${participants.length})`,
      value: participantsList + moreText,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "👥 Participantes",
      value: "• Aún no hay participantes",
      inline: false,
    });
  }

  embed.addFields({
    name: "🚀 Instrucciones",
    value: "• Haz clic en el botón 'Ir al Evento' para ir al canal\n• Prepárate con el equipo necesario\n• ¡Disfruta de la actividad!",
    inline: false,
  });

  return embed;
};

/**
 * Crea un botón "Ir al Evento" que redirige al canal donde se creó la actividad
 * @param {string} channelId - ID del canal donde se creó la actividad
 * @param {string} guildId - ID del servidor (opcional, se detectará automáticamente)
 * @returns {ActionRowBuilder} - Fila de botones
 */
const createGoToEventButton = (channelId, guildId = null) => {
  let finalGuildId = guildId;
  if (!finalGuildId) {
    try {
      const { client } = require('./client');
      const channel = client.channels.cache.get(channelId);
      if (channel && channel.guild) {
        finalGuildId = channel.guild.id;
      }
    } catch (error) {
      console.error('[ERROR] No se pudo obtener el guildId:', error);
    }
  }

  if (!finalGuildId) {
    finalGuildId = process.env.GUILD_ID || 'YOUR_GUILD_ID';
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setLabel('🚀 Ir al Evento')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${finalGuildId}/${channelId}`)
    );

  return row;
};

/**
 * Crea componentes (botones) para notificaciones masivas
 * @param {string} channelId - ID del canal donde se creó la actividad
 * @param {string} guildId - ID del servidor (opcional)
 * @returns {Array} - Array de componentes
 */
const createMassNotificationComponents = (channelId, guildId = null) => {
  return [createGoToEventButton(channelId, guildId)];
};

/**
 * Crea componentes (botones) para recordatorios
 * @param {string} channelId - ID del canal donde se creó la actividad
 * @param {string} guildId - ID del servidor (opcional)
 * @returns {Array} - Array de componentes
 */
const createReminderComponents = (channelId, guildId = null) => {
  return [createGoToEventButton(channelId, guildId)];
};

module.exports = {
  createBuildEmbed,
  createNoBuildEmbed,
  createReminderEmbed,
  createMassNotificationEmbed,
  createGoToEventButton,
  createMassNotificationComponents,
  createReminderComponents,
};
