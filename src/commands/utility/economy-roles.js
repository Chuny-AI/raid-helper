const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, safeReply } = require('../../utils/errorEmbeds');
const EconomyRoleService = require('../../services/economyRoleService');
const { isServerPremium } = require('../../services/serverService');
const { isOwner } = require('../../middleware/ownerCheck');

/**
 * Comando para gestionar roles de economía
 * Permite agregar, eliminar, listar y sincronizar roles con permisos de economía
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('economy-roles')
    .setDescription('Gestiona los roles autorizados para usar comandos de economía')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Agrega un rol a la lista de roles de economía')
        .addRoleOption(option =>
          option
            .setName('rol')
            .setDescription('Rol a autorizar para economía')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('permisos')
            .setDescription('Permisos específicos (separados por comas)')
            .setRequired(false)
            .addChoices(
              { name: 'ECONOMY (Básico)', value: 'ECONOMY' },
              { name: 'ECONOMY_ADD (Añadir dinero)', value: 'ECONOMY_ADD' },
              { name: 'ECONOMY_REMOVE (Eliminar dinero)', value: 'ECONOMY_REMOVE' },
              { name: 'ECONOMY_VIEW (Ver balances)', value: 'ECONOMY_VIEW' },
              { name: 'ECONOMY_ADMIN (Administrador)', value: 'ECONOMY_ADMIN' },
              { name: 'ALL (Todos los permisos)', value: 'ALL' }
            )
        )
        .addStringOption(option =>
          option
            .setName('descripcion')
            .setDescription('Descripción del rol (opcional)')
            .setRequired(false)
            .setMaxLength(500)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Elimina un rol de la lista de roles de economía')
        .addRoleOption(option =>
          option
            .setName('rol')
            .setDescription('Rol a desautorizar')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lista todos los roles de economía autorizados')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sync')
        .setDescription('Sincroniza roles de economía con Discord (elimina roles inexistentes)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Elimina todos los roles de economía del servidor')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('Muestra estadísticas de roles de economía')
    ),

  async execute(interaction) {
    try {
      // JERARQUÍA DE VALIDACIONES:
      // 1. Verificar estado premium del servidor
      // 2. Verificar que es propietario o administrador
      // 3. Ejecutar el subcomando correspondiente

      const guildId = interaction.guild.id;
      const subcommand = interaction.options.getSubcommand();

      // 1. PRIMERA PRIORIDAD: Verificar estado premium
      const isPremium = await isServerPremium(guildId);
      if (!isPremium) {
        // Solo el propietario puede usar comandos en servidores no premium
        const ownerCheck = await isOwner(interaction);
        if (!ownerCheck) {
          const premiumEmbed = createPremiumEmbed();
          return await safeReply(interaction, { embeds: [premiumEmbed], ephemeral: true });
        }
      }

      // 2. SEGUNDA PRIORIDAD: Verificar permisos de administrador o propietario
      const ownerCheck = await isOwner(interaction);
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      
      if (!ownerCheck && !isAdmin) {
        const errorEmbed = createErrorEmbed(
          "Acceso Denegado",
          "Solo el propietario del bot y los administradores pueden gestionar roles de economía.",
          [{
            name: "Permisos Requeridos",
            value: "• Propietario del bot\n• Administrador del servidor",
            inline: false
          }]
        );
        return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }

      // 3. TERCERA PRIORIDAD: Ejecutar el subcomando correspondiente
      await interaction.deferReply({ ephemeral: true });

      switch (subcommand) {
        case 'add':
          await this.handleAddRole(interaction, guildId);
          break;
        case 'remove':
          await this.handleRemoveRole(interaction, guildId);
          break;
        case 'list':
          await this.handleListRoles(interaction, guildId);
          break;
        case 'sync':
          await this.handleSyncRoles(interaction, guildId);
          break;
        case 'clear':
          await this.handleClearRoles(interaction, guildId);
          break;
        case 'stats':
          await this.handleStatsRoles(interaction, guildId);
          break;
        default:
          const errorEmbed = createErrorEmbed(
            "Subcomando No Válido",
            "El subcomando especificado no es válido."
          );
          await interaction.editReply({ embeds: [errorEmbed] });
      }
    } catch (error) {
      console.error('[ERROR] Error en comando economy-roles:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de roles de economía.",
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

  async handleAddRole(interaction, guildId) {
    const role = interaction.options.getRole('rol');
    const permissionsOption = interaction.options.getString('permisos') || 'ECONOMY';
    const description = interaction.options.getString('descripcion') || '';

    try {
      // Procesar permisos
      let permissions = [];
      if (permissionsOption === 'ALL') {
        permissions = ['ECONOMY', 'ECONOMY_ADD', 'ECONOMY_REMOVE', 'ECONOMY_VIEW', 'ECONOMY_ADMIN'];
      } else {
        permissions = [permissionsOption];
      }

      const economyRole = await EconomyRoleService.createEconomyRole({
        roleId: role.id,
        name: role.name,
        guildId,
        permissions,
        createdBy: interaction.user.id,
        description
      });

      const embed = createSuccessEmbed(
        "Rol de Economía Agregado",
        `El rol **${role.name}** ha sido agregado a la lista de roles de economía.`,
        [
          {
            name: "🎭 Rol",
            value: `${role}`,
            inline: true
          },
          {
            name: "🔐 Permisos",
            value: permissions.join(', '),
            inline: true
          },
          {
            name: "👤 Agregado por",
            value: `${interaction.user}`,
            inline: true
          },
          {
            name: "📝 Descripción",
            value: description || 'Sin descripción',
            inline: false
          },
          {
            name: "ℹ️ Funcionalidad",
            value: "Los usuarios con este rol ahora pueden usar comandos de economía según los permisos asignados.",
            inline: false
          }
        ]
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ERROR] Error agregando rol de economía:', error);
      const errorEmbed = createErrorEmbed(
        "Error Agregando Rol",
        `Error al agregar el rol de economía: ${error.message}`,
        [{
          name: "Solución",
          value: "Verifica que el rol existe y que no esté ya registrado como rol de economía.",
          inline: false
        }]
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleRemoveRole(interaction, guildId) {
    const role = interaction.options.getRole('rol');

    try {
      const removed = await EconomyRoleService.removeEconomyRole(guildId, role.id);
      
      if (removed) {
        const embed = createSuccessEmbed(
          "Rol de Economía Eliminado",
          `El rol **${role.name}** ha sido eliminado de la lista de roles de economía.`,
          [
            {
              name: "🎭 Rol",
              value: `${role}`,
              inline: true
            },
            {
              name: "👤 Eliminado por",
              value: `${interaction.user}`,
              inline: true
            },
            {
              name: "ℹ️ Funcionalidad",
              value: "Los usuarios con este rol ya no pueden usar comandos de economía.",
              inline: false
            }
          ]
        );
        await interaction.editReply({ embeds: [embed] });
      } else {
        const errorEmbed = createErrorEmbed(
          "Rol No Encontrado",
          `El rol **${role.name}** no está registrado como rol de economía.`
        );
        await interaction.editReply({ embeds: [errorEmbed] });
      }
    } catch (error) {
      console.error('[ERROR] Error eliminando rol de economía:', error);
      const errorEmbed = createErrorEmbed(
        "Error Eliminando Rol",
        `Error al eliminar el rol de economía: ${error.message}`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleListRoles(interaction, guildId) {
    try {
      const economyRoles = await EconomyRoleService.getEconomyRoles(guildId);

      if (economyRoles.length === 0) {
        const embed = createInfoEmbed(
          "Roles de Economía",
          "No hay roles de economía configurados en este servidor.",
          [{
            name: "ℹ️ Nota",
            value: "Los administradores y el propietario del bot siempre pueden usar comandos de economía.",
            inline: false
          }]
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let rolesList = '';
      economyRoles.forEach((economyRole, index) => {
        const permissions = economyRole.permissions.join(', ');
        rolesList += `${index + 1}. <@&${economyRole.roleId}> (${economyRole.name})\n`;
        rolesList += `   **Permisos:** ${permissions}\n`;
        if (economyRole.description) {
          rolesList += `   **Descripción:** ${economyRole.description}\n`;
        }
        rolesList += '\n';
      });

      const embed = createInfoEmbed(
        "Roles de Economía Autorizados",
        `**Roles configurados para usar comandos de economía:**\n\n${rolesList}`,
        [
          {
            name: "ℹ️ Nota Importante",
            value: "Los administradores y el propietario del bot siempre pueden usar comandos de economía.",
            inline: false
          },
          {
            name: "📊 Total de Roles",
            value: economyRoles.length.toString(),
            inline: true
          }
        ]
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ERROR] Error listando roles de economía:', error);
      const errorEmbed = createErrorEmbed(
        "Error Listando Roles",
        `Error al listar los roles de economía: ${error.message}`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleSyncRoles(interaction, guildId) {
    try {
      const guild = interaction.guild;
      const syncResult = await EconomyRoleService.syncRolesWithDiscord(guild);

      const embed = createSuccessEmbed(
        "Sincronización Completada",
        "Los roles de economía han sido sincronizados con Discord.",
        [
          {
            name: "📊 Estadísticas",
            value: `**Total procesados:** ${syncResult.total}\n**Eliminados:** ${syncResult.removed}\n**Actualizados:** ${syncResult.updated}\n**Activos:** ${syncResult.active}`,
            inline: false
          },
          {
            name: "ℹ️ Información",
            value: "Los roles que ya no existen en Discord han sido desactivados automáticamente.",
            inline: false
          }
        ]
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ERROR] Error sincronizando roles:', error);
      const errorEmbed = createErrorEmbed(
        "Error en Sincronización",
        `Error al sincronizar los roles: ${error.message}`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleClearRoles(interaction, guildId) {
    try {
      const removedCount = await EconomyRoleService.clearEconomyRoles(guildId);

      const embed = createSuccessEmbed(
        "Roles de Economía Limpiados",
        "Todos los roles de economía han sido eliminados del servidor.",
        [
          {
            name: "📊 Roles Eliminados",
            value: removedCount.toString(),
            inline: true
          },
          {
            name: "👤 Ejecutado por",
            value: `${interaction.user}`,
            inline: true
          },
          {
            name: "ℹ️ Funcionalidad",
            value: "Solo los administradores y el propietario del bot podrán usar comandos de economía.",
            inline: false
          }
        ]
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ERROR] Error limpiando roles:', error);
      const errorEmbed = createErrorEmbed(
        "Error Limpiando Roles",
        `Error al limpiar los roles de economía: ${error.message}`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleStatsRoles(interaction, guildId) {
    try {
      const stats = await EconomyRoleService.getEconomyRoleStats(guildId);

      let permissionStats = '';
      Object.entries(stats.rolesByPermission).forEach(([permission, count]) => {
        permissionStats += `**${permission}:** ${count} roles\n`;
      });

      const embed = createInfoEmbed(
        "Estadísticas de Roles de Economía",
        "Información detallada sobre los roles de economía configurados.",
        [
          {
            name: "📊 Resumen General",
            value: `**Total de roles:** ${stats.totalRoles}\n**Última actualización:** ${stats.lastUpdated.toLocaleString('es-ES')}`,
            inline: false
          },
          {
            name: "🔐 Roles por Permiso",
            value: permissionStats || 'Sin datos',
            inline: false
          }
        ]
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ERROR] Error obteniendo estadísticas:', error);
      const errorEmbed = createErrorEmbed(
        "Error Obteniendo Estadísticas",
        `Error al obtener las estadísticas: ${error.message}`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};