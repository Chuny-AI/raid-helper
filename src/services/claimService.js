const Claim = require('../database/models/Claim');
const ClaimChannelService = require('./claimChannelService');
const { getAuthorizedRoles } = require('./authorizedRoleService');
const { scheduleJob, cancelJob } = require('node-schedule');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

/**
 * Servicio para gestionar claims de actividades de Albion Online
 */
class ClaimService {

  /**
   * Crear un nuevo claim
   * @param {Object} claimData - Datos del claim
   * @returns {Promise<Object>} - Claim creado
   */
  static async createClaim(claimData) {
    try {
      const claimId = Claim.generateClaimId();

      const claim = new Claim({
        claimId,
        userId: claimData.userId,
        username: claimData.username,
        guildId: claimData.guildId,
        channelId: claimData.channelId,
        contentType: claimData.contentType,
        mapLocation: claimData.mapLocation,
        duration: claimData.duration,
        durationText: claimData.durationText,
        claimTime: claimData.claimTime,
        description: claimData.description
      });

      await claim.save();

      // Programar recordatorios automáticos (10min y 5min)
      await this.scheduleReminders(claim);

      // Enviar al canal de claims si está configurado
      console.log(`[DEBUG] Enviando claim ${claim.claimId} al canal de claims`);
      await this.sendClaimToChannel(claim, 'created');

      console.log(`[INFO] Claim creado: ${claimId} por ${claimData.username}`);
      return claim;
    } catch (error) {
      console.error('[ERROR] Error creando claim:', error);
      throw error;
    }
  }

