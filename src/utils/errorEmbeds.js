const { EmbedBuilder } = require('discord.js');

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
    .setThumbnail("https://i.imgur.com/AfFp7pu.png")
    .setTimestamp()
    .setFooter({
      text: "Avalon Raid Helper - Error",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
    })
    .setAuthor({
      name: "Chuny Dev",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
      url: "https://www.twitch.tv/chuny_dev",
    });

  // Agregar campos adicionales si se proporcionan
  fields.forEach(field => {
    embed.addFields(field);
  });

  // Agregar sección de redes sociales
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
      value: "<@464241835930419210>",
      inline: true
    },
    {
      name: "💡 ¿Necesitas Ayuda?",
      value: "Contacta directamente a <@464241835930419210> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para soporte.",
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
    .setThumbnail("https://i.imgur.com/AfFp7pu.png")
    .setTimestamp()
    .setFooter({
      text: "Avalon Raid Helper - Warning",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
    })
    .setAuthor({
      name: "Chuny Dev",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
      url: "https://www.twitch.tv/chuny_dev",
    });

  // Agregar campos adicionales si se proporcionan
  fields.forEach(field => {
    embed.addFields(field);
  });

  // Agregar sección de redes sociales
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
      value: "<@464241835930419210>",
      inline: true
    },
    {
      name: "💡 ¿Necesitas Ayuda?",
      value: "Contacta directamente a <@464241835930419210> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para soporte.",
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
    .setThumbnail("https://i.imgur.com/AfFp7pu.png")
    .setTimestamp()
    .setFooter({
      text: "Avalon Raid Helper - Información",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
    })
    .setAuthor({
      name: "Chuny Dev",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
      url: "https://www.twitch.tv/chuny_dev",
    });

  // Agregar campos adicionales si se proporcionan
  fields.forEach(field => {
    embed.addFields(field);
  });

  // Agregar sección de redes sociales
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
      value: "<@464241835930419210>",
      inline: true
    },
    {
      name: "💡 ¿Necesitas Ayuda?",
      value: "Contacta directamente a <@464241835930419210> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para soporte.",
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
    .setThumbnail("https://i.imgur.com/AfFp7pu.png")
    .setTimestamp()
    .setFooter({
      text: "Avalon Raid Helper - Éxito",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
    })
    .setAuthor({
      name: "Chuny Dev",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
      url: "https://www.twitch.tv/chuny_dev",
    });

  // Agregar campos adicionales si se proporcionan
  fields.forEach(field => {
    embed.addFields(field);
  });

  // Agregar sección de redes sociales
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
      value: "<@464241835930419210>",
      inline: true
    },
    {
      name: "💡 ¿Necesitas Ayuda?",
      value: "Contacta directamente a <@464241835930419210> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para soporte.",
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
    // Map deprecated ephemeral option to flags:64
    if (options && 'ephemeral' in options) {
      if (options.ephemeral) {
        options.flags = 64;
      }
      delete options.ephemeral;
    }
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(options);
    } else {
      await interaction.reply(options);
    }
  } catch (error) {
    console.error('[ERROR] Error en safeReply:', error);
    try {
      if (options && 'ephemeral' in options) {
        if (options.ephemeral) {
          options.flags = 64;
        }
        delete options.ephemeral;
      }
      // Si ya fue reconocida la interacción (40060), intenta followUp; si es desconocida (10062), ignora silenciosamente
      if ((interaction.replied || interaction.deferred) && error.code !== 10062) {
        await interaction.followUp({
          content: "⚠️ Error procesando la respuesta, pero el comando continúa.",
          flags: 64
        });
      }
    } catch (followUpError) {
      console.error('[ERROR] Error en followUp:', followUpError);
    }
  }
};

module.exports = {
  createErrorEmbed,
  createWarningEmbed,
  createInfoEmbed,
  createSuccessEmbed,
  safeReply
};
