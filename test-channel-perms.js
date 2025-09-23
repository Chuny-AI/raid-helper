/**
 * Script para probar la configuración de canales y verificar permisos
 */

const { EmbedBuilder } = require('discord.js');

/**
 * Función para verificar permisos del bot en un canal
 * @param {Object} channel - El canal de Discord
 * @param {Object} botUser - El usuario bot
 * @returns {Object} - Información sobre permisos
 */
function checkChannelPermissions(channel, botUser) {
  const permissions = channel.permissionsFor(botUser);

  return {
    canViewChannel: permissions.has('ViewChannel'),
    canSendMessages: permissions.has('SendMessages'),
    canEmbedLinks: permissions.has('EmbedLinks'),
    canAttachFiles: permissions.has('AttachFiles'),
    canReadMessageHistory: permissions.has('ReadMessageHistory'),
    allPermissions: permissions.toArray()
  };
}

/**
 * Función para probar envío de embed a un canal
 * @param {Object} channel - El canal donde enviar
 * @param {string} title - Título del embed
 * @param {string} description - Descripción del embed
 */
async function testChannelEmbed(channel, title, description) {
  try {
    const testEmbed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor('#00D166')
      .setTimestamp()
      .setFooter({
        text: 'Avalon Raid Helper - Prueba de Canal',
        iconURL: 'https://i.imgur.com/AfFp7pu.png'
      });

    await channel.send({ embeds: [testEmbed] });
    return { success: true, message: 'Embed enviado exitosamente' };
  } catch (error) {
    return { success: false, error: error.message, code: error.code };
  }
}

module.exports = {
  checkChannelPermissions,
  testChannelEmbed
};