const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require("discord.js");
const { createTemplate } = require("../../services/templateService");
const { createSuccessEmbed, createErrorEmbed, createInfoEmbed, safeReply } = require("../../utils/errorEmbeds");
const { getTemplateCreationSessions, getSession, updateSession, deleteSession } = require("./template-sessions");
const { safeDeferUpdate } = require('../../utils/interaction');

/**
 * Maneja la navegación hacia atrás en el proceso
 */
async function handleBack(interaction) {
  const customId = interaction.customId;
  const sessionId = extractSessionId(customId);
  const session = getSession(sessionId);

  if (!session) {
    if (interaction.deferred || interaction.replied) return;
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: MessageFlags.Ephemeral });
  }

  await safeDeferUpdate(interaction);

  // Determinar a qué paso volver basado en el customId
  if (customId.includes('_roles_')) {
    // Volver al modal de configuración adicional
    session.step = 'additional_config';
    await showAdditionalConfigModal(interaction, sessionId);
  } else if (customId.includes('_weapons_')) {
    // Volver al inicio (ya no hay selección de roles)
    if (interaction.deferred || interaction.replied) return;
    return await interaction.reply({
      content: 'Para modificar la información básica, cancela y reinicia el proceso con `/template create`.',
      flags: MessageFlags.Ephemeral
    });
  } else if (customId.includes('_category_')) {
    // Volver a la selección de categorías
    const { showWeaponCategorySelection } = require('./template-create-handlers');
    await showWeaponCategorySelection(interaction, sessionId);
  } else if (customId.includes('_summary_')) {
    // Volver a la configuración de armas
    const { showWeaponCategorySelection } = require('./template-create-handlers');
    await showWeaponCategorySelection(interaction, sessionId);
  }
}

/**
 * Maneja la continuación del proceso
 */
async function handleContinue(interaction) {
  const customId = interaction.customId;
  const sessionId = extractSessionId(customId);
  const session = getSession(sessionId);

  if (!session) {
    if (interaction.deferred || interaction.replied) return;
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: MessageFlags.Ephemeral });
  }

  await safeDeferUpdate(interaction);

  if (customId.includes('_roles_')) {
    if (session.isEdit) {
      // Es una sesión de edición, volver al editor principal
      const templateModule = require('../../commands/utility/template');

      // Limpiar sesión temporal de creación
      deleteSession(sessionId);

      // Volver al editor principal
      await templateModule.showEditOverview(interaction, sessionId);
    } else {
      // Continuar a la configuración de armas en creación normal
      session.step = 'weapon_categories';
      const { showWeaponCategorySelection } = require('./template-create-handlers');
      await showWeaponCategorySelection(interaction, sessionId);
    }
  } else if (customId.includes('_weapons_') || customId.includes('template_continue_')) {
    if (session.isEdit) {
      // Es una sesión de edición, sincronizar armas y volver al editor
      const templateModule = require('../../commands/utility/template');
      await templateModule.syncFromCreationToEdit(sessionId, {
        weapons: session.data.weapons
      });

      // Limpiar sesión temporal de creación
      deleteSession(sessionId);

      // Volver al editor principal
      await templateModule.showEditOverview(interaction, sessionId);
    } else {
      // Continuar al resumen final en creación normal
      await showFinalSummary(interaction, sessionId);
    }
  }
}

/**
 * Maneja la paginación de páginas
 */
async function handlePagination(interaction) {
  const customId = interaction.customId;
  const sessionId = extractSessionId(customId);
  const session = getSession(sessionId);

  if (!session) {
    if (interaction.deferred || interaction.replied) return;
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: MessageFlags.Ephemeral });
  }

  await safeDeferUpdate(interaction);

  if (customId.includes('_prev_page_')) {
    updateSession(sessionId, { weaponPage: Math.max(0, (session.weaponPage || 0) - 1) });
  } else if (customId.includes('_next_page_')) {
    updateSession(sessionId, { weaponPage: (session.weaponPage || 0) + 1 });
  } else if (customId.includes('_prev_weapon_page_')) {
    updateSession(sessionId, { weaponSelectionPage: Math.max(0, (session.weaponSelectionPage || 0) - 1) });
  } else if (customId.includes('_next_weapon_page_')) {
    updateSession(sessionId, { weaponSelectionPage: (session.weaponSelectionPage || 0) + 1 });
  }

  if (customId.includes('_weapon_page_')) {
    const { showWeaponSelection } = require('./template-create-handlers');
    await showWeaponSelection(interaction, sessionId, session.selectedCategory);
  } else {
    const { showWeaponCategorySelection } = require('./template-create-handlers');
    await showWeaponCategorySelection(interaction, sessionId);
  }
}

