const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getAuthorizedRoles, addAuthorizedRole, removeAuthorizedRole, clearAuthorizedRoles } = require("../../services/authorizedRoleService");
const { getOrCreateServer } = require("../../services/serverService");
const { checkPremium } = require("../../middleware/premiumCheck");

/**
 * Comando para gestionar roles autorizados para enviar notificaciones
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Gestiona los roles autorizados para enviar notificaciones a todos los usuarios")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: "❌ Solo los administradores pueden gestionar roles autorizados.",
          ephemeral: true,
        });
      }

      // Verificar estado premium del servidor
      const hasPremium = await checkPremium(interaction);
      if (!hasPremium) {
        return;
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

            const embed = new EmbedBuilder()
              .setTitle("✅ Rol Autorizado")
              .setDescription(`El rol **${role.name}** ha sido agregado a la lista de roles autorizados para enviar notificaciones.`)
              .setColor("#00FF00")
              .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
          } catch (error) {
            await interaction.reply({
              content: `❌ Error: ${error.message}`,
              ephemeral: true,
            });
          }
          break;
        }

        case 'remove': {
          const role = interaction.options.getRole("role");
          
          try {
            await removeAuthorizedRole(role.id, guildId);

            const embed = new EmbedBuilder()
              .setTitle("❌ Rol Desautorizado")
              .setDescription(`El rol **${role.name}** ha sido eliminado de la lista de roles autorizados.`)
              .setColor("#FF0000")
              .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
          } catch (error) {
            await interaction.reply({
              content: `❌ Error: ${error.message}`,
              ephemeral: true,
            });
          }
          break;
        }

        case 'list': {
          const authorizedRoles = await getAuthorizedRoles(guildId);

          const embed = new EmbedBuilder()
            .setTitle("📋 Roles Autorizados")
            .setColor("#00FFFF")
            .setTimestamp();

          if (authorizedRoles.length === 0) {
            embed.setDescription("No hay roles autorizados en este servidor.\n\n**Nota:** Los administradores siempre pueden enviar notificaciones a todos los usuarios.");
          } else {
            const rolesList = authorizedRoles.map((role, index) => 
              `${index + 1}. <@&${role.roleId}> (${role.roleName})`
            ).join('\n');

            embed.setDescription(`**Roles autorizados para enviar notificaciones:**\n\n${rolesList}\n\n**Nota:** Los administradores siempre pueden enviar notificaciones a todos los usuarios.`);
          }

          await interaction.reply({ embeds: [embed], ephemeral: true });
          break;
        }

        case 'clear': {
          try {
            await clearAuthorizedRoles(guildId);

            const embed = new EmbedBuilder()
              .setTitle("🗑️ Roles Limpiados")
              .setDescription("Todos los roles autorizados han sido eliminados del servidor.")
              .setColor("#FFA500")
              .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
          } catch (error) {
            await interaction.reply({
              content: `❌ Error: ${error.message}`,
              ephemeral: true,
            });
          }
          break;
        }
      }
    } catch (error) {
      console.error('[ERROR] Error en comando roles:', error);
      await interaction.reply({
        content: "Hubo un error ejecutando el comando. Inténtalo de nuevo.",
        ephemeral: true,
      });
    }
  },
};
