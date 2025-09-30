const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, safeReply } = require('../../utils/errorEmbeds');
const { addGuildRoles, removeGuildRoles, listGuildRoles, cleanStaleGuildRoles } = require('../../services/guildRoleService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guilds')
    .setDescription('Gestiona roles del gremio/alianza (solo administradores)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Añade un rol del gremio/alianza')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Menciona el rol (@Rol) a añadir')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Elimina un rol del gremio/alianza')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Menciona el rol (@Rol) a eliminar')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lista los roles del gremio/alianza y limpia los obsoletos')
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();
      const guild = interaction.guild;
      const guildId = guild.id;

      if (sub === 'add') {
        const role = interaction.options.getRole('role');
        const res = await addGuildRoles(guildId, [role.id], interaction.user.id, [role.name]);
        const status = res[0]?.status || 'error';
        if (status === 'created' || status === 'reactivated') {
          const embed = createSuccessEmbed('Rol de gremio añadido', `Se añadió: <@&${role.id}>`);
          return await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
        const embed = createErrorEmbed('No se pudo añadir', `Estado: ${status}`);
        return await safeReply(interaction, { embeds: [embed], ephemeral: true });
      }

      if (sub === 'remove') {
        const role = interaction.options.getRole('role');
        const res = await removeGuildRoles(guildId, [role.id]);
        const status = res[0]?.status || 'error';
        if (status === 'removed') {
          const embed = createSuccessEmbed('Rol eliminado', `Se eliminó: <@&${role.id}>`);
          return await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
        const embed = createErrorEmbed('No se pudo eliminar', `Estado: ${status}`);
        return await safeReply(interaction, { embeds: [embed], ephemeral: true });
      }

      if (sub === 'list') {
        const cleanup = await cleanStaleGuildRoles(guild);
        const roles = await listGuildRoles(guildId);
        const lines = roles.map(r => `• <@&${r.roleId}> (${r.roleId})`);
        const embed = createInfoEmbed(
          'Roles de gremio',
          lines.length ? lines.join('\n') : 'No hay roles de gremio configurados.',
          cleanup.removed > 0 ? [{ name: 'Limpieza', value: `${cleanup.removed} roles obsoletos eliminados`, inline: false }] : undefined
        );
        return await safeReply(interaction, { embeds: [embed], ephemeral: true });
      }

      return await safeReply(interaction, { embeds: [createErrorEmbed('Subcomando inválido', 'Usa add/remove/list')], ephemeral: true });
    } catch (error) {
      console.error('[ERROR] Comando guilds:', error);
      try {
        const embed = createErrorEmbed('Error del Sistema', 'Ocurrió un error ejecutando /guilds.');
        await safeReply(interaction, { embeds: [embed], ephemeral: true });
      } catch (_) {}
    }
  }
};