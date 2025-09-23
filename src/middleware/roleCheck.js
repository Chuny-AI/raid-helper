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
    // Verificar que la interacción sea en un servidor
    if (!interaction.guild || !interaction.member) {
      return false;
    }

    // Verificar si es el propietario del bot
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

    // Verificar si es administrador del servidor
    if (interaction.member.permissions.has('Administrator')) {
      return true;
    }

    // Verificar si tiene roles autorizados
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
    // Verificar que la interacción sea en un servidor
    if (!interaction.guild) {
      return false; // No permitir comandos premium en DMs
    }

    // Verificar si es el propietario del bot
    let botOwnerId;
    const application = interaction.client.application;
    if (application && application.owner) {
      botOwnerId = application.owner.id;
    } else {
      botOwnerId = process.env.BOT_OWNER_ID;
    }
    
    // PRIORIDAD 1: Verificar si el servidor es premium
    const guildId = interaction.guild.id;
    const isPremium = await isServerPremium(guildId);
    
    if (!isPremium) {
      // Si NO es premium, solo el propietario puede usar comandos
      if (interaction.user.id === botOwnerId) {
        return true; // El propietario puede usar comandos en cualquier servidor
      } else {
        // Cualquier otro usuario (incluso administradores) NO puede usar comandos
        const premiumEmbed = new EmbedBuilder()
          .setTitle("💎 Servidor Premium Requerido")
          .setDescription("Este comando solo está disponible en servidores premium. ¡Contacta a un administrador para activar premium en este servidor!")
          .setColor("#FFD700")
          .setThumbnail("https://i.imgur.com/AfFp7pu.png")
          .setTimestamp()
          .setFooter({
            text: "Avalon Raid Helper - Premium",
            iconURL: "https://i.imgur.com/AfFp7pu.png",
          })
          .setAuthor({
            name: "Chuny Dev",
            iconURL: "https://i.imgur.com/AfFp7pu.png",
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

        // No hacer reply aquí, el comando principal manejará la respuesta
        return false;
      }
    }

    // PRIORIDAD 2: Si ES premium, verificar permisos de usuario (admin o roles autorizados)
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
