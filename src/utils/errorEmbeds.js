const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Crea un embed de error hermoso con redes sociales
 * @param {string} title - Título del error
 * @param {string} description - Descripción del error
 * @param {Array} fields - Campos adicionales (opcional)
 * @returns {EmbedBuilder} - Embed de error
 */
const createErrorEmbed = (title, description, fields = []) => {
  const embed = new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setColor("#FF0000")
    .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
    .setTimestamp()
    .setFooter({
      text: "Chuny BOT - Error",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
    })
    .setAuthor({
      name: "Chuny Dev",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
      url: "https://www.twitch.tv/chuny_dev",
    });

  fields.forEach(field => {
    embed.addFields(field);
  });

  embed.addFields(
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
      value: `<@${process.env.BOT_OWNER_ID}>`,
      inline: true
    },
    {
      name: "💡 ¿Necesitas Ayuda?",
      value: `Contacta directamente a <@${process.env.BOT_OWNER_ID}> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para soporte.`,
      inline: false
    }
  );

  return embed;
};

/**
 * Crea un embed de warning hermoso con redes sociales
 * @param {string} title - Título del warning
 * @param {string} description - Descripción del warning
 * @param {Array} fields - Campos adicionales (opcional)
 * @returns {EmbedBuilder} - Embed de warning
 */
const createWarningEmbed = (title, description, fields = []) => {
  const embed = new EmbedBuilder()
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setColor("#FFA500")
    .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
    .setTimestamp()
    .setFooter({
      text: "Chuny BOT - Warning",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
    })
    .setAuthor({
      name: "Chuny Dev",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
      url: "https://www.twitch.tv/chuny_dev",
    });

  fields.forEach(field => {
    embed.addFields(field);
  });

  embed.addFields(
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
      value: `<@${process.env.BOT_OWNER_ID}>`,
      inline: true
    },
    {
      name: "💡 ¿Necesitas Ayuda?",
      value: `Contacta directamente a <@${process.env.BOT_OWNER_ID}> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para soporte.`,
      inline: false
    }
  );

  return embed;
};

/**
 * Crea un embed de información hermoso con redes sociales
 * @param {string} title - Título de la información
 * @param {string} description - Descripción de la información
 * @param {Array} fields - Campos adicionales (opcional)
 * @returns {EmbedBuilder} - Embed de información
 */
const createInfoEmbed = (title, description, fields = []) => {
  const embed = new EmbedBuilder()
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description)
    .setColor("#00BFFF")
    .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
    .setTimestamp()
    .setFooter({
      text: "Chuny BOT - Información",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
    })
    .setAuthor({
      name: "Chuny Dev",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
      url: "https://www.twitch.tv/chuny_dev",
    });

  fields.forEach(field => {
    embed.addFields(field);
  });

  embed.addFields(
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
      value: `<@${process.env.BOT_OWNER_ID}>`,
      inline: true
    },
    {
      name: "💡 ¿Necesitas Ayuda?",
      value: `Contacta directamente a <@${process.env.BOT_OWNER_ID}> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para soporte.`,
      inline: false
    }
  );

  return embed;
};

/**
 * Crea un embed de éxito hermoso con redes sociales
 * @param {string} title - Título del éxito
 * @param {string} description - Descripción del éxito
 * @param {Array} fields - Campos adicionales (opcional)
 * @returns {EmbedBuilder} - Embed de éxito
 */
const createSuccessEmbed = (title, description, fields = []) => {
  const embed = new EmbedBuilder()
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setColor("#00FF00")
    .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
    .setTimestamp()
    .setFooter({
      text: "Chuny BOT - Éxito",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
    })
    .setAuthor({
      name: "Chuny Dev",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
      url: "https://www.twitch.tv/chuny_dev",
    });

  fields.forEach(field => {
    embed.addFields(field);
  });

  embed.addFields(
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
      value: `<@${process.env.BOT_OWNER_ID}>`,
      inline: true
    },
    {
      name: "💡 ¿Necesitas Ayuda?",
      value: `Contacta directamente a <@${process.env.BOT_OWNER_ID}> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para soporte.`,
      inline: false
    }
  );

  return embed;
};

/**
 * Función helper para manejar respuestas de forma segura
 * @param {Object} interaction - La interacción de Discord
 * @param {Object} options - Opciones para la respuesta
 */
const safeReply = async (interaction, options) => {
  try {
    // Verificar si la interacción ya fue respondida o diferida
    if (interaction.replied) {
      console.log('[WARN] Interacción ya respondida, usando editReply');
      return await interaction.editReply(options);
    }

    if (interaction.deferred) {
      console.log('[WARN] Interacción diferida, usando editReply');
      return await interaction.editReply(options);
    }

    // Manejar ephemeral flag
    if (options && 'ephemeral' in options) {
      if (options.ephemeral) {
        options.flags = 64;
      }
      delete options.ephemeral;
    }

    // Respuesta normal
    console.log('[SAFE_REPLY] Enviando respuesta normal');
    return await interaction.reply(options);

  } catch (error) {
    console.error('[ERROR] Error en safeReply:', error);

    // Si es error de interacción desconocida o ya reconocida, no intentar más respuestas
    if (error.code === 10062 || error.code === 40060) {
      console.error('[ERROR] Interacción expirada, desconocida o ya reconocida, no se puede responder');
      return;
    }

    // Para otros errores, NO intentar respuesta de emergencia para evitar conflictos
    console.error('[ERROR] Error inesperado en safeReply, no intentando respuesta de emergencia');
  }
};

/**
 * Crea un embed premium estándar para toda la aplicación
 * @returns {EmbedBuilder} - Embed premium estandarizado
 */
const createPremiumEmbed = () => {
  const embed = new EmbedBuilder()
    .setTitle("✨ ¡Acceso Premium Requerido!")
    .setDescription("Esta acción requiere una suscripción **Premium** activa en tu servidor.")
    .setColor("#FFD700")
    .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
    .addFields(
      {
        name: "💰 Planes Premium",
        value: [
          "• Mensual: **$8 USD**",
          "• Semestral: **$45 USD** (6% de ahorro)",
          "• Anual: **$80 USD** (16% de ahorro)"
        ].join("\n"),
        inline: false
      },
      {
        name: "📌 Requisito",
        value: "Algunas funciones avanzadas del bot requieren Premium.",
        inline: false
      },
      {
        name: "🔗 Suscripción",
        value: `[Suscribirse ahora](${process.env.PREMIUM_SUBSCRIBE_URL || 'https://discord.com/channels/1322040044265013268/1420525781125304401'})`,
        inline: false
      }
    )
    .setFooter({
      text: "Chuny BOT - Premium",
      iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless"
    })
    .setTimestamp();
  return embed;
};

// Botón CTA de suscripción
const getPremiumCTAComponents = () => {
  const url = process.env.PREMIUM_SUBSCRIBE_URL || 'https://discord.com/channels/1322040044265013268/1420525781125304401';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Suscribirse').setURL(url)
  );
  return [row];
};

module.exports = {
  createErrorEmbed,
  createWarningEmbed,
  createInfoEmbed,
  createSuccessEmbed,
  createPremiumEmbed,
  getPremiumCTAComponents,
  safeReply
};