  /**
   * Verificar si un usuario puede gestionar un claim
   * @param {Object} interaction - La interacción de Discord
   * @param {Object} claim - El objeto del claim
   * @returns {Promise<boolean>} - true si puede gestionar el claim
   */
  static async canManageClaim(interaction, claim) {
    try {
      const userId = interaction.user.id;
      const guildId = interaction.guild.id;

      // 1. Verificar si es el dueño del claim
      if (claim.userId === userId) {
        return true;
      }

      // 2. Verificar si es administrador del servidor
      if (interaction.member && interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
      }

      // 3. Verificar si tiene roles autorizados
      const authorizedRoles = await getAuthorizedRoles(guildId);
      if (authorizedRoles.length > 0) {
        const authorizedRoleIds = authorizedRoles.map(role => role.roleId);
        const hasAuthorizedRole = interaction.member.roles.cache.some(role =>
          authorizedRoleIds.includes(role.id)
        );

        if (hasAuthorizedRole) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('[ERROR] Error verificando permisos de claim:', error);
      return false;
    }
  }

  /**
   * Obtener claims activos de un servidor
   * @param {string} guildId - ID del servidor
   * @returns {Promise<Array>} - Lista de claims activos
   */
  static async getActiveClaims(guildId) {
    try {
      const claims = await Claim.find({
        guildId,
        status: 'active',
        claimTime: { $gt: new Date() }
      }).sort({ claimTime: 1 });

      return claims;
    } catch (error) {
      console.error('[ERROR] Error obteniendo claims activos:', error);
      throw error;
    }
  }

  /**
   * Obtener claims de un usuario específico
   * @param {string} userId - ID del usuario
   * @param {string} guildId - ID del servidor
   * @returns {Promise<Array>} - Lista de claims del usuario
   */
  static async getUserClaims(userId, guildId) {
    try {
      const claims = await Claim.find({
        userId,
        guildId,
        status: 'active',
        claimTime: { $gt: new Date() }
      }).sort({ claimTime: 1 });

      return claims;
    } catch (error) {
      console.error('[ERROR] Error obteniendo claims del usuario:', error);
      throw error;
    }
  }

  /**
   * Marcar un claim como completado
   * @param {string} claimId - ID del claim
   * @param {Object} interaction - La interacción de Discord (para verificar permisos)
   * @returns {Promise<Object>} - Claim actualizado
   */
  static async completeClaim(claimId, interaction) {
    try {
      const claim = await Claim.findOne({ claimId });

      if (!claim) {
        throw new Error('Claim no encontrado');
      }

      if (claim.status !== 'active') {
        throw new Error('Este claim ya no está activo');
      }

      // Verificar permisos para gestionar el claim
      const canManage = await this.canManageClaim(interaction, claim);
      if (!canManage) {
        throw new Error('No tienes permisos para completar este claim. Solo el dueño, administradores o usuarios con roles autorizados pueden hacerlo.');
      }

      claim.status = 'completed';
      await claim.save();

      // Cancelar recordatorios si existen
      await this.cancelReminders(claim);

      // Eliminar del canal de claims y enviar al canal de closed
      await this.removeClaimFromChannel(claim);
      await this.sendClaimToChannel(claim, 'completed');

      console.log(`[INFO] Claim completado: ${claimId} por ${interaction.user.id}`);
      return claim;
    } catch (error) {
      console.error('[ERROR] Error completando claim:', error);
      throw error;
    }
  }

  /**
   * Cancelar un claim
   * @param {string} claimId - ID del claim
   * @param {Object} interaction - La interacción de Discord (para verificar permisos)
   * @returns {Promise<Object>} - Claim actualizado
   */
  static async cancelClaim(claimId, interaction) {
    try {
      const claim = await Claim.findOne({ claimId });

      if (!claim) {
        throw new Error('Claim no encontrado');
      }

      if (claim.status !== 'active') {
        throw new Error('Este claim ya no está activo');
      }

      // Verificar permisos para gestionar el claim
      const canManage = await this.canManageClaim(interaction, claim);
      if (!canManage) {
        throw new Error('No tienes permisos para cancelar este claim. Solo el dueño, administradores o usuarios con roles autorizados pueden hacerlo.');
      }

      claim.status = 'cancelled';
      await claim.save();

      // Cancelar recordatorios si existen
      await this.cancelReminders(claim);

      // Eliminar del canal de claims y enviar al canal de closed
      await this.removeClaimFromChannel(claim);
      await this.sendClaimToChannel(claim, 'cancelled');

      console.log(`[INFO] Claim cancelado: ${claimId} por ${interaction.user.id}`);
      return claim;
    } catch (error) {
      console.error('[ERROR] Error cancelando claim:', error);
      throw error;
    }
  }

  /**
   * Programar recordatorios automáticos para un claim (10min y 5min)
   * @param {Object} claim - Objeto del claim
   */
  static async scheduleReminders(claim) {
    try {
      const now = new Date();
      const claimEndTime = new Date(claim.claimTime);

      // Programar recordatorio 10 minutos antes del fin del claim
      const tenMinutesBeforeEnd = new Date(claimEndTime.getTime() - 10 * 60 * 1000);
      if (tenMinutesBeforeEnd > now) {
        const jobId10 = `claim_reminder_10min_${claim.claimId}`;

        scheduleJob(jobId10, tenMinutesBeforeEnd, async () => {
          console.log(`[DEBUG] Ejecutando recordatorio de 10min para claim ${claim.claimId}`);
          await this.sendReminder(claim, '10 minutos');
        });

        claim.reminders.tenMinutes.jobId = jobId10;
        console.log(`[INFO] Recordatorio de 10min programado para claim ${claim.claimId} a las ${tenMinutesBeforeEnd.toISOString()}`);
      } else {
        console.log(`[DEBUG] Recordatorio de 10min no programado para claim ${claim.claimId} - tiempo ya pasado`);
      }

      // Programar recordatorio 5 minutos antes del fin del claim
      const fiveMinutesBeforeEnd = new Date(claimEndTime.getTime() - 5 * 60 * 1000);
      if (fiveMinutesBeforeEnd > now) {
        const jobId5 = `claim_reminder_5min_${claim.claimId}`;

        scheduleJob(jobId5, fiveMinutesBeforeEnd, async () => {
          console.log(`[DEBUG] Ejecutando recordatorio de 5min para claim ${claim.claimId}`);
          await this.sendReminder(claim, '5 minutos');
        });

        claim.reminders.fiveMinutes.jobId = jobId5;
        console.log(`[INFO] Recordatorio de 5min programado para claim ${claim.claimId} a las ${fiveMinutesBeforeEnd.toISOString()}`);
      } else {
        console.log(`[DEBUG] Recordatorio de 5min no programado para claim ${claim.claimId} - tiempo ya pasado`);
      }

      // Programar auto-expiración cuando llegue el tiempo del claim
      const expirationJobId = `claim_expiration_${claim.claimId}`;
      scheduleJob(expirationJobId, claimEndTime, async () => {
        console.log(`[DEBUG] Ejecutando auto-expiración para claim ${claim.claimId}`);
        await this.autoExpireClaim(claim.claimId);
      });

      claim.expirationJobId = expirationJobId;
      console.log(`[INFO] Auto-expiración programada para claim ${claim.claimId} a las ${claimEndTime.toISOString()}`);

      await claim.save();
    } catch (error) {
      console.error('[ERROR] Error programando recordatorios:', error);
    }
  }

  /**
   * Auto-expirar un claim cuando llega a su tiempo límite
   * @param {string} claimId - ID del claim
   */
  static async autoExpireClaim(claimId) {
    try {
      console.log(`[DEBUG] Iniciando auto-expiración para claim ${claimId}`);

      const claim = await Claim.findOne({ claimId, status: 'active' });

      if (!claim) {
        console.log(`[DEBUG] Claim ${claimId} no encontrado o ya no está activo para auto-expirar`);
        return;
      }

      console.log(`[INFO] Auto-expirando claim ${claimId} - llegó a su tiempo límite`);

      claim.status = 'expired';
      await claim.save();

      // Cancelar recordatorios pendientes ANTES de mover al canal
      console.log(`[DEBUG] Cancelando recordatorios para claim ${claimId} antes de mover a success`);
      await this.cancelReminders(claim);

      // Eliminar del canal de claims y enviar al canal de success con mensaje especial
      await this.removeClaimFromChannel(claim);
      await this.sendClaimToChannel(claim, 'expired');

      console.log(`[INFO] Claim ${claimId} auto-expirado, recordatorios cancelados y movido al canal de success`);
    } catch (error) {
      console.error(`[ERROR] Error auto-expirando claim ${claimId}:`, error);
    }
  }

  /**
   * Enviar recordatorio de claim
   * @param {Object} claim - Objeto del claim
   * @param {string} timeRemaining - Tiempo restante (ej: '10 minutos', '5 minutos')
   */
  static async sendReminder(claimObj, timeRemaining) {
    try {
      // Obtener el claim actualizado de la base de datos
      const claim = await Claim.findOne({ claimId: claimObj.claimId, status: 'active' });

      if (!claim) {
        console.log(`[DEBUG] Claim ${claimObj.claimId} no encontrado o ya no está activo para recordatorio`);
        return;
      }

      // Verificar si el claim ya expiró (prevenir recordatorios después de la expiración)
      const now = new Date();
      if (claim.claimTime <= now) {
        console.log(`[DEBUG] Claim ${claim.claimId} ya expiró, no enviando recordatorio`);
        return;
      }

      // Obtener el cliente de Discord
      const client = global.discordClient;

      if (!client) {
        console.error('[ERROR] Cliente de Discord no disponible para recordatorio');
        return;
      }

      // Obtener canal de recordatorios configurado, si no existe usar el canal original
      let channelId = await ClaimChannelService.getRemindersChannelId(claim.guildId);
      if (!channelId) {
        channelId = claim.channelId; // Fallback al canal original
      }

      const channel = await client.channels.fetch(channelId);
      if (!channel) {
        console.error(`[ERROR] Canal ${channelId} no encontrado para recordatorio`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('⏰ Recordatorio de Claim')
        .setDescription(`¡Tu claim está a punto de expirar!`)
        .setColor('#FF6B35')
        .addFields(
          {
            name: '🎯 Actividad',
            value: claim.contentType,
            inline: true
          },
          {
            name: '🗺️ Mapa',
            value: claim.mapLocation,
            inline: true
          },
          {
            name: '⏱️ Tiempo Restante',
            value: timeRemaining,
            inline: true
          },
          {
            name: '🕐 Hora de Finalización UTC',
            value: `${claim.claimTime.toISOString().replace('T', ' ').substring(0, 19)} UTC`,
            inline: false
          },
          {
            name: '🆔 ID del Claim',
            value: `\`${claim.claimId}\``,
            inline: true
          }
        )
        .setFooter({
          text: 'Avalon Raid Helper - Sistema de Claims',
          iconURL: 'https://i.imgur.com/AfFp7pu.png'
        })
        .setTimestamp();

      const reminderMessage = await channel.send({
        content: `<@${claim.userId}>`,
        embeds: [embed]
      });

      // Marcar recordatorio como enviado y guardar messageId según el tiempo
      if (timeRemaining === '10 minutos') {
        claim.reminders.tenMinutes.sent = true;
        claim.reminders.tenMinutes.messageId = reminderMessage.id;
        console.log(`[INFO] Mensaje de recordatorio 10min guardado: ${reminderMessage.id} para claim ${claim.claimId}`);
      } else if (timeRemaining === '5 minutos') {
        claim.reminders.fiveMinutes.sent = true;
        claim.reminders.fiveMinutes.messageId = reminderMessage.id;
        console.log(`[INFO] Mensaje de recordatorio 5min guardado: ${reminderMessage.id} para claim ${claim.claimId}`);
      }
      await claim.save();

      console.log(`[INFO] Recordatorio de ${timeRemaining} enviado para claim ${claim.claimId}`);
    } catch (error) {
      console.error('[ERROR] Error enviando recordatorio:', error);
    }
  }

  /**
   * Eliminar mensajes de recordatorios de un claim
   * @param {Object} claim - Objeto del claim
   */
  static async deleteReminderMessages(claim) {
    try {
      console.log(`[DEBUG] Eliminando mensajes de recordatorios para claim ${claim.claimId}`);

      const client = global.discordClient;
      if (!client) {
        console.error('[ERROR] Cliente de Discord no disponible para eliminar recordatorios');
        return;
      }

      // Obtener canal de recordatorios configurado
      let remindersChannelId = await ClaimChannelService.getRemindersChannelId(claim.guildId);
      if (!remindersChannelId) {
        remindersChannelId = claim.channelId; // Fallback al canal original
      }

      const channel = await client.channels.fetch(remindersChannelId);
      if (!channel) {
        console.error(`[ERROR] Canal de recordatorios ${remindersChannelId} no encontrado`);
        return;
      }

      // Eliminar mensaje de recordatorio de 10 minutos
      if (claim.reminders.tenMinutes.messageId) {
        try {
          const message10 = await channel.messages.fetch(claim.reminders.tenMinutes.messageId);
          await message10.delete();
          console.log(`[INFO] Mensaje de recordatorio 10min eliminado para claim ${claim.claimId}`);
          claim.reminders.tenMinutes.messageId = null;
        } catch (error) {
          if (error.code === 10008) { // Unknown Message
            console.log(`[DEBUG] Mensaje de recordatorio 10min ya eliminado para claim ${claim.claimId}`);
          } else {
            console.error(`[ERROR] Error eliminando mensaje de recordatorio 10min para claim ${claim.claimId}:`, error);
          }
        }
      }

      // Eliminar mensaje de recordatorio de 5 minutos
      if (claim.reminders.fiveMinutes.messageId) {
        try {
          const message5 = await channel.messages.fetch(claim.reminders.fiveMinutes.messageId);
          await message5.delete();
          console.log(`[INFO] Mensaje de recordatorio 5min eliminado para claim ${claim.claimId}`);
          claim.reminders.fiveMinutes.messageId = null;
        } catch (error) {
          if (error.code === 10008) { // Unknown Message
            console.log(`[DEBUG] Mensaje de recordatorio 5min ya eliminado para claim ${claim.claimId}`);
          } else {
            console.error(`[ERROR] Error eliminando mensaje de recordatorio 5min para claim ${claim.claimId}:`, error);
          }
        }
      }

      // Guardar cambios en la base de datos
      await claim.save();
      console.log(`[DEBUG] Mensajes de recordatorios eliminados para claim ${claim.claimId}`);

    } catch (error) {
      console.error('[ERROR] Error eliminando mensajes de recordatorios:', error);
    }
  }

  /**
   * Cancelar recordatorios de un claim
   * @param {Object} claim - Objeto del claim
   */
  static async cancelReminders(claim) {
    try {
      console.log(`[DEBUG] Cancelando recordatorios para claim ${claim.claimId}`);

      // Cancelar recordatorio de 10 minutos
      if (claim.reminders.tenMinutes.jobId) {
        const cancelled = cancelJob(claim.reminders.tenMinutes.jobId);
        console.log(`[INFO] Recordatorio de 10min ${cancelled ? 'cancelado' : 'no encontrado'} para claim ${claim.claimId}`);
        claim.reminders.tenMinutes.jobId = null;
      }

      // Cancelar recordatorio de 5 minutos
      if (claim.reminders.fiveMinutes.jobId) {
        const cancelled = cancelJob(claim.reminders.fiveMinutes.jobId);
        console.log(`[INFO] Recordatorio de 5min ${cancelled ? 'cancelado' : 'no encontrado'} para claim ${claim.claimId}`);
        claim.reminders.fiveMinutes.jobId = null;
      }

      // Cancelar job de auto-expiración
      if (claim.expirationJobId) {
        const cancelled = cancelJob(claim.expirationJobId);
        console.log(`[INFO] Job de auto-expiración ${cancelled ? 'cancelado' : 'no encontrado'} para claim ${claim.claimId}`);
        claim.expirationJobId = null;
      }

      // Eliminar mensajes de recordatorios del canal
      await this.deleteReminderMessages(claim);

      // Guardar los cambios en la base de datos
      await claim.save();
      console.log(`[DEBUG] IDs de jobs limpiados y mensajes eliminados para claim ${claim.claimId}`);

    } catch (error) {
      console.error('[ERROR] Error cancelando recordatorios:', error);
    }
  }  /**
   * Función de limpieza para eliminar mensajes de recordatorios huérfanos
   * (Para claims existentes que no tienen messageId guardado)
   */
  static async cleanupOrphanReminders() {
    try {
      console.log('[INFO] Iniciando limpieza de recordatorios huérfanos...');

      const activeClaims = await Claim.find({ status: 'active' });

      for (const claim of activeClaims) {
        // Si el claim tiene recordatorios enviados pero no tiene messageId, intentar limpiar
        if ((claim.reminders.tenMinutes.sent && !claim.reminders.tenMinutes.messageId) ||
          (claim.reminders.fiveMinutes.sent && !claim.reminders.fiveMinutes.messageId)) {

          console.log(`[INFO] Limpiando recordatorios huérfanos para claim ${claim.claimId}`);

          // Marcar como no enviados para evitar confusión
          if (claim.reminders.tenMinutes.sent && !claim.reminders.tenMinutes.messageId) {
            claim.reminders.tenMinutes.sent = false;
          }
          if (claim.reminders.fiveMinutes.sent && !claim.reminders.fiveMinutes.messageId) {
            claim.reminders.fiveMinutes.sent = false;
          }

          await claim.save();
        }
      }

      console.log('[INFO] Limpieza de recordatorios huérfanos completada');
    } catch (error) {
      console.error('[ERROR] Error en limpieza de recordatorios huérfanos:', error);
    }
  }

  /**
   * Limpiar claims expirados
   */
  static async cleanupExpiredClaims() {
    try {
      const now = new Date();
      const expiredClaims = await Claim.find({
        status: 'active',
        claimTime: { $lt: now }
      });

      for (const claim of expiredClaims) {
        console.log(`[INFO] Claim ${claim.claimId} expirado - Hora actual: ${now.toISOString()}, Hora de expiración: ${claim.claimTime.toISOString()}`);

        claim.status = 'expired';
        await claim.save();

        // Cancelar recordatorios si existen
        await this.cancelReminders(claim);

        // Eliminar del canal de claims y enviar al canal de success
        await this.removeClaimFromChannel(claim);
        await this.sendClaimToChannel(claim, 'expired');

        console.log(`[INFO] Claim ${claim.claimId} movido a canal de success y recordatorios cancelados`);
      }

      if (expiredClaims.length > 0) {
        console.log(`[INFO] ${expiredClaims.length} claims procesados como expirados`);
      }
    } catch (error) {
      console.error('[ERROR] Error limpiando claims expirados:', error);
    }
  }

  /**
   * Parsear tiempo en formato "1h 30m" a milisegundos
   * @param {string} timeString - Tiempo en formato "1h 30m"
   * @returns {Object} - {duration: milisegundos, text: string formateado}
   */
  static parseTimeString(timeString) {
    const timeRegex = /(?:(\d+)h)?\s*(?:(\d+)m)?/i;
    const match = timeString.match(timeRegex);

    if (!match) {
      throw new Error('Formato de tiempo inválido. Use formato como "1h 30m" o "45m"');
    }

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;

    if (hours === 0 && minutes === 0) {
      throw new Error('Debe especificar al menos 1 minuto');
    }

    if (hours > 72) {
      throw new Error('El tiempo máximo es de 72 horas');
    }

    const duration = (hours * 60 + minutes) * 60 * 1000; // Convertir a milisegundos
    const text = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return { duration, text };
  }

  /**
   * Eliminar claim del canal de claims activos
   * @param {Object} claim - El objeto del claim
   */
  static async removeClaimFromChannel(claim) {
    try {
      if (!claim.messageId) {
        console.log(`[DEBUG] Claim ${claim.claimId} no tiene messageId, no se puede eliminar`);
        return;
      }

      const claimsChannelId = await ClaimChannelService.getClaimsChannelId(claim.guildId);
      if (!claimsChannelId) {
        console.log(`[DEBUG] No hay canal de claims configurado para guild ${claim.guildId}`);
        return;
      }

      const client = global.discordClient;
      if (!client) {
        console.error('[ERROR] Cliente de Discord no disponible');
        return;
      }

      const channel = await client.channels.fetch(claimsChannelId);
      if (!channel) {
        console.error(`[ERROR] Canal de claims no encontrado: ${claimsChannelId}`);
        return;
      }

      try {
        const message = await channel.messages.fetch(claim.messageId);
        await message.delete();
        console.log(`[INFO] Mensaje del claim ${claim.claimId} eliminado del canal de claims`);

        // Limpiar messageId del claim
        claim.messageId = null;
        await claim.save();
      } catch (error) {
        if (error.code === 10008) { // Unknown Message
          console.log(`[DEBUG] Mensaje ya eliminado para claim ${claim.claimId}`);
        } else {
          console.error(`[ERROR] Error eliminando mensaje del claim ${claim.claimId}:`, error);
        }
      }

    } catch (error) {
      console.error('[ERROR] Error eliminando claim del canal:', error);
    }
  }

  /**
   * Enviar claim al canal configurado
   * @param {Object} claim - Objeto del claim
   * @param {string} action - Acción realizada (created, completed, cancelled, expired)
   */
  static async sendClaimToChannel(claim, action) {
    try {
      console.log(`[DEBUG] Intentando enviar claim ${claim.claimId} con acción ${action}`);

      // Determinar el canal según la acción
      let channelId;
      switch (action) {
        case 'created':
          channelId = await ClaimChannelService.getClaimsChannelId(claim.guildId);
          console.log(`[DEBUG] Canal de claims para guild ${claim.guildId}: ${channelId}`);
          break;
        case 'completed':
        case 'expired':
          channelId = await ClaimChannelService.getSuccessChannelId(claim.guildId);
          console.log(`[DEBUG] Canal de success para guild ${claim.guildId}: ${channelId}`);
          break;
        case 'cancelled':
          channelId = await ClaimChannelService.getClosedChannelId(claim.guildId);
          console.log(`[DEBUG] Canal de closed para guild ${claim.guildId}: ${channelId}`);
          break;
        default:
          channelId = await ClaimChannelService.getClaimsChannelId(claim.guildId);
          console.log(`[DEBUG] Canal default para guild ${claim.guildId}: ${channelId}`);
      }
      if (!channelId) {
        console.log(`[WARNING] No hay canal configurado para acción '${action}' en guild ${claim.guildId}`);
        return; // No hay canal configurado
      }

      console.log(`[DEBUG] Canal encontrado: ${channelId} para acción ${action}`);

      // Obtener el cliente de Discord
      const client = global.discordClient;
      console.log(`[DEBUG] Cliente de Discord disponible: ${!!client}`);

      if (!client) {
        console.error('[ERROR] Cliente de Discord no disponible para enviar claim al canal');
        return;
      }

      console.log(`[DEBUG] Intentando obtener canal ${channelId}...`);
      const channel = await client.channels.fetch(channelId);
      if (!channel) {
        console.error(`[ERROR] Canal ${channelId} no encontrado`);
        return;
      }

      console.log(`[DEBUG] Canal obtenido exitosamente: ${channel.name} (${channel.type})`);
      console.log(`[DEBUG] Creando embed para acción: ${action}`);

      let embed;

      switch (action) {
        case 'created':
          embed = new EmbedBuilder()
            .setTitle('🎯 Nuevo Claim Creado')
            .setDescription(`**${claim.contentType}** en **${claim.mapLocation}** ha sido reclamado`)
            .setColor('#00D166')
            .addFields(
              {
                name: '👤 Usuario',
                value: `<@${claim.userId}>`,
                inline: true
              },
              {
                name: '🎯 Actividad',
                value: claim.contentType,
                inline: true
              },
              {
                name: '🗺️ Mapa',
                value: claim.mapLocation,
                inline: true
              },
              {
                name: '⏱️ Duración',
                value: claim.durationText,
                inline: true
              },
              {
                name: '🆔 ID del Claim',
                value: `\`${claim.claimId}\``,
                inline: true
              },
              {
                name: '⏰ Tiempo Restante',
                value: `<t:${Math.floor(claim.claimTime.getTime() / 1000)}:R>`,
                inline: true
              },
              {
                name: '🕐 Hora de Finalización UTC',
                value: `${claim.claimTime.toISOString().replace('T', ' ').substring(0, 19)} UTC`,
                inline: false
              }
            );
          break;

        case 'completed':
          embed = new EmbedBuilder()
            .setTitle('✅ Claim Completado Manualmente')
            .setDescription(`**${claim.contentType}** en **${claim.mapLocation}** ha sido completado por el usuario`)
            .setColor('#00D166')
            .addFields(
              {
                name: '👤 Usuario',
                value: `<@${claim.userId}>`,
                inline: true
              },
              {
                name: '🎯 Actividad',
                value: claim.contentType,
                inline: true
              },
              {
                name: '🗺️ Mapa',
                value: claim.mapLocation,
                inline: true
              },
              {
                name: '🆔 ID del Claim',
                value: `\`${claim.claimId}\``,
                inline: true
              },
              {
                name: '📊 Estado',
                value: 'Completado',
                inline: true
              }
            );
          break;

        case 'expired':
          embed = new EmbedBuilder()
            .setTitle('🌟 ¡Es Hora de Partir a Este Claim!')
            .setDescription(`**${claim.contentType}** en **${claim.mapLocation}** ha llegado a su momento perfecto`)
            .setColor('#FFD700')
            .addFields(
              {
                name: '⚔️ Aventurero',
                value: `<@${claim.userId}>`,
                inline: true
              },
              {
                name: '🎯 Actividad',
                value: claim.contentType,
                inline: true
              },
              {
                name: '🗺️ Ubicación',
                value: claim.mapLocation,
                inline: true
              },
              {
                name: '🆔 ID del Claim',
                value: `\`${claim.claimId}\``,
                inline: true
              },
              {
                name: '✨ Estado',
                value: 'Listo para la aventura',
                inline: true
              },
              {
                name: '🕐 Hora de Finalización UTC',
                value: `${claim.claimTime.toISOString().replace('T', ' ').substring(0, 19)} UTC`,
                inline: true
              },
              {
                name: '🚀 Mensaje de Éxito',
                value: '¡El tiempo de espera ha terminado! Es el momento perfecto para embarcarse en esta aventura. ¡Que tengas una excelente partida y mucha suerte!',
                inline: false
              }
            );

          if (claim.description) {
            embed.addFields({
              name: '📝 Notas del Aventurero',
              value: claim.description,
              inline: false
            });
          }
          break;

        case 'cancelled':
          embed = new EmbedBuilder()
            .setTitle('❌ Claim Cancelado')
            .setDescription(`**${claim.contentType}** en **${claim.mapLocation}** ha sido cancelado manualmente`)
            .setColor('#FF6B35')
            .addFields(
              {
                name: '👤 Usuario',
                value: `<@${claim.userId}>`,
                inline: true
              },
              {
                name: '🎯 Actividad',
                value: claim.contentType,
                inline: true
              },
              {
                name: '🗺️ Mapa',
                value: claim.mapLocation,
                inline: true
              },
              {
                name: '🆔 ID del Claim',
                value: `\`${claim.claimId}\``,
                inline: true
              },
              {
                name: '📊 Estado',
                value: 'Cancelado',
                inline: true
              }
            );
          break;
      }

      if (claim.description && action === 'created') {
        embed.addFields({
          name: '📝 Descripción',
          value: claim.description,
          inline: false
        });
      }

      embed.setFooter({
        text: 'Avalon Raid Helper - Sistema de Claims',
        iconURL: 'https://i.imgur.com/AfFp7pu.png'
      }).setTimestamp();

      console.log(`[DEBUG] Enviando embed al canal ${channel.name}...`);
      const message = await channel.send({ embeds: [embed] });
      console.log(`[SUCCESS] Mensaje enviado exitosamente con ID: ${message.id}`);

      console.log(`[INFO] Claim ${action} enviado al canal: ${claim.claimId}`);

      // Guardar messageId solo para claims creados (para poder eliminarlos después)
      if (action === 'created') {
        claim.messageId = message.id;
        await claim.save();
        console.log(`[DEBUG] MessageId guardado para claim ${claim.claimId}: ${message.id}`);
      }

    } catch (error) {
      console.error('[ERROR] Error enviando claim al canal:', error);
    }
  }
}

// Ejecutar limpieza de respaldo cada 30 minutos para claims huérfanos
setInterval(() => {
  console.log('[INFO] Ejecutando limpieza de respaldo para claims huérfanos');
  ClaimService.cleanupExpiredClaims();
}, 30 * 60 * 1000);

module.exports = ClaimService;
