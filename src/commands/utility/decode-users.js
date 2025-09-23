const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const AuthorizedUserService = require('../../services/authorizedUserService');
const { createErrorEmbed, createSuccessEmbed } = require('../../utils/errorEmbeds');

/**
 * Comando para gestionar usuarios autorizados para decode-file
 * Solo para owner del bot
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('decode-users')
    .setDescription('Gestiona usuarios autorizados para usar decode-file')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Autoriza a un usuario para usar decode-file')
        .addStringOption(option =>
          option
            .setName('userid')
            .setDescription('ID del usuario de Discord')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Razón de la autorización')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Revoca la autorización de un usuario')
        .addStringOption(option =>
          option
            .setName('userid')
            .setDescription('ID del usuario de Discord')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lista todos los usuarios autorizados')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('import')
        .setDescription('Importa múltiples usuarios desde una lista de IDs')
        .addStringOption(option =>
          option
            .setName('userids')
            .setDescription('Lista de IDs separados por comas (ej: 123456789,987654321)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Razón de la autorización masiva')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const ownerId = process.env.BOT_OWNER_ID;

    console.log(`[DECODE-USERS] Usuario: ${interaction.user.id}, Owner configurado: ${ownerId}`);

    if (interaction.user.id !== ownerId) {
      const unauthorizedEmbed = createErrorEmbed(
        'Acceso Denegado',
        'Solo el owner del bot puede gestionar usuarios autorizados.',
        [{
          name: '🔒 Comando Restringido',
          value: 'Este comando está limitado exclusivamente al propietario del bot.',
          inline: false
        }, {
          name: '🔍 Debug Info',
          value: `Tu ID: \`${interaction.user.id}\`\nOwner ID: \`${ownerId || 'NO CONFIGURADO'}\``,
          inline: false
        }]
      );

      await interaction.reply({ embeds: [unauthorizedEmbed], ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'add':
          await this.handleAdd(interaction);
          break;
        case 'remove':
          await this.handleRemove(interaction);
          break;
        case 'list':
          await this.handleList(interaction);
          break;
        case 'import':
          await this.handleImport(interaction);
          break;
        default:
          await interaction.editReply({ content: 'Subcomando no reconocido.' });
      }
    } catch (error) {
      console.error('[ERROR] Error en comando decode-users:', error);

      const errorEmbed = createErrorEmbed(
        'Error Interno',
        'Ocurrió un error al ejecutar el comando.',
        [{
          name: '🔧 Error Técnico',
          value: `\`${error.message}\``,
          inline: false
        }]
      );

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleAdd(interaction) {
    const userId = interaction.options.getString('userid');
    const reason = interaction.options.getString('reason') || 'Autorizado por owner';

    const result = await AuthorizedUserService.authorizeUser(
      userId,
      interaction.user.id,
      null,
      reason
    );

    if (result.success) {
      const successEmbed = createSuccessEmbed(
        'Usuario Autorizado',
        `Usuario <@${userId}> ha sido autorizado para usar decode-file.`,
        [{
          name: '📝 Detalles',
          value: `**ID:** \`${userId}\`\n**Acción:** ${result.action === 'created' ? 'Nuevo' : 'Reactivado'}\n**Razón:** ${reason}`,
          inline: false
        }]
      );

      await interaction.editReply({ embeds: [successEmbed] });
    } else {
      const errorEmbed = createErrorEmbed(
        'Error al Autorizar',
        result.message,
        [{
          name: '👤 Usuario',
          value: `\`${userId}\``,
          inline: false
        }]
      );

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleRemove(interaction) {
    const userId = interaction.options.getString('userid');

    const result = await AuthorizedUserService.revokeUser(userId, interaction.user.id);

    if (result.success) {
      const successEmbed = createSuccessEmbed(
        'Autorización Revocada',
        `La autorización de <@${userId}> ha sido revocada.`,
        [{
          name: '👤 Usuario',
          value: `\`${userId}\``,
          inline: false
        }]
      );

      await interaction.editReply({ embeds: [successEmbed] });
    } else {
      const errorEmbed = createErrorEmbed(
        'Error al Revocar',
        result.message,
        [{
          name: '👤 Usuario',
          value: `\`${userId}\``,
          inline: false
        }]
      );

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleList(interaction) {
    const users = await AuthorizedUserService.getAuthorizedUsers(true);

    if (users.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setTitle('📋 Usuarios Autorizados')
        .setDescription('No hay usuarios autorizados actualmente.')
        .setColor('#FFA500')
        .setTimestamp();

      await interaction.editReply({ embeds: [emptyEmbed] });
      return;
    }

    const listEmbed = new EmbedBuilder()
      .setTitle('📋 Usuarios Autorizados para decode-file')
      .setDescription(`Total: **${users.length}** usuarios autorizados`)
      .setColor('#00D166')
      .setTimestamp();

    const chunkSize = 10;
    for (let i = 0; i < users.length; i += chunkSize) {
      const chunk = users.slice(i, i + chunkSize);
      const fieldValue = chunk.map((user, index) => {
        const globalIndex = i + index + 1;
        const date = user.authorizedAt.toLocaleDateString();
        return `**${globalIndex}.** <@${user.userId}> (\`${user.userId}\`)\n└ Autorizado: ${date}`;
      }).join('\n\n');

      listEmbed.addFields({
        name: `👥 Usuarios ${i + 1}-${Math.min(i + chunkSize, users.length)}`,
        value: fieldValue,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [listEmbed] });
  },

  async handleImport(interaction) {
    const userIdsString = interaction.options.getString('userids');
    const reason = interaction.options.getString('reason') || 'Importación masiva';

    const userIds = userIdsString
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (userIds.length === 0) {
      const errorEmbed = createErrorEmbed(
        'IDs Inválidos',
        'No se encontraron IDs válidos en la lista.',
        [{
          name: '📝 Formato',
          value: 'Usa el formato: `123456789,987654321,555444333`',
          inline: false
        }]
      );

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    const result = await AuthorizedUserService.importUsers(userIds, interaction.user.id, reason);

    const resultEmbed = new EmbedBuilder()
      .setTitle('📁 Resultado de Importación Masiva')
      .setDescription(`Procesados **${userIds.length}** usuarios`)
      .addFields(
        {
          name: '✅ Autorizados',
          value: `${result.success}`,
          inline: true
        },
        {
          name: '👥 Ya Existían',
          value: `${result.existing}`,
          inline: true
        },
        {
          name: '❌ Fallos',
          value: `${result.failed}`,
          inline: true
        }
      )
      .setTimestamp();

    if (result.success > 0 || result.existing > 0) {
      resultEmbed.setColor('#00D166');
    } else {
      resultEmbed.setColor('#FF0000');
    }

    if (result.errors.length > 0 && result.errors.length <= 5) {
      resultEmbed.addFields({
        name: '⚠️ Errores',
        value: result.errors.slice(0, 5).join('\n'),
        inline: false
      });
    } else if (result.errors.length > 5) {
      resultEmbed.addFields({
        name: '⚠️ Errores',
        value: `${result.errors.slice(0, 3).join('\n')}\n... y ${result.errors.length - 3} más`,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [resultEmbed] });
  }
};