/**
 * Muestra el resumen final antes de crear el template
 */
async function showFinalSummary(interaction, sessionId) {
  const session = getSession(sessionId);

  if (!session) {
    if (interaction.deferred || interaction.replied) return;
    return await interaction.followUp({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: MessageFlags.Ephemeral });
  }

  const { data } = session;

  // Crear embed de resumen
  const embed = new EmbedBuilder()
    .setTitle('📋 Resumen del Template - Finalización')
    .setDescription('Revisa la configuración antes de crear el template.')
    .setColor(0x00FFFF)
    .addFields([
      {
        name: '📝 Información Básica',
        value: [
          `**Título:** ${data.title}`,
          `**Imagen:** ${data.image ? 'Configurada' : 'Imagen por defecto'}`
        ].join('\n'),
        inline: false
      },
      {
        name: '📝 Descripción',
        value: data.description.length > 100
          ? data.description.substring(0, 100) + '...'
          : data.description,
        inline: false
      }
    ]);

  // Agregar imagen si está configurada
  if (data.image) {
    embed.setThumbnail(data.image);
  }

  // Agregar información de armas si hay configuradas
  if (Object.keys(data.weapons).length > 0) {
    const weaponInfo = Object.entries(data.weapons)
      .map(([key, weapon]) => {
        // Formatear el emoji del grupo
        const groupEmoji = weapon.defaultEmoji ?
          (weapon.defaultEmoji.match(/^\d+$/) ? `<:emoji:${weapon.defaultEmoji}>` : weapon.defaultEmoji) :
          '⚔️';
        return `${groupEmoji} **${weapon.displayName}** (${weapon.data.length} armas, ${weapon.data[0].units} slots)`;
      })
      .join('\n');

    embed.addFields([
      {
        name: '⚔️ Grupos de Armas Configurados',
        value: weaponInfo,
        inline: false
      }
    ]);
  }

  if (data.image) {
    embed.setImage(data.image);
  }

  // Botones de acción
  const confirmButton = new ButtonBuilder()
    .setCustomId(`template_confirm_${sessionId}`)
    .setLabel('Crear Template')
    .setStyle(ButtonStyle.Success)
    .setEmoji('✅');

  const backButton = new ButtonBuilder()
    .setCustomId(`template_back_summary_${sessionId}`)
    .setLabel('Volver a Armas')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⬅️');

  const cancelButton = new ButtonBuilder()
    .setCustomId(`template_cancel_${sessionId}`)
    .setLabel('Cancelar')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('❌');

  const actionRow = new ActionRowBuilder().addComponents(backButton, cancelButton, confirmButton);

  const method = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
  await interaction[method]({
    embeds: [embed],
    components: [actionRow],
    flags: MessageFlags.Ephemeral
  });
}

/**
 * Maneja la confirmación final y crea el template
 */
