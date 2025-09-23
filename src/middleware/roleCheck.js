const { getAuthorizedRoles } = require('../services/authorizedRoleService');
const { isServerPremium } = require('../services/serverService');
const { EmbedBuilder } = require('discord.js');

/**
 * Middleware para verificar si un usuario tiene roles autorizados para comandos premium.
 * @param {Object} interaction - La interacción de Discord.
 * @returns {Promise<boolean>} - true si el usuario tiene roles autorizados, false si no.
 */
const checkAuthorizedRole = async (interaction) => {
  try {
    if (!interaction.guild || !interaction.member) {
      return false;
    }

    const guildId = interaction.guild.id;
    const authorizedRoles = await getAuthorizedRoles(guildId);
    
    if (authorizedRoles.length === 0) {
      return false;
    }

    const authorizedRoleIds = authorizedRoles.map(role => role.roleId);
    const hasAuthorizedRole = interaction.member.roles.cache.some(role => 
      authorizedRoleIds.includes(role.id)
    );

    return hasAuthorizedRole;
  } catch (error) {
    console.error('[ERROR] Error en checkAuthorizedRole:', error);
    return false;
  }
};

/**
 * Middleware para verificar si un usuario puede usar comandos premium.
 * Verifica si es propietario del bot, administrador, o tiene roles autorizados.
 * @param {Object} interaction - La interacción de Discord.
 * @returns {Promise<boolean>} - true si el usuario puede usar comandos premium, false si no.
 */
const checkPremiumAccess = async (interaction) => {
  try {
    if (!interaction.guild || !interaction.member) {
      return false;
    }

    let botOwnerId;
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      botOwnerId = process.env.BOT_OWNER_ID;
    }
    
    if (interaction.user.id === botOwnerId) {
      return true;
    }

    if (interaction.member.permissions.has('Administrator')) {
      return true;
    }

    const hasAuthorizedRole = await checkAuthorizedRole(interaction);
    if (hasAuthorizedRole) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('[ERROR] Error en checkPremiumAccess:', error);
    return false;
  }
};

/**
 * Middleware para verificar acceso premium con bypass para el propietario.
 * PRIORIDAD 1: Solo el propietario puede usar comandos en servidores no premium.
 * PRIORIDAD 2: En servidores premium, verificar permisos de usuario.
 * @param {Object} interaction - La interacción de Discord.
 * @returns {Promise<boolean>} - true si el usuario puede usar el comando, false si no.
 */
const checkPremiumAccessWithOwnerBypass = async (interaction) => {
  try {
    if (!interaction.guild) {
      return false; // No permitir comandos premium en DMs
    }

    let botOwnerId;
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      botOwnerId = process.env.BOT_OWNER_ID;
    }
    
    const guildId = interaction.guild.id;
    const isPremium = await isServerPremium(guildId);
    
    if (!isPremium) {
      if (interaction.user.id === botOwnerId) {
        return true; // El propietario puede usar comandos en cualquier servidor
      } else {
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

        return false;
      }
    }

    return await checkPremiumAccess(interaction);
  } catch (error) {
    console.error('[ERROR] Error en checkPremiumAccessWithOwnerBypass:', error);
    return false;
  }
};

module.exports = {
  checkAuthorizedRole,
  checkPremiumAccess,
  checkPremiumAccessWithOwnerBypass
};
