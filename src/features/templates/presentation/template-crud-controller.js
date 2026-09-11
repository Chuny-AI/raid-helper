const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const crud = require('../application/template-crud');
const { TemplateTransferError } = require('../domain/template-transfer');
const { checkAuthorizedAccess } = require('../../../middleware/roleCheck');
const { createErrorEmbed, createInfoEmbed, createSuccessEmbed, safeReply } = require('../../../utils/errorEmbeds');

const ensureAccess = async (interaction) => {
  if (await checkAuthorizedAccess(interaction)) return true;
  await safeReply(interaction, {
    embeds: [createErrorEmbed('🔒 Sin Permisos', 'Necesitas un rol autorizado o ser administrador para gestionar plantillas.')],
    flags: MessageFlags.Ephemeral,
  });
  return false;
};

const deferEphemeral = async (interaction) => {
  if (!interaction.deferred && !interaction.replied) {
    if (interaction.isMessageComponent?.()) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
};

const executeList = async (interaction) => {
  try {
    await deferEphemeral(interaction);
    if (!await ensureAccess(interaction)) return;
    const templates = await crud.list({ guildId: interaction.guild.id, guildName: interaction.guild.name });
    if (templates.length === 0) {
      return safeReply(interaction, {
        embeds: [createInfoEmbed('No Hay Templates', 'No hay templates disponibles en este servidor.', [
          { name: '💡 Solución', value: 'Usa `/template create` para crear tu primer template.' },
        ])],
        flags: MessageFlags.Ephemeral,
      });
    }
    const text = templates.map((template, index) => `**${index + 1}.** ${template.title}`).join('\n');
    return safeReply(interaction, {
      embeds: [createSuccessEmbed('📋 Templates Disponibles', `Se encontraron ${templates.length} template(s).`, [
        { name: '📄 Lista de Templates', value: text.length > 1024 ? `${text.slice(0, 1021)}...` : text },
      ])],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('[ERROR] template list:', error);
    return safeReply(interaction, { embeds: [createErrorEmbed('Error al Listar Templates', 'No se pudieron obtener los templates del servidor.')], flags: MessageFlags.Ephemeral });
  }
};

const executeClone = async (interaction) => {
  try {
    await deferEphemeral(interaction);
    if (!await ensureAccess(interaction)) return;
    const sourceName = interaction.options.getString('template', true);
    const targetName = interaction.options.getString('name', true);
    const result = await crud.clone({ guildId: interaction.guild.id, guildName: interaction.guild.name, sourceName, targetName });
    if (result.status === 'not-found') return safeReply(interaction, { embeds: [createErrorEmbed('Template No Encontrado', `No se encontró el template "${sourceName}".`)] });
    if (result.status === 'conflict') return safeReply(interaction, { embeds: [createErrorEmbed('Nombre Ya Existe', `Ya existe un template con el nombre "${targetName}".`)] });
    return safeReply(interaction, {
      embeds: [createSuccessEmbed('Template Clonado', `Se creó "${result.template.title}" a partir de "${result.source.title}".`)],
    });
  } catch (error) {
    console.error('[ERROR] template clone:', error);
    const message = error instanceof TemplateTransferError ? error.message : 'Hubo un error al clonar el template.';
    return safeReply(interaction, { embeds: [createErrorEmbed('Error al Clonar', message)], flags: MessageFlags.Ephemeral });
  }
};

const executeRename = async (interaction) => {
  try {
    await deferEphemeral(interaction);
    if (!await ensureAccess(interaction)) return;
    const currentName = interaction.options.getString('template', true);
    const targetName = interaction.options.getString('new_template_name', true);
    const result = await crud.rename({ guildId: interaction.guild.id, currentName, targetName });
    if (result.status === 'not-found') return safeReply(interaction, { embeds: [createErrorEmbed('Template No Encontrado', `No existe un template llamado "${currentName}".`)], flags: MessageFlags.Ephemeral });
    if (result.status === 'conflict') return safeReply(interaction, { embeds: [createErrorEmbed('Título Ya en Uso', `El título "${targetName}" ya está en uso.`)], flags: MessageFlags.Ephemeral });
    if (result.status === 'unchanged') return safeReply(interaction, { embeds: [createInfoEmbed('Sin cambios', 'El template ya tenía ese nombre.')], flags: MessageFlags.Ephemeral });
    return safeReply(interaction, { embeds: [createSuccessEmbed('Template Renombrado', `"${currentName}" ahora se llama "${result.template.title}".`)], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('[ERROR] template rename:', error);
    const message = error instanceof TemplateTransferError ? error.message : 'Hubo un error al renombrar el template.';
    return safeReply(interaction, { embeds: [createErrorEmbed('Error al Renombrar', message)], flags: MessageFlags.Ephemeral });
  }
};

const executeExport = async (interaction) => {
  try {
    await deferEphemeral(interaction);
    if (!await ensureAccess(interaction)) return;
    const templateName = interaction.options.getString('template', true);
    const exported = await crud.exportTemplate({ guildId: interaction.guild.id, templateName });
    if (!exported) return safeReply(interaction, { embeds: [createErrorEmbed('Template No Encontrado', `No existe un template llamado "${templateName}".`)], flags: MessageFlags.Ephemeral });
    const attachment = new AttachmentBuilder(Buffer.from(exported.content, 'utf8'), { name: exported.fileName });
    return safeReply(interaction, {
      embeds: [createSuccessEmbed('Template Exportado', `El template "${exported.template.title}" fue exportado.`, [
        { name: 'Archivo', value: exported.fileName, inline: true },
        { name: 'Tamaño', value: `${Math.round(exported.bytes / 10.24) / 100} KB`, inline: true },
      ])],
      files: [attachment],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('[ERROR] template export:', error);
    return safeReply(interaction, { embeds: [createErrorEmbed('Error de Exportación', 'Hubo un error al exportar el template.')], flags: MessageFlags.Ephemeral });
  }
};

const executeImport = async (interaction) => {
  try {
    await deferEphemeral(interaction);
    if (!await ensureAccess(interaction)) return;
    const attachment = interaction.options.getAttachment('json', true);
    const templateName = interaction.options.getString('template_name', true);
    const result = await crud.importTemplate({ guildId: interaction.guild.id, guildName: interaction.guild.name, templateName, attachment });
    if (result.status === 'conflict') return safeReply(interaction, { embeds: [createErrorEmbed('Template Ya Existe', `Ya existe un template llamado "${templateName}".`)] });
    return safeReply(interaction, { embeds: [createSuccessEmbed('Template Importado', `El template "${result.template.title}" fue importado correctamente.`)] });
  } catch (error) {
    console.error('[ERROR] template import:', error);
    const message = error instanceof TemplateTransferError ? error.message : 'Hubo un error al importar el template.';
    return safeReply(interaction, { embeds: [createErrorEmbed('Error de Importación', message)], flags: MessageFlags.Ephemeral });
  }
};

const executeDelete = async (interaction) => {
  try {
    await deferEphemeral(interaction);
    if (!await ensureAccess(interaction)) return;
    const templateName = interaction.options.getString('template', true);
    const template = await crud.findByName({ guildId: interaction.guild.id, templateName });
    if (!template) return safeReply(interaction, { embeds: [createErrorEmbed('Template No Encontrado', `No existe un template llamado "${templateName}".`)] });
    return safeReply(interaction, {
      embeds: [createErrorEmbed('Confirmar eliminación', `¿Eliminar definitivamente **${template.title}**? Esta acción no se puede deshacer.`)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`template_delete_confirm_${template._id}`).setLabel('Sí, eliminar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`template_delete_cancel_${template._id}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
      )],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('[ERROR] template delete:', error);
    return safeReply(interaction, { embeds: [createErrorEmbed('Error al eliminar', 'No se pudo preparar la eliminación.')], flags: MessageFlags.Ephemeral });
  }
};

const handleDeleteInteraction = async (interaction) => {
  const customId = interaction.customId || '';
  const isCancel = customId.startsWith('template_delete_cancel_');
  const isConfirm = customId.startsWith('template_delete_confirm_');
  if (!isCancel && !isConfirm) return false;
  try {
    await deferEphemeral(interaction);
    if (!await ensureAccess(interaction)) return true;
    if (isCancel) {
      await safeReply(interaction, { embeds: [createInfoEmbed('Eliminación cancelada', 'La plantilla permanece intacta.')], components: [] });
      return true;
    }
    const templateId = customId.slice('template_delete_confirm_'.length);
    if (!/^[a-f\d]{24}$/i.test(templateId)) {
      await safeReply(interaction, {
        embeds: [createErrorEmbed('Panel inválido', 'Este botón de eliminación ya no es válido. Ejecuta `/template delete` de nuevo.')],
        components: [],
      });
      return true;
    }
    const deleted = await crud.deleteTemplate({ guildId: interaction.guild.id, templateId });
    await safeReply(interaction, {
      embeds: [deleted
        ? createSuccessEmbed('Plantilla eliminada', `Se eliminó **${deleted.title}** correctamente.`)
        : createErrorEmbed('Plantilla no encontrada', 'Ya no existe o pertenece a otro servidor.')],
      components: [],
    });
  } catch (error) {
    console.error('[ERROR] template delete interaction:', error);
    await safeReply(interaction, {
      embeds: [createErrorEmbed('Error al eliminar', 'No se pudo completar la eliminación. Vuelve a intentarlo.')],
      components: [],
      flags: MessageFlags.Ephemeral,
    });
  }
  return true;
};

const autocomplete = async (interaction) => {
  try {
    const subcommand = interaction.options.getSubcommand();
    if (!['edit', 'delete', 'clone', 'export', 'rename'].includes(subcommand)) return;
    const choices = await crud.autocomplete({ guildId: interaction.guild.id, query: interaction.options.getFocused() });
    if (!interaction.responded && !interaction.deferred && !interaction.replied) await interaction.respond(choices);
  } catch (error) {
    console.error('[ERROR] template autocomplete:', error);
    if (!interaction.responded && !interaction.deferred && !interaction.replied) await interaction.respond([]).catch(() => {});
  }
};

module.exports = {
  autocomplete,
  executeClone,
  executeDelete,
  executeExport,
  executeImport,
  executeList,
  executeRename,
  handleDeleteInteraction,
};
