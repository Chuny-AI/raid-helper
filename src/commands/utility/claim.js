const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ClaimService = require('../../services/claimService');
const { checkPremiumAccessWithOwnerBypass } = require('../../middleware/roleCheck');
const { createErrorEmbed, createSuccessEmbed } = require('../../utils/errorEmbeds');

/**
 * Comando para crear claims de actividades de Albion Online
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Crear un claim para apartar una actividad o recurso de Albion Online')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Crear un nuevo claim')
        .addStringOption(option =>
          option
            .setName('actividad')
            .setDescription('Tipo de actividad a reclamar (ej: Orbe de Poder, Dungeon T8, etc.)')
            .setRequired(true)
            .setMaxLength(100)
        )
        .addStringOption(option =>
          option
            .setName('mapa')
            .setDescription('Mapa donde se realizará la actividad (ej: Caerleon, Thetford, etc.)')
            .setRequired(true)
            .setMaxLength(100)
        )
        .addStringOption(option =>
          option
            .setName('tiempo')
            .setDescription('Tiempo hasta completar (ej: 1h 30m, 45m)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('descripcion')
            .setDescription('Descripción adicional del claim (opcional)')
            .setRequired(false)
            .setMaxLength(500)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('complete')
        .setDescription('Marcar un claim como completado')
        .addStringOption(option =>
          option
            .setName('claim_id')
            .setDescription('ID del claim a completar')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cancel')
        .setDescription('Cancelar un claim')
        .addStringOption(option =>
          option
            .setName('claim_id')
            .setDescription('ID del claim a cancelar')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    console.log('[CLAIM] Comando claim ejecutado');

    // Verificar estado de la interacción inmediatamente
    if (interaction.replied || interaction.deferred) {
      console.log('[WARNING] Interacción ya procesada, saltando...');
      return;
    }

    let isDeferred = false;

    try {
      // Defer reply inmediatamente en modo efímero usando flags
      try {
        await interaction.deferReply({ flags: 64 }); // 64 = EPHEMERAL
        isDeferred = true;
        console.log('[CLAIM] DeferReply exitoso');
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

        // Para otros errores, intentar respuesta directa
        isDeferred = false;
      }

      // Verificar acceso premium ya se hizo en commandFilter
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'create':
          await this.handleCreateClaim(interaction);
          break;
        case 'complete':
          await this.handleCompleteClaim(interaction);
          break;
        case 'cancel':
          await this.handleCancelClaim(interaction);
          break;
      }
    } catch (error) {
      console.error('[ERROR] Error en comando claim:', error);

      // Si la interacción ya fue procesada, no intentar responder
      if (interaction.replied || interaction.deferred) {
        console.log('[WARNING] No se puede responder, interacción ya procesada');
        return;
      }

      const errorEmbed = createErrorEmbed(
        'Error del Sistema',
        'Hubo un error ejecutando el comando de claim.',
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
          await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
      } catch (replyError) {
        console.error('[ERROR] Error enviando respuesta de error:', replyError);
        // No hacer nada más si no se puede responder
      }
    }
  },

  async handleCreateClaim(interaction) {
    const contentType = interaction.options.getString('actividad');
    const mapLocation = interaction.options.getString('mapa');
    const timeString = interaction.options.getString('tiempo');
    const description = interaction.options.getString('descripcion');

    try {
      // Validar que todos los canales necesarios estén configurados
      const ClaimChannelService = require('../../services/claimChannelService');
      const config = await ClaimChannelService.getChannelConfig(interaction.guild.id);

      // Verificar si todos los canales están configurados
      const missingChannels = [];
      if (!config || !config.claimsChannelId) missingChannels.push('**Canal de Claims** (`/claim-config set claims`)');
      if (!config || !config.remindersChannelId) missingChannels.push('**Canal de Recordatorios** (`/claim-config set reminders`)');
      if (!config || !config.successChannelId) missingChannels.push('**Canal de Claims Exitosos** (`/claim-config set success`)');
      if (!config || !config.closedChannelId) missingChannels.push('**Canal de Claims Cerrados** (`/claim-config set closed`)');

      if (missingChannels.length > 0) {
        const errorEmbed = createErrorEmbed(
          'Configuración Incompleta',
          'No se pueden crear claims porque faltan canales por configurar.',
          [{
            name: '📋 Canales Faltantes',
            value: missingChannels.join('\n'),
            inline: false
          }, {
            name: '💡 Solución',
            value: 'Un administrador debe configurar todos los canales listados arriba antes de poder crear claims.',
            inline: false
          }]
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Parsear tiempo
      const { duration, text: durationText } = ClaimService.parseTimeString(timeString);

      // Calcular tiempo de finalización
      const claimTime = new Date(Date.now() + duration);

      // Crear claim
      const claimData = {
        userId: interaction.user.id,
        username: interaction.user.displayName || interaction.user.username,
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        contentType,
        mapLocation,
        duration,
        durationText,
        claimTime,
        description
      };

      const claim = await ClaimService.createClaim(claimData);

      // Crear embed de confirmación
      const embed = new EmbedBuilder()
        .setTitle('✅ Claim Creado Exitosamente')
        .setDescription(`¡Has reclamado **${claim.contentType}** en **${claim.mapLocation}**!`)
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
            value: durationText,
            inline: true
          },
          {
            name: '🆔 ID del Claim',
            value: `\`${claim.claimId}\``,
            inline: true
          },
          {
            name: '⏰ Tiempo Restante',
            value: `<t:${Math.floor(claimTime.getTime() / 1000)}:R>`,
            inline: true
          },
          {
            name: '🕐 Hora de Finalización UTC',
            value: `${claimTime.toISOString().replace('T', ' ').substring(0, 19)} UTC`,
            inline: false
          }
        )
        .setFooter({
          text: 'Avalon Raid Helper - Sistema de Claims',
          iconURL: 'https://i.imgur.com/AfFp7pu.png'
        })
        .setTimestamp();

      if (description) {
        embed.addFields({
          name: '📝 Descripción',
          value: description,
          inline: false
        });
      }

      embed.addFields({
        name: '💡 Información',
        value: '• Recibirás recordatorios a los 10min y 5min antes\n• Usa `/claim complete ' + claim.claimId + '` para completar\n• Usa `/claim cancel ' + claim.claimId + '` para cancelar',
        inline: false
      });

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Creando Claim',
        `Error al crear el claim: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Verifica que el formato de tiempo sea correcto (ej: "1h 30m" o "45m").',
          inline: false
        }]
      );
      await interaction.editReply({
        embeds: [errorEmbed]
      });
    }
  },

  async handleCompleteClaim(interaction) {
    const claimId = interaction.options.getString('claim_id').toUpperCase();

    try {
      const claim = await ClaimService.completeClaim(claimId, interaction);

      const embed = new EmbedBuilder()
        .setTitle('✅ Claim Completado')
        .setDescription(`¡El claim de **${claim.getContentDisplay()}** ha sido completado!`)
        .setColor('#00D166')
        .addFields(
          {
            name: '🆔 ID del Claim',
            value: `\`${claim.claimId}\``,
            inline: true
          },
          {
            name: '👤 Dueño del Claim',
            value: `<@${claim.userId}>`,
            inline: true
          },
          {
            name: '✅ Completado por',
            value: `<@${interaction.user.id}>`,
            inline: true
          },
          {
            name: '📊 Estado',
            value: 'Completado',
            inline: false
          }
        )
        .setFooter({
          text: 'Avalon Raid Helper - Sistema de Claims',
          iconURL: 'https://i.imgur.com/AfFp7pu.png'
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Completando Claim',
        `Error al completar el claim: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Verifica que el ID del claim sea correcto y que sea tuyo.',
          inline: false
        }]
      );
      await interaction.editReply({
        embeds: [errorEmbed]
      });
    }
  },

  async handleCancelClaim(interaction) {
    const claimId = interaction.options.getString('claim_id').toUpperCase();

    try {
      const claim = await ClaimService.cancelClaim(claimId, interaction);

      const embed = new EmbedBuilder()
        .setTitle('❌ Claim Cancelado')
        .setDescription(`El claim de **${claim.getContentDisplay()}** ha sido cancelado.`)
        .setColor('#FF6B35')
        .addFields(
          {
            name: '🆔 ID del Claim',
            value: `\`${claim.claimId}\``,
            inline: true
          },
          {
            name: '👤 Dueño del Claim',
            value: `<@${claim.userId}>`,
            inline: true
          },
          {
            name: '❌ Cancelado por',
            value: `<@${interaction.user.id}>`,
            inline: true
          },
          {
            name: '📊 Estado',
            value: 'Cancelado',
            inline: false
          }
        )
        .setFooter({
          text: 'Avalon Raid Helper - Sistema de Claims',
          iconURL: 'https://i.imgur.com/AfFp7pu.png'
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error Cancelando Claim',
        `Error al cancelar el claim: ${error.message}`,
        [{
          name: 'Solución',
          value: 'Verifica que el ID del claim sea correcto y que sea tuyo.',
          inline: false
        }]
      );
      await interaction.editReply({
        embeds: [errorEmbed]
      });
    }
  }
};
