const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const ClaimService = require('../../services/claimService');
const { createErrorEmbed, createSuccessEmbed } = require('../../utils/errorEmbeds');
const { checkAuthorizedRole } = require('../../middleware/roleCheck');
const { isMemberInGuildRoles } = require('../../services/guildRoleService');

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
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Configura automáticamente la categoría y canales para el sistema de claims')
    ),

  async execute(interaction) {
    console.log('[CLAIM] Comando claim ejecutado');

    if (interaction.replied || interaction.deferred) {
      console.log('[WARNING] Interacción ya procesada, saltando...');
      return;
    }

    let isDeferred = false;

    try {
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

        isDeferred = false;
      }

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
        case 'setup':
          await this.handleSetupClaims(interaction);
          break;
      }
    } catch (error) {
      console.error('[ERROR] Error en comando claim:', error);

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
      }
    }
  },

  async handleCreateClaim(interaction) {
    const contentType = interaction.options.getString('actividad');
    const mapLocation = interaction.options.getString('mapa');
    const timeString = interaction.options.getString('tiempo');
    const description = interaction.options.getString('descripcion');

    try {
      const ClaimChannelService = require('../../services/claimChannelService');
      const config = await ClaimChannelService.getChannelConfig(interaction.guild.id);

      const missingChannels = [];
      if (!config || !config.claimsChannelId) missingChannels.push('**Canal de Claims** (usa `/claim setup`)');
      if (!config || !config.remindersChannelId) missingChannels.push('**Canal de Recordatorios** (usa `/claim setup`)');
      if (!config || !config.successChannelId) missingChannels.push('**Canal de Claims Completados** (usa `/claim setup`)');
      if (!config || !config.closedChannelId) missingChannels.push('**Canal de Claims Cancelados** (usa `/claim setup`)');

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
          value: 'Ejecuta `/claim setup` para crear y asignar los canales automáticamente.',
          inline: false
        }]
      );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const { duration, text: durationText } = ClaimService.parseTimeString(timeString);

      const claimTime = new Date(Date.now() + duration);

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
          text: 'Chuny BOT - Sistema de Claims',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
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
      // Restricción: solo administradores o usuarios con roles de gremio pueden completar claims de otros usuarios
      const claimPreview = await ClaimService.getClaimById?.(claimId) || null;
      const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
      const hasGuildRole = await isMemberInGuildRoles(interaction.member);
      if (claimPreview && !isAdmin && !hasGuildRole && claimPreview.userId !== interaction.user.id) {
        const embed = createErrorEmbed(
          'Acceso denegado',
          'Solo puedes completar claims que hayas creado tú. Los administradores y usuarios con roles de gremio pueden completar cualquier claim.'
        );
        return await interaction.editReply({ embeds: [embed] });
      }

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
          text: 'Chuny BOT - Sistema de Claims',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
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
      // Restricción: solo administradores o usuarios con roles de gremio pueden cancelar claims de otros usuarios
      const claimPreview = await ClaimService.getClaimById?.(claimId) || null;
      const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
      const hasGuildRole = await isMemberInGuildRoles(interaction.member);
      if (claimPreview && !isAdmin && !hasGuildRole && claimPreview.userId !== interaction.user.id) {
        const embed = createErrorEmbed(
          'Acceso denegado',
          'Solo puedes cancelar claims que hayas creado tú. Los administradores y usuarios con roles de gremio pueden cancelar cualquier claim.'
        );
        return await interaction.editReply({ embeds: [embed] });
      }

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
          text: 'Chuny BOT - Sistema de Claims',
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
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
  },

  /**
   * Configura automáticamente la categoría y canales para claims
   */
  async handleSetupClaims(interaction) {
    try {
      // Verificación de permisos: Administrador o rol autorizado
      const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
      const hasAuthorizedRole = await checkAuthorizedRole(interaction);
      if (!isAdmin && !hasAuthorizedRole) {
        const errorEmbed = createErrorEmbed(
          'Acceso denegado',
          'Necesitas permisos de Administrador o estar en los roles autorizados para ejecutar `/claim setup`.'
        );
        return await interaction.editReply({ embeds: [errorEmbed] });
      }

      const guild = interaction.guild;
      // Crear o reutilizar categoría "claims"
      let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'claims');
      if (!category) {
        category = await guild.channels.create({ name: 'claims', type: ChannelType.GuildCategory });
      }

      // Helper para crear o reutilizar un canal bajo la categoría
      const ensureChannel = async (name) => {
        let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.toLowerCase() === name && c.parentId === category.id);
        if (!ch) {
          ch = await guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id });
        }
        return ch;
      };

      const claimsChannel = await ensureChannel('claims');
      const remindersChannel = await ensureChannel('recordatorios');
      const cancelledChannel = await ensureChannel('cancelados');
      const completedChannel = await ensureChannel('completados');

      // Guardar configuración en BD usando el servicio existente
      const ClaimChannelService = require('../../services/claimChannelService');
      const guildId = guild.id;
      const guildName = guild.name;
      const byUser = interaction.user.id;

      await ClaimChannelService.setClaimsChannel(guildId, guildName, claimsChannel.id, claimsChannel.name, byUser);
      await ClaimChannelService.setRemindersChannel(guildId, guildName, remindersChannel.id, remindersChannel.name, byUser);
      await ClaimChannelService.setClosedChannel(guildId, guildName, cancelledChannel.id, cancelledChannel.name, byUser);
      await ClaimChannelService.setSuccessChannel(guildId, guildName, completedChannel.id, completedChannel.name, byUser);

      const successEmbed = createSuccessEmbed(
        'Configuración de Claims Completada',
        'Se creó/asignó la categoría y los canales por defecto.'
      );
      successEmbed.addFields(
        { name: '📂 Categoría', value: category.name, inline: true },
        { name: '📝 Claims', value: `<#${claimsChannel.id}>`, inline: true },
        { name: '⏰ Recordatorios', value: `<#${remindersChannel.id}>`, inline: true },
        { name: '❌ Cancelados', value: `<#${cancelledChannel.id}>`, inline: true },
        { name: '✅ Completados', value: `<#${completedChannel.id}>`, inline: true }
      );

      return await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      const errorEmbed = createErrorEmbed(
        'Error en Claim Setup',
        `No se pudo configurar los canales automáticamente: ${error.message}`
      );
      return await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};
