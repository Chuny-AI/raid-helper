const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { checkAuthorizedAccess } = require('../../../middleware/roleCheck');
const editor = require('../application/template-editor-service');
const screens = require('./template-edit-screens');
const { createErrorEmbed, safeReply } = require('../../../utils/errorEmbeds');

const showCreateModal = (interaction) => interaction.showModal(
  new ModalBuilder()
    .setCustomId('template_create_basic')
    .setTitle('Crear nueva plantilla')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('title').setLabel('Título de la plantilla').setStyle(TextInputStyle.Short)
        .setPlaceholder('Ej: Raid semanal').setRequired(true).setMaxLength(100)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('description').setLabel('Descripción').setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Descripción del evento…').setRequired(true).setMaxLength(1000)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('image').setLabel('URL de imagen (opcional)').setStyle(TextInputStyle.Short)
        .setPlaceholder('https://ejemplo.com/imagen.png').setRequired(false).setMaxLength(500)),
    ),
);

const ensureAccess = async (interaction) => {
  if (await checkAuthorizedAccess(interaction)) return true;
  await safeReply(interaction, {
    embeds: [createErrorEmbed('Acceso denegado', 'Necesitas un rol autorizado o ser administrador para crear plantillas.')],
    ephemeral: true,
  });
  return false;
};

const executeCreate = async (interaction) => {
  if (!await ensureAccess(interaction)) return;
  return showCreateModal(interaction);
};

const handleInteraction = async (interaction) => {
  if (interaction.customId !== 'template_create_basic' || !interaction.isModalSubmit?.()) return false;
  try {
    if (!await ensureAccess(interaction)) return true;
    const sessionId = await editor.startCreate({
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      guildName: interaction.guild.name,
      title: interaction.fields.getTextInputValue('title'),
      description: interaction.fields.getTextInputValue('description'),
      image: interaction.fields.getTextInputValue('image'),
    });
    await screens.showOverview(interaction, sessionId);
  } catch (error) {
    console.error('[TEMPLATE] Error iniciando creación:', error);
    await safeReply(interaction, {
      embeds: [createErrorEmbed('No se pudo crear la plantilla', error.message || 'Revisa los datos e inténtalo de nuevo.')],
      ephemeral: true,
    });
  }
  return true;
};

module.exports = { executeCreate, handleInteraction, showCreateModal };
