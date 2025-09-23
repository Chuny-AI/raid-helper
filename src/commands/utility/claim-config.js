const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, InteractionResponseType } = require('discord.js');
const ClaimChannelService = require('../../services/claimChannelService');
const { checkPremiumAccessWithOwnerBypass } = require('../../middleware/roleCheck');
const { checkOwner } = require('../../middleware/ownerCheck');
const { getAuthorizedRoles } = require('../../services/authorizedRoleService');
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed } = require('../../utils/errorEmbeds');

/**
 * Verificar si el usuario puede configurar claims
 * @param {Object} interaction - La interacción de Discord
 * @returns {Promise<boolean>} - true si puede configurar
 */
async function canConfigureClaims(interaction) {
  try {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (interaction.member && interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }

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
    console.error('[ERROR] Error verificando permisos de configuración:', error);
    return false;
  }
}

/**
 * Comando para configurar canales de claims
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim-config')
    .setDescription('Configurar canales para el sistema de claims')
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-claims-channel')
        .setDescription('Configurar el canal donde aparecerán todos los claims')
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('Canal donde aparecerán los claims')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-reminders-channel')
        .setDescription('Configurar el canal donde aparecerán los recordatorios de claims')
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('Canal donde aparecerán los recordatorios')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove-claims-channel')
        .setDescription('Eliminar la configuración del canal de claims')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove-reminders-channel')
        .setDescription('Eliminar la configuración del canal de recordatorios')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Ver la configuración actual de canales')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-success-channel')
        .setDescription('Establecer el canal donde aparecerán los claims que llegaron a su tiempo máximo')
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('El canal de texto para claims exitosos')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-closed-channel')
        .setDescription('Establecer el canal donde aparecerán los claims cancelados manualmente')
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('El canal de texto para claims cerrados')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove-success-channel')
        .setDescription('Eliminar configuración del canal de claims exitosos')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove-closed-channel')
        .setDescription('Eliminar configuración del canal de claims cerrados')
    ),

  async execute(interaction) {
    console.log('[CLAIM-CONFIG] Comando claim-config ejecutado');

    if (interaction.replied || interaction.deferred) {
      console.log('[WARNING] Interacción ya procesada, saltando...');
      return;
    }

    const timeElapsed = Date.now() - interaction.createdTimestamp;
    if (timeElapsed > 2500) {
      console.log('[WARNING] Interacción demasiado antigua:', timeElapsed, 'ms');
      try {
        await interaction.reply({
          content: '⚠️ La interacción tardó demasiado en procesarse. Intenta de nuevo.',
          flags: 64
        });
      } catch (error) {
        console.log('[WARNING] No se pudo responder a interacción expirada');
      }
      return;
    }

    let isDeferred = false;

    try {
      try {
        await interaction.deferReply({ flags: 64 });
        isDeferred = true;
        console.log('[CLAIM-CONFIG] DeferReply exitoso');
      } catch (deferError) {
        console.error('[ERROR] Error haciendo deferReply:', deferError);

        if (deferError.code === 10062) { // Unknown interaction
          console.log('[WARNING] Interacción expirada o inválida');
          return;
        }

        if (deferError.code === 40060) { // Interaction already acknowledged
          console.log('[WARNING] Interacción ya procesada');
          return;
        }

        isDeferred = false;
      }

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

      const canConfigure = await canConfigureClaims(interaction);
      if (!canConfigure) {
        const errorEmbed = createErrorEmbed(
          'Sin Permisos',
          'Solo los administradores del servidor o usuarios con roles autorizados pueden configurar los canales de claims.',
          [{
            name: '💡 Solución',
            value: 'Pide a un administrador que te agregue un rol autorizado con `/roles add`.',
            inline: false
          }]
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const { isOwner } = require('../../middleware/ownerCheck');
      const owner = await isOwner(interaction);
      if (!owner) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          const errorEmbed = createErrorEmbed(
            'Sin Permisos',
            'Solo el propietario del bot y los administradores pueden configurar canales de claims.',
            []
          );
          await interaction.editReply({ embeds: [errorEmbed] });
          return;
        }
      }

      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'set-claims-channel':
          await this.handleSetClaimsChannel(interaction);
          break;
        case 'set-reminders-channel':
          await this.handleSetRemindersChannel(interaction);
          break;
        case 'remove-claims-channel':
          await this.handleRemoveClaimsChannel(interaction);
          break;
        case 'remove-reminders-channel':
          await this.handleRemoveRemindersChannel(interaction);
          break;
        case 'status':
          await this.handleStatus(interaction);
          break;
        case 'set-success-channel':
          await this.handleSetSuccessChannel(interaction);
          break;
        case 'set-closed-channel':
          await this.handleSetClosedChannel(interaction);
          break;
        case 'remove-success-channel':
          await this.handleRemoveSuccessChannel(interaction);
          break;
        case 'remove-closed-channel':
          await this.handleRemoveClosedChannel(interaction);
          break;
      }
    } catch (error) {
      console.error('[ERROR] Error en comando claim-config:', error);

      if (interaction.replied || interaction.deferred) {
        console.log('[WARNING] No se puede responder, interacción ya procesada');
        return;
      }

      const errorEmbed = createErrorEmbed(
        'Error del Sistema',
        'Hubo un error ejecutando el comando de configuración de claims.',
        [{
          name: 'Solución',
          value: 'Intenta ejecutar el comando de nuevo. Si el problema persiste, contacta al soporte.',
          inline: false
        }]
      );

      try {
        if (isDeferred && !interaction.replied) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyError) {
        console.error('[ERROR] Error enviando respuesta de error:', replyError);
      }
    }
  },

  async handleSetClaimsChannel(interaction) {
    const channel = interaction.options.getChannel('canal');

    try {
      if (channel.type !== 0) { // 0 = GUILD_TEXT
        const errorEmbed = createErrorEmbed(
          'Tipo de Canal Inválido',
          'El canal seleccionado debe ser un canal de texto.',
          [{
            name: 'Solución',
            value: 'Selecciona un canal de texto válido.',
            inline: false
          }]
        );
        return await interaction.editReply({
          embeds: [errorEmbed]
        });
      }

      const botPermissions = channel.permissionsFor(interaction.guild.members.me);
      if (!botPermissions.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        const errorEmbed = createErrorEmbed(
          'Permisos Insuficientes',
          'El bot no tiene permisos suficientes en este canal.',
          [{
            name: 'Permisos Requeridos',
            value: '• Ver Canal\n• Enviar Mensajes\n• Insertar Enlaces',
            inline: false
          }]
        );
        return await interaction.editReply({
          embeds: [errorEmbed]
        });
      }

      await ClaimChannelService.setClaimsChannel(
        interaction.guild.id,
        interaction.guild.name,
        channel.id,
        channel.name,
        interaction.user.id
      );

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Canal de Claims Configurado')
        .setDescription(`El canal de claims ha sido configurado exitosamente.`)
        .setColor('#00D166')
        .addFields({
          name: '📍 Canal Configurado',
          value: `${channel}`,
          inline: false
        })
        .setFooter({
          text: 'Chuny BOT - Configuración',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Configurando Canal',
        `Error al configurar el canal de claims: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Verifica que el canal existe y que el bot tiene permisos.',
          inline: false
        }]
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleSetRemindersChannel(interaction) {
    const channel = interaction.options.getChannel('canal');

    try {
      if (channel.type !== 0) { // 0 = GUILD_TEXT
        const errorEmbed = createErrorEmbed(
          'Tipo de Canal Inválido',
          'El canal seleccionado debe ser un canal de texto.',
          [{
            name: 'Solución',
            value: 'Selecciona un canal de texto válido.',
            inline: false
          }]
        );
        return await interaction.editReply({
          embeds: [errorEmbed]
        });
      }

      const botPermissions = channel.permissionsFor(interaction.guild.members.me);
      if (!botPermissions.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        const errorEmbed = createErrorEmbed(
          'Permisos Insuficientes',
          'El bot no tiene permisos suficientes en este canal.',
          [{
            name: 'Permisos Requeridos',
            value: '• Ver Canal\n• Enviar Mensajes\n• Insertar Enlaces',
            inline: false
          }]
        );
        return await interaction.editReply({
          embeds: [errorEmbed]
        });
      }

      await ClaimChannelService.setRemindersChannel(
        interaction.guild.id,
        interaction.guild.name,
        channel.id,
        channel.name,
        interaction.user.id
      );

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Canal de Recordatorios Configurado')
        .setDescription(`El canal de recordatorios ha sido configurado exitosamente.`)
        .setColor('#00D166')
        .addFields({
          name: '📍 Canal Configurado',
          value: `${channel}`,
          inline: false
        })
        .setFooter({
          text: 'Chuny BOT - Configuración',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Configurando Canal',
        `Error al configurar el canal de recordatorios: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Verifica que el canal existe y que el bot tiene permisos.',
          inline: false
        }]
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleRemoveClaimsChannel(interaction) {

    try {
      await ClaimChannelService.removeClaimsChannel(interaction.guild.id, interaction.user.id);

      const successEmbed = new EmbedBuilder()
        .setTitle('🗑️ Configuración Eliminada')
        .setDescription('La configuración del canal de claims ha sido eliminada exitosamente.')
        .setColor('#FF6B35')
        .addFields({
          name: '� Cambio Realizado',
          value: 'Canal de claims desconfigurado',
          inline: false
        })
        .setFooter({
          text: 'Chuny BOT - Configuración',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Eliminando Configuración',
        `Error al eliminar la configuración: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Verifica que haya una configuración previa para eliminar.',
          inline: false
        }]
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleRemoveRemindersChannel(interaction) {

    try {
      await ClaimChannelService.removeRemindersChannel(interaction.guild.id, interaction.user.id);

      const successEmbed = new EmbedBuilder()
        .setTitle('🗑️ Configuración Eliminada')
        .setDescription('La configuración del canal de recordatorios ha sido eliminada exitosamente.')
        .setColor('#FF6B35')
        .addFields({
          name: '� Cambio Realizado',
          value: 'Canal de recordatorios desconfigurado',
          inline: false
        })
        .setFooter({
          text: 'Chuny BOT - Configuración',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Eliminando Configuración',
        `Error al eliminar la configuración: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Verifica que haya una configuración previa para eliminar.',
          inline: false
        }]
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleStatus(interaction) {

    try {
      const config = await ClaimChannelService.getChannelConfig(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle('📊 Estado de Configuración de Claims')
        .setColor('#4A90E2')
        .setFooter({
          text: 'Chuny BOT - Sistema de Claims',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();

      if (!config) {
        embed.setDescription('No hay configuración de canales para este servidor.');
        embed.addFields({
          name: '💡 Para Configurar',
          value: '• `/claim-config set-claims-channel` - Configurar canal de claims\n• `/claim-config set-reminders-channel` - Configurar canal de recordatorios',
          inline: false
        });
      } else {
        const fields = [];

        if (config.claimsChannelId) {
          fields.push({
            name: '📋 Canal de Claims',
            value: `<#${config.claimsChannelId}>`,
            inline: true
          });
        } else {
          fields.push({
            name: '📋 Canal de Claims',
            value: 'No configurado',
            inline: true
          });
        }

        if (config.remindersChannelId) {
          fields.push({
            name: '⏰ Canal de Recordatorios',
            value: `<#${config.remindersChannelId}>`,
            inline: true
          });
        } else {
          fields.push({
            name: '⏰ Canal de Recordatorios',
            value: 'No configurado',
            inline: true
          });
        }

        if (config.successChannelId) {
          fields.push({
            name: '✅ Canal de Claims Exitosos',
            value: `<#${config.successChannelId}>`,
            inline: true
          });
        } else {
          fields.push({
            name: '✅ Canal de Claims Exitosos',
            value: 'No configurado',
            inline: true
          });
        }

        if (config.closedChannelId) {
          fields.push({
            name: '❌ Canal de Claims Cerrados',
            value: `<#${config.closedChannelId}>`,
            inline: true
          });
        } else {
          fields.push({
            name: '❌ Canal de Claims Cerrados',
            value: 'No configurado',
            inline: true
          });
        }

        fields.push({
          name: '👤 Configurado por',
          value: `<@${config.configuredBy}>`,
          inline: true
        });

        fields.push({
          name: '📅 Configurado el',
          value: `<t:${Math.floor(config.configuredAt.getTime() / 1000)}:F>`,
          inline: false
        });

        if (config.updatedBy && config.updatedAt) {
          fields.push({
            name: '🔄 Última actualización',
            value: `<@${config.updatedBy}> - <t:${Math.floor(config.updatedAt.getTime() / 1000)}:R>`,
            inline: false
          });
        }

        embed.addFields(...fields);
        embed.setDescription('Configuración actual de canales de claims:');
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Obteniendo Estado',
        `Error al obtener el estado de configuración: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Intenta ejecutar el comando de nuevo.',
          inline: false
        }]
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  /**
   * Manejar configuración del canal de claims exitosos
   */
  async handleSetSuccessChannel(interaction) {
    try {
      const channel = interaction.options.getChannel('canal');
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      if (channel.type !== 0) { // 0 = GUILD_TEXT
        const errorEmbed = createErrorEmbed(
          'Tipo de Canal Inválido',
          'El canal debe ser un canal de texto.',
          [{
            name: 'Solución',
            value: 'Selecciona un canal de texto válido.',
            inline: false
          }]
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      await ClaimChannelService.setSuccessChannel(
        guildId,
        interaction.guild.name,
        channel.id,
        channel.name,
        userId
      );

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Canal de Claims Exitosos Configurado')
        .setDescription(`El canal de claims exitosos ha sido configurado exitosamente.`)
        .setColor('#00D166')
        .addFields({
          name: '📍 Canal Configurado',
          value: `${channel}`,
          inline: false
        })
        .setFooter({
          text: 'Chuny BOT - Configuración',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Configurando Canal',
        `Error al configurar el canal de claims exitosos: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Verifica que el bot tenga permisos para ver y escribir en el canal.',
          inline: false
        }]
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  /**
   * Manejar configuración del canal de claims cerrados
   */
  async handleSetClosedChannel(interaction) {
    try {
      const channel = interaction.options.getChannel('canal');
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      if (channel.type !== 0) { // 0 = GUILD_TEXT
        const errorEmbed = createErrorEmbed(
          'Tipo de Canal Inválido',
          'El canal debe ser un canal de texto.',
          [{
            name: 'Solución',
            value: 'Selecciona un canal de texto válido.',
            inline: false
          }]
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      await ClaimChannelService.setClosedChannel(
        guildId,
        interaction.guild.name,
        channel.id,
        channel.name,
        userId
      );

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Canal de Claims Cerrados Configurado')
        .setDescription(`El canal de claims cerrados ha sido configurado exitosamente.`)
        .setColor('#00D166')
        .addFields({
          name: '📍 Canal Configurado',
          value: `${channel}`,
          inline: false
        })
        .setFooter({
          text: 'Chuny BOT - Configuración',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Configurando Canal',
        `Error al configurar el canal de claims cerrados: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Verifica que el bot tenga permisos para ver y escribir en el canal.',
          inline: false
        }]
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  /**
   * Manejar eliminación del canal de claims exitosos
   */
  async handleRemoveSuccessChannel(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      await ClaimChannelService.removeSuccessChannel(guildId, userId);

      const successEmbed = new EmbedBuilder()
        .setTitle('🗑️ Configuración Eliminada')
        .setDescription('La configuración del canal de claims exitosos ha sido eliminada exitosamente.')
        .setColor('#FF6B35')
        .addFields({
          name: '� Cambio Realizado',
          value: 'Canal de claims exitosos desconfigurado',
          inline: false
        })
        .setFooter({
          text: 'Chuny BOT - Configuración',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Eliminando Configuración',
        `Error al eliminar la configuración del canal de claims exitosos: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Intenta ejecutar el comando de nuevo.',
          inline: false
        }]
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  /**
   * Manejar eliminación del canal de claims cerrados
   */
  async handleRemoveClosedChannel(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      await ClaimChannelService.removeClosedChannel(guildId, userId);

      const successEmbed = new EmbedBuilder()
        .setTitle('🗑️ Configuración Eliminada')
        .setDescription('La configuración del canal de claims cerrados ha sido eliminada exitosamente.')
        .setColor('#FF6B35')
        .addFields({
          name: '� Cambio Realizado',
          value: 'Canal de claims cerrados desconfigurado',
          inline: false
        })
        .setFooter({
          text: 'Chuny BOT - Configuración',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Eliminando Configuración',
        `Error al eliminar la configuración del canal de claims cerrados: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Intenta ejecutar el comando de nuevo.',
          inline: false
        }]
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};
