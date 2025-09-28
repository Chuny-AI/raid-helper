const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createErrorEmbed, createPremiumEmbed, createSuccessEmbed, createInfoEmbed, safeReply } = require('../../utils/errorEmbeds');
const EconomyService = require('../../services/economyService');
const { isServerPremium } = require('../../services/serverService');
const { checkEconomyPermission, checkSpecificEconomyPermission, getEconomyPermissionInfo } = require('../../middleware/roleCheck');

/**
 * Comando de economía con subcomandos para gestionar dinero de usuarios
 * Requiere PREMIUM + roles con permisos ECONOMY en la base de datos
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('Gestiona la economía del servidor')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Añade dinero a un usuario')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuario al que añadir dinero')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('cantidad')
            .setDescription('Cantidad de dinero a añadir')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(999999999)
        )
        .addStringOption(option =>
          option
            .setName('razon')
            .setDescription('Razón para añadir el dinero')
            .setRequired(false)
            .setMaxLength(200)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Elimina dinero de un usuario')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuario al que eliminar dinero')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('cantidad')
            .setDescription('Cantidad de dinero a eliminar')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(999999999)
        )
        .addStringOption(option =>
          option
            .setName('razon')
            .setDescription('Razón para eliminar el dinero')
            .setRequired(false)
            .setMaxLength(200)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('balance')
        .setDescription('Muestra el balance de un usuario')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuario del que ver el balance (opcional)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('top')
        .setDescription('Muestra el top de usuarios con más dinero')
        .addIntegerOption(option =>
          option
            .setName('cantidad')
            .setDescription('Número de usuarios a mostrar (máximo 20)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20)
        )
    ),

  async execute(interaction) {
    try {
      // FLUJO SECUENCIAL PARA COMANDO ECONOMY:
      // 1. Verificar estado premium del servidor PRIMERO
      // 2. Si no premium → Mostrar embed premium y DETENER ejecución
      // 3. Solo con premium → Validar roles de economía
      // 4. Ejecutar subcomando correspondiente

      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      // 1. PRIMERA PRIORIDAD: Verificar estado premium ANTES que cualquier otra validación
      // TODOS los comandos (excepto status) requieren OBLIGATORIAMENTE premium
      const isPremium = await isServerPremium(guildId);
      if (!isPremium) {
        // ÚNICO bypass permitido: propietario del bot
        let botOwnerId;
        const application = interaction.client.application;
        if (application && application.owner) {
          botOwnerId = application.owner.id;
        } else {
          botOwnerId = process.env.BOT_OWNER_ID;
        }

        // SIN EXCEPCIONES: Ni administradores ni usuarios normales pueden usar comandos sin premium
        if (interaction.user.id !== botOwnerId) {
          // NO PREMIUM: Mostrar embed premium y DETENER ejecución
          const premiumEmbed = createPremiumEmbed();
          return await safeReply(interaction, { embeds: [premiumEmbed], ephemeral: true });
        }
      }

      // 2. SEGUNDA PRIORIDAD: Solo con premium confirmado, validar roles de economía
      let hasPermission = false;
      let requiredPermission = 'ECONOMY';

      switch (subcommand) {
        case 'add':
          requiredPermission = 'ECONOMY_ADD';
          hasPermission = await checkSpecificEconomyPermission(interaction, requiredPermission) || 
                         await checkEconomyPermission(interaction, 'ECONOMY');
          break;
        case 'remove':
          requiredPermission = 'ECONOMY_REMOVE';
          hasPermission = await checkSpecificEconomyPermission(interaction, requiredPermission) || 
                         await checkEconomyPermission(interaction, 'ECONOMY');
          break;
        case 'balance':
          // BALANCE: Permitir a todos los usuarios ver su propio balance en servidores premium
          // Solo verificar permisos si intentan ver el balance de otro usuario
          const targetUser = interaction.options.getUser('usuario');
          if (!targetUser || targetUser.id === interaction.user.id) {
            // Ver su propio balance - permitido para todos en servidores premium
            hasPermission = true;
          } else {
            // Ver balance de otro usuario - requiere permisos ECONOMY_VIEW
            requiredPermission = 'ECONOMY_VIEW';
            hasPermission = await checkSpecificEconomyPermission(interaction, requiredPermission) || 
                           await checkEconomyPermission(interaction, 'ECONOMY');
          }
          break;
        case 'top':
          requiredPermission = 'ECONOMY_VIEW';
          hasPermission = await checkSpecificEconomyPermission(interaction, requiredPermission) || 
                         await checkEconomyPermission(interaction, 'ECONOMY');
          break;
        default:
          hasPermission = await checkEconomyPermission(interaction, 'ECONOMY');
      }

      // 3. TERCERA PRIORIDAD: Solo mostrar error de roles si ya se confirmó premium
      if (!hasPermission) {
        const permissionInfo = await getEconomyPermissionInfo(interaction);
        
        // Mensaje específico para balance de otros usuarios
        const targetUser = interaction.options.getUser('usuario');
        const isViewingOtherUser = subcommand === 'balance' && targetUser && targetUser.id !== interaction.user.id;
        
        let errorTitle = "Permisos de Economía Insuficientes";
        let errorDescription = "No tienes permisos para usar comandos de economía.";
        
        if (isViewingOtherUser) {
          errorTitle = "Permisos Insuficientes para Ver Balance Ajeno";
          errorDescription = "No tienes permisos para ver el balance de otros usuarios. Puedes ver tu propio balance sin restricciones.";
        }
        
        const errorEmbed = createErrorEmbed(
          errorTitle,
          errorDescription,
          [
            {
              name: "Permisos Requeridos",
              value: isViewingOtherUser 
                ? `• Servidor Premium ✅\n• Rol con permiso \`ECONOMY_VIEW\` o \`ECONOMY\` para ver balances ajenos`
                : `• Servidor Premium ✅\n• Rol con permiso \`${requiredPermission}\` o \`ECONOMY\``,
              inline: false
            },
            {
              name: "Tu Estado Actual",
              value: `**Razón:** ${permissionInfo.reason}\n**Permisos:** ${permissionInfo.permissions.length > 0 ? permissionInfo.permissions.join(', ') : 'Ninguno'}`,
              inline: false
            },
            {
              name: "Solución",
              value: isViewingOtherUser 
                ? "Para ver tu propio balance usa `/economy balance` sin especificar usuario. Para ver balances ajenos, contacta con un administrador."
                : "Contacta con un administrador para que te asigne un rol con permisos de economía.",
              inline: false
            }
          ]
        );
        return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }

      // 4. CUARTA PRIORIDAD: Ejecutar el subcomando correspondiente
      await interaction.deferReply();

      switch (subcommand) {
        case 'add':
          await this.handleAddMoney(interaction, guildId);
          break;
        case 'remove':
          await this.handleRemoveMoney(interaction, guildId);
          break;
        case 'balance':
          await this.handleBalance(interaction, guildId);
          break;
        case 'top':
          await this.handleTop(interaction, guildId);
          break;
        default:
          const errorEmbed = createErrorEmbed(
            "Subcomando No Válido",
            "El subcomando especificado no es válido."
          );
          await interaction.editReply({ embeds: [errorEmbed] });
      }
    } catch (error) {
      console.error('[ERROR] Error en comando economy:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de economía.",
        [{
          name: "Solución",
          value: "Intenta ejecutar el comando de nuevo. Si el problema persiste, contacta al soporte.",
          inline: false
        }]
      );
      
      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  async handleAddMoney(interaction, serverId) {
    const targetUser = interaction.options.getUser('usuario');
    const amount = interaction.options.getInteger('cantidad');
    const reason = interaction.options.getString('razon') || 'No especificada';

    if (targetUser.bot) {
      const errorEmbed = createErrorEmbed(
        "Usuario No Válido",
        "No puedes añadir dinero a un bot."
      );
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    try {
      const result = await EconomyService.addMoney(targetUser.id, serverId, amount);

      const embed = createSuccessEmbed(
        "Dinero Añadido",
        `Se ha añadido dinero exitosamente a **${targetUser.displayName}**`,
        [
          {
            name: "👤 Usuario",
            value: `${targetUser}`,
            inline: true
          },
          {
            name: "💵 Cantidad Añadida",
            value: EconomyService.formatCurrency(amount),
            inline: true
          },
          {
            name: "🏦 Nuevo Balance",
            value: EconomyService.formatCurrency(result.newBalance),
            inline: true
          },
          {
            name: "📝 Razón",
            value: reason,
            inline: false
          }
        ]
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ERROR] Error añadiendo dinero:', error);
      const errorEmbed = createErrorEmbed(
        "Error Añadiendo Dinero",
        `Error al añadir dinero: ${error.message}`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleRemoveMoney(interaction, serverId) {
    const targetUser = interaction.options.getUser('usuario');
    const amount = interaction.options.getInteger('cantidad');
    const reason = interaction.options.getString('razon') || 'No especificada';

    if (targetUser.bot) {
      const errorEmbed = createErrorEmbed(
        "Usuario No Válido",
        "No puedes eliminar dinero de un bot."
      );
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    try {
      const result = await EconomyService.removeMoney(targetUser.id, serverId, amount);

      const embed = createSuccessEmbed(
        "Dinero Eliminado",
        `Se ha eliminado dinero exitosamente de **${targetUser.displayName}**`,
        [
          {
            name: "👤 Usuario",
            value: `${targetUser}`,
            inline: true
          },
          {
            name: "💵 Cantidad Eliminada",
            value: EconomyService.formatCurrency(amount),
            inline: true
          },
          {
            name: "🏦 Nuevo Balance",
            value: EconomyService.formatCurrency(result.newBalance),
            inline: true
          },
          {
            name: "📝 Razón",
            value: reason,
            inline: false
          }
        ]
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ERROR] Error eliminando dinero:', error);
      const errorEmbed = createErrorEmbed(
        "Error Eliminando Dinero",
        `Error al eliminar dinero: ${error.message}`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleBalance(interaction, serverId) {
    const targetUser = interaction.options.getUser('usuario') || interaction.user;

    if (targetUser.bot) {
      const errorEmbed = createErrorEmbed(
        "Usuario No Válido",
        "Los bots no tienen balance."
      );
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    try {
      const balanceResult = await EconomyService.getBalance(targetUser.id, serverId);
      const numericBalance = Number(balanceResult?.balance ?? 0) || 0;
      const formattedBalance = EconomyService.formatCurrency(numericBalance);

      const embed = createInfoEmbed(
        "Balance del Usuario",
        `Balance actual de **${targetUser.displayName}**`,
        [
          {
            name: "👤 Usuario",
            value: `${targetUser}`,
            inline: true
          },
          {
            name: "🏦 Balance Total",
            value: formattedBalance,
            inline: true
          },
          {
            name: "📅 Consulta",
            value: new Date().toLocaleString('es-ES'),
            inline: true
          }
        ]
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ERROR] Error obteniendo balance:', error);
      const errorEmbed = createErrorEmbed(
        "Error Obteniendo Balance",
        `Error al obtener el balance: ${error.message}`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleTop(interaction, serverId) {
    const limit = interaction.options.getInteger('cantidad') || 10;

    try {
      const topUsers = await EconomyService.getTopBalances(serverId, limit);

      if (topUsers.length === 0) {
        const embed = createInfoEmbed(
          "Top Usuarios - Sin Datos",
          "No hay datos de economía para este servidor."
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let ranking = '';
      const medals = ['🥇', '🥈', '🥉'];

      for (let i = 0; i < topUsers.length; i++) {
        const medal = medals[i] || `${i + 1}.`;
        const balance = EconomyService.formatCurrency(topUsers[i].balance);
        ranking += `${medal} <@${topUsers[i].userId}> - ${balance}\n`;
      }

      const embed = createInfoEmbed(
        `Top ${limit} Usuarios - Economía`,
        "Usuarios con más dinero en el servidor",
        [
          {
            name: "🏆 Ranking",
            value: ranking,
            inline: false
          }
        ]
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ERROR] Error obteniendo top usuarios:', error);
      const errorEmbed = createErrorEmbed(
        "Error Obteniendo Top",
        `Error al obtener el top de usuarios: ${error.message}`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};
