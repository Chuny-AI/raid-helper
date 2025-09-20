const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getAuthorizedRoles, addAuthorizedRole, removeAuthorizedRole, clearAuthorizedRoles } = require("../../services/authorizedRoleService");
const { getOrCreateServer } = require("../../services/serverService");
const { checkOwner } = require("../../middleware/ownerCheck");
const { checkPremiumAccessWithOwnerBypass } = require("../../middleware/roleCheck");
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, safeReply } = require("../../utils/errorEmbeds");

/**
 * Comando para gestionar roles autorizados para enviar notificaciones
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Gestiona los roles autorizados para enviar notificaciones a todos los usuarios")
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Agrega un rol a la lista de autorizados")
        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription("Rol a autorizar")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Elimina un rol de la lista de autorizados")
        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription("Rol a desautorizar")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("Lista todos los roles autorizados")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("clear")
        .setDescription("Elimina todos los roles autorizados del servidor")
    ),

  async execute(interaction) {
    try {
      // Verificar permisos de administrador
      // Verificar acceso premium con bypass para el propietario
      const hasAccess = await checkPremiumAccessWithOwnerBypass(interaction);
      if (!hasAccess) {
        return;
      }

      // Verificar si es el propietario del bot o administrador
      const isOwner = await checkOwner(interaction);
      if (!isOwner) {
        // Si no es propietario, verificar si es administrador
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({
            content: "❌ Solo el propietario del bot y los administradores pueden gestionar roles autorizados.",
            ephemeral: true,
          });
        }
      }

      const guildId = interaction.guild.id;
      const subcommand = interaction.options.getSubcommand();

      // Asegurar que el servidor existe en la base de datos
      await getOrCreateServer(guildId, interaction.guild.name);

      switch (subcommand) {
        case 'add': {
          const role = interaction.options.getRole("role");
          
          try {
            await addAuthorizedRole(
              role.id,
              role.name,
              guildId,
              interaction.user.id
            );

            const embed = createSuccessEmbed(
              "Rol Autorizado",
              `El rol **${role.name}** ha sido agregado a la lista de roles autorizados para enviar notificaciones.`,
              [{
                name: "Funcionalidad",
                value: "Los usuarios con este rol ahora pueden enviar notificaciones a todos los usuarios del servidor.",
                inline: false
              }]
            );

            await safeReply(interaction, { embeds: [embed], ephemeral: true });
          } catch (error) {
            const errorEmbed = createErrorEmbed(
              "Error Agregando Rol",
              `Error al agregar el rol: ${error.message}`,
              [{
                name: "Solución",
                value: "Verifica que el rol existe y que tienes permisos para gestionarlo.",
                inline: false
              }]
            );
            await safeReply(interaction, {
              embeds: [errorEmbed],
              ephemeral: true,
            });
          }
          break;
        }

        case 'remove': {
          const role = interaction.options.getRole("role");
          
          try {
            await removeAuthorizedRole(role.id, guildId);

            const embed = createSuccessEmbed(
              "Rol Desautorizado",
              `El rol **${role.name}** ha sido eliminado de la lista de roles autorizados.`,
              [{
                name: "Funcionalidad",
                value: "Los usuarios con este rol ya no pueden enviar notificaciones a todos los usuarios del servidor.",
                inline: false
              }]
            );

            await safeReply(interaction, { embeds: [embed], ephemeral: true });
          } catch (error) {
            const errorEmbed = createErrorEmbed(
              "Error Eliminando Rol",
              `Error al eliminar el rol: ${error.message}`,
              [{
                name: "Solución",
                value: "Verifica que el rol existe y que tienes permisos para gestionarlo.",
                inline: false
              }]
            );
            await safeReply(interaction, {
              embeds: [errorEmbed],
              ephemeral: true,
            });
          }
          break;
        }

        case 'list': {
          const authorizedRoles = await getAuthorizedRoles(guildId);

          let embed;
          if (authorizedRoles.length === 0) {
            embed = createInfoEmbed(
              "Roles Autorizados",
              "No hay roles autorizados en este servidor.",
              [{
                name: "Nota Importante",
                value: "Los administradores siempre pueden enviar notificaciones a todos los usuarios.",
                inline: false
              }]
            );
          } else {
            const rolesList = authorizedRoles.map((role, index) => 
              `${index + 1}. <@&${role.roleId}> (${role.roleName})`
            ).join('\n');

            embed = createInfoEmbed(
              "Roles Autorizados",
              `**Roles autorizados para enviar notificaciones:**\n\n${rolesList}`,
              [{
                name: "Nota Importante",
                value: "Los administradores siempre pueden enviar notificaciones a todos los usuarios.",
                inline: false
              }, {
                name: "Total de Roles",
                value: authorizedRoles.length.toString(),
                inline: true
              }]
            );
          }

          await safeReply(interaction, { embeds: [embed], ephemeral: true });
          break;
        }

        case 'clear': {
          try {
            await clearAuthorizedRoles(guildId);

            const embed = createSuccessEmbed(
              "Roles Limpiados",
              "Todos los roles autorizados han sido eliminados del servidor.",
              [{
                name: "Funcionalidad",
                value: "Solo los administradores podrán enviar notificaciones a todos los usuarios.",
                inline: false
              }]
            );

            await safeReply(interaction, { embeds: [embed], ephemeral: true });
          } catch (error) {
            const errorEmbed = createErrorEmbed(
              "Error Limpiando Roles",
              `Error al limpiar los roles: ${error.message}`,
              [{
                name: "Solución",
                value: "Intenta ejecutar el comando de nuevo. Si el problema persiste, contacta al soporte.",
                inline: false
              }]
            );
            await safeReply(interaction, {
              embeds: [errorEmbed],
              ephemeral: true,
            });
          }
          break;
        }
      }
    } catch (error) {
      console.error('[ERROR] Error en comando roles:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de roles.",
        [{
          name: "Solución",
          value: "Intenta ejecutar el comando de nuevo. Si el problema persiste, contacta al soporte.",
          inline: false
        }]
      );
      await safeReply(interaction, {
        embeds: [errorEmbed],
        ephemeral: true,
      });
    }
  },
};