async function handleConfirm(interaction) {
  console.log('[DEBUG] handleConfirm: Starting template creation');
  const sessionId = interaction.customId.replace('template_confirm_', '');
  console.log('[DEBUG] handleConfirm: Extracted sessionId:', sessionId);

  const session = getSession(sessionId);
  console.log('[DEBUG] handleConfirm: Session found:', !!session);

  if (!session) {
    console.log('[ERROR] handleConfirm: No session found');
    if (interaction.deferred || interaction.replied) return;
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: MessageFlags.Ephemeral });
  }

  try {
    console.log('[DEBUG] handleConfirm: Deferring update');
    await safeDeferUpdate(interaction);

    console.log('[DEBUG] handleConfirm: Session data:', {
      title: session.data.title,
      weaponsCount: Object.keys(session.data.weapons).length,
      weaponsKeys: Object.keys(session.data.weapons)
    });

    // Validar que hay al menos un grupo de armas configurado
    if (Object.keys(session.data.weapons).length === 0) {
      const errorEmbed = createErrorEmbed(
        'Error de Validación',
        'Debes configurar al menos un grupo de armas para crear el template.'
      );
      return await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }

    // Crear el template en la base de datos
    const templateData = {
      title: session.data.title,
      description: session.data.description,
      image: session.data.image,
      weapons: session.data.weapons
    };

    console.log('[DEBUG] handleConfirm: Template data prepared:', JSON.stringify(templateData, null, 2));
    console.log('[DEBUG] handleConfirm: Guild ID:', session.guildId);

    const createdTemplate = await createTemplate(templateData, session.guildId);
    console.log('[DEBUG] handleConfirm: Template created successfully:', createdTemplate._id);

    // Limpiar la sesión
    deleteSession(sessionId);

    // Mostrar éxito
    const successEmbed = createSuccessEmbed(
      'Template Creado',
      `El template "${session.data.title}" se ha creado exitosamente.`,
      [
        {
          name: '🎯 ¿Qué sigue?',
          value: 'Ahora puedes usar este template con el comando `/raid` seleccionando su nombre.',
          inline: false
        },
        {
          name: '⚙️ Modificaciones',
          value: 'Si necesitas modificar este template, usa el comando `/template-edit`.',
          inline: false
        }
      ]
    );

    await interaction.editReply({
      embeds: [successEmbed],
      components: []
    });

  } catch (error) {
    console.error('[ERROR] Error al crear template:', error);

    const errorEmbed = createErrorEmbed(
      'Error al Crear Template',
      'Ocurrió un error al guardar el template en la base de datos.',
      [
        {
          name: '🔧 Solución',
          value: 'Intenta nuevamente o contacta a un administrador si el problema persiste.',
          inline: false
        }
      ]
    );

    await interaction.editReply({
      embeds: [errorEmbed],
      components: []
    });
  }
}

/**
 * Maneja la cancelación del proceso
 */
async function handleCancel(interaction) {
  // Usar la función extractSessionId para extraer el sessionId de manera consistente
  const sessionId = extractSessionId(interaction.customId);

  if (!sessionId) {
    if (interaction.deferred || interaction.replied) return;
    return await interaction.reply({ content: 'Error al identificar la sesión.', flags: MessageFlags.Ephemeral });
  }

  console.log(`[DEBUG] handleCancel: Deleting session ${sessionId}`);

  // Limpiar la sesión
  const wasDeleted = deleteSession(sessionId);
  console.log(`[DEBUG] handleCancel: Session ${sessionId} deleted: ${wasDeleted}`);

  const cancelEmbed = createInfoEmbed(
    'Proceso Cancelado',
    'La creación del template se ha cancelado. Ningún dato se ha guardado.'
  );

  await interaction.update({
    embeds: [cancelEmbed],
    components: []
  });
}

/**
 * Maneja el envío del modal de configuración adicional
 */
async function handleAdditionalConfigSubmit(interaction) {
  const sessionId = interaction.customId.replace('template_additional_config_', '');
  const session = getSession(sessionId);

  if (!session) {
    if (interaction.deferred || interaction.replied) return;
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: MessageFlags.Ephemeral });
  }

  // Obtener valores del modal
  const image = interaction.fields.getTextInputValue('image') || '';
  const reminder = interaction.fields.getTextInputValue('reminder') || '5m';

  // Validar formato del recordatorio
  if (reminder && !isValidTimeFormat(reminder)) {
    if (interaction.deferred || interaction.replied) return;
    return await interaction.reply({
      content: 'El formato del recordatorio no es válido. Usa formatos como: 5m, 10m, 15m, 30m, 1h, etc.',
      flags: MessageFlags.Ephemeral
    });
  }

  // Esta función ya no se usa con el nuevo flujo simplificado
  if (interaction.deferred || interaction.replied) return;
  return await interaction.reply({
    content: 'Esta función ya no está disponible. Usa `/template create` para crear un template.',
    flags: MessageFlags.Ephemeral
  });
}

/**
 * Valida el formato de tiempo para recordatorios
 */
function isValidTimeFormat(time) {
  const timeRegex = /^\d+[mh]$/;
  return timeRegex.test(time);
}

/**
 * Extrae el sessionId de un customId
 * Maneja consistentemente la extracción de sessionId para todos los tipos de customIds
 */
function extractSessionId(customId) {
  console.log(`[DEBUG] extractSessionId recibió: ${customId}`);

  // Prefijos conocidos - ordenados de más específico a menos específico
  const knownPrefixes = [
    'group_edit_back_to_edit_',
    'group_edit_add_weapons_',
    'group_edit_remove_weapons_',
    'group_edit_finish_',
    'group_edit_back_',
    'group_remove_weapons_',
    'template_continue_config_',
    'template_additional_config_',
    'template_single_weapon_config_',
    'template_add_weapon_group_',
    'template_basic_weapon_group_',
    'template_emoji_category_',
    'template_weapon_category_',
    'template_emoji_weapon_',
    'template_weapon_selection_',
    'template_weapon_config_',
    'template_group_config_',
    'template_multi_category_',
    'template_finish_weapons_',
    'template_finish_group_',
    'template_add_weapons_',
    'template_continue_',
    'template_roles_',
    'template_weapons_',
    'template_confirm_',
    'template_cancel_group_',
    'template_cancel_'
  ];

  // Caso especial para weapon_config que tiene un formato diferente (template_weapon_config_sessionId_weaponId)
  if (customId.startsWith('template_weapon_config_')) {
    const parts = customId.split('_');
    // Si tiene suficientes partes (template_weapon_config_sessionId_weaponId)
    if (parts.length >= 4) {
      // El sessionId será todas las partes excepto la última (que es el weaponId) y las primeras 3 (template_weapon_config)
      const sessionIdParts = parts.slice(3, -1);
      const sessionId = sessionIdParts.join('_');
      console.log(`[DEBUG] extractSessionId caso especial para weapon_config: ${sessionId}`);
      return sessionId;
    }
  }

  // Intentamos encontrar un prefijo que coincida para los casos normales
  for (const prefix of knownPrefixes) {
    if (customId.startsWith(prefix)) {
      const extracted = customId.replace(prefix, '');
      console.log(`[DEBUG] extractSessionId encontró prefijo ${prefix}, extrajo: ${extracted}`);
      return extracted;
    }
  }

  // Fallback: Si no encontramos un prefijo conocido, usamos la última parte del customId
  const parts = customId.split('_');
  const extracted = parts[parts.length - 1];
  console.log(`[DEBUG] extractSessionId no encontró prefijo conocido, usando última parte: ${extracted}`);
  return extracted;
}

/**
 * Modal auxiliar para mostrar configuración adicional (usado en navegación hacia atrás)
 */
async function showAdditionalConfigModal(interaction, sessionId) {
  try {
    console.log('🔄 showAdditionalConfigModal iniciando con sessionId:', sessionId);

    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

    const session = getSession(sessionId);
    if (!session) {
      console.error('❌ Sesión no encontrada para sessionId:', sessionId);
      throw new Error('Sesión expirada');
    }

    console.log('✅ Sesión encontrada:', session);

    const data = session.data || {};

    const modal = new ModalBuilder()
      .setCustomId(`template_additional_config_${sessionId}`)
      .setTitle('Crear Template - Configuración Adicional');

    const imageInput = new TextInputBuilder()
      .setCustomId('image')
      .setLabel('URL de la imagen del template (opcional)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(500)
      .setPlaceholder('https://ejemplo.com/imagen.png')
      .setValue(data.image || '');

    const reminderInput = new TextInputBuilder()
      .setCustomId('reminder')
      .setLabel('Tiempo de recordatorio')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(20)
      .setPlaceholder('5m, 10m, 15m, 30m')
      .setValue(data.reminder || '5m');

    modal.addComponents(
      new ActionRowBuilder().addComponents(imageInput),
      new ActionRowBuilder().addComponents(reminderInput)
    );

    console.log('🔄 Mostrando modal adicional...');
    await interaction.showModal(modal);
    console.log('✅ Modal mostrado exitosamente');

  } catch (error) {
    console.error('❌ Error en showAdditionalConfigModal:', error);
    throw error;
  }
}

module.exports = {
  handleBack,
  handleContinue,
  handlePagination,
  handleConfirm,
  handleCancel,
  handleAdditionalConfigSubmit,
  showFinalSummary,
  showAdditionalConfigModal,
  extractSessionId
};