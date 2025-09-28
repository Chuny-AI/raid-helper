const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { createTemplate, updateTemplate } = require("../../services/templateService");
const { getAllWeapons, getWeaponCategories } = require("../../services/weaponService");
const { createSuccessEmbed, createErrorEmbed, createInfoEmbed, safeReply } = require("../../utils/errorEmbeds");
const { getTemplateCreationSessions, getSession, updateSession, findSessionByUser, findSessionByCriteria } = require("./template-sessions");
const { extractSessionId } = require("./template-create-navigation");
const fs = require('fs');
const path = require('path');

/**
 * Función auxiliar para extraer el sessionId de forma consistente
 * Usa la función extractSessionId centralizada para todos los handlers
 */
function getSessionIdFromInteraction(interaction) {
  const sessionId = extractSessionId(interaction.customId);
  console.log(`[DEBUG] getSessionIdFromInteraction: CustomID=${interaction.customId}, SessionID=${sessionId}`);

  // Verifica que el sessionId sea válido para detectar problemas
  if (!sessionId) {
    console.error(`[ERROR] No se pudo extraer sessionId de customId: ${interaction.customId}`);
    return null;
  }

  return sessionId;
}

/**
 * Función auxiliar para formatear correctamente los IDs de emoji de Discord
 */
function formatEmoji(emojiId, fallback = '⚔️') {
  if (!emojiId) return fallback;

  // Si ya es un emoji Unicode estándar, devolverlo tal como está
  if (emojiId.length <= 4) return emojiId;

  // Si es un ID numérico, formatearlo como emoji personalizado
  if (emojiId.match(/^\d+$/)) {
    return emojiId; // Discord maneja automáticamente IDs numéricos en select menus
  }

  // Si ya está formateado, devolverlo tal como está
  if (emojiId.startsWith('<:') || emojiId.startsWith('<a:')) {
    return emojiId;
  }

  // Fallback
  return fallback;
}

/**
 * Función auxiliar para generar customIds cortos para evitar el límite de 100 caracteres
 */
function generateShortCustomId(prefix, sessionId, suffix = '') {
  // Si el sessionId es muy largo, usar solo una parte única
  let shortSessionId = sessionId;
  if (sessionId.length > 50) {
    // Usar los últimos 20 caracteres que suelen contener el timestamp único
    shortSessionId = sessionId.slice(-20);
  }

  const customId = suffix ? `${prefix}_${shortSessionId}_${suffix}` : `${prefix}_${shortSessionId}`;

  // Verificar que no exceda el límite de Discord (100 caracteres)
  if (customId.length > 100) {
    // Recortar más el sessionId si es necesario
    const availableLength = 100 - prefix.length - (suffix ? suffix.length + 2 : 1); // -2 por los guiones bajos
    shortSessionId = sessionId.slice(-Math.max(10, availableLength));
    return suffix ? `${prefix}_${shortSessionId}_${suffix}` : `${prefix}_${shortSessionId}`;
  }

  return customId;
}



/**
 * Función auxiliar para obtener armas con respaldo del archivo JSON
 */
async function getWeaponsWithFallback() {
  try {
    // Intentar primero desde la base de datos
    const dbWeapons = await getAllWeapons();
    console.log(`[DEBUG] getWeaponsWithFallback: Found ${dbWeapons.length} weapons in database`);

    if (dbWeapons.length > 0) {
      return dbWeapons;
    }

    // Si no hay armas en la base de datos, leer desde el archivo JSON
    console.log(`[DEBUG] getWeaponsWithFallback: No weapons in database, trying JSON file`);
    const weaponsFilePath = path.join(__dirname, '../../weapons/weapons.json');

    if (!fs.existsSync(weaponsFilePath)) {
      console.log(`[ERROR] getWeaponsWithFallback: JSON file not found at ${weaponsFilePath}`);
      return [];
    }

    const weaponsData = JSON.parse(fs.readFileSync(weaponsFilePath, 'utf8'));
    const weapons = [];

    // Convertir el formato JSON al formato esperado
    for (const [category, categoryData] of Object.entries(weaponsData.weapons)) {
      for (const weaponData of categoryData.data) {
        weapons.push({
          emojiId: weaponData.emoji || weaponData.emojiId || `emoji_${category}_${weaponData.name.replace(/\s/g, '_')}`,
          name: weaponData.name,
          category: category,
          categoryDisplayName: categoryData.displayName,
          categoryDefaultEmoji: categoryData.defaultEmoji,
          isActive: true
        });
      }
    }

    console.log(`[DEBUG] getWeaponsWithFallback: Loaded ${weapons.length} weapons from JSON file`);
    return weapons;

  } catch (error) {
    console.error('[ERROR] getWeaponsWithFallback:', error);
    return [];
  }
}

/**
 * Función auxiliar para obtener categorías de armas con respaldo del archivo JSON
 */
async function getWeaponCategoriesWithFallback() {
  try {
    // Intentar primero desde la base de datos
    const dbCategories = await getWeaponCategories();
    console.log(`[DEBUG] getWeaponCategoriesWithFallback: Found ${dbCategories.length} categories in database`);

    if (dbCategories.length > 0) {
      return dbCategories;
    }

    // Si no hay categorías en la base de datos, leer desde el archivo JSON
    console.log(`[DEBUG] getWeaponCategoriesWithFallback: No categories in database, trying JSON file`);
    const weaponsFilePath = path.join(__dirname, '../../weapons/weapons.json');

    if (!fs.existsSync(weaponsFilePath)) {
      console.log(`[ERROR] getWeaponCategoriesWithFallback: JSON file not found at ${weaponsFilePath}`);
      return [];
    }

    const weaponsData = JSON.parse(fs.readFileSync(weaponsFilePath, 'utf8'));
    const categories = [];

    // Extraer categorías del formato JSON
    for (const [category, categoryData] of Object.entries(weaponsData.weapons)) {
      categories.push({
        key: category,
        displayName: categoryData.displayName,
        defaultEmoji: categoryData.defaultEmoji
      });
    }

    console.log(`[DEBUG] getWeaponCategoriesWithFallback: Loaded ${categories.length} categories from JSON file`);
    return categories;

  } catch (error) {
    console.error('[ERROR] getWeaponCategoriesWithFallback:', error);
    return [];
  }
}

/**
 * Maneja el envío del modal de configuración adicional
 */
async function handleAdditionalConfigSubmit(interaction) {
  // Usar la función extractSessionId para mantener consistencia
  const { extractSessionId } = require('./template-create-navigation');
  const sessionId = extractSessionId(interaction.customId);
  console.log(`[DEBUG] handleAdditionalConfigSubmit: sessionId=${sessionId} (original customId=${interaction.customId})`);

  const session = getSession(sessionId);
  console.log(`[DEBUG] Session found:`, !!session);

  if (!session) {
    console.log(`[DEBUG] No session found for ${sessionId}`);
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: 64 });
  }

  console.log(`[DEBUG] Session data:`, session);

  // Obtener valores del modal (incluyendo imagen si está presente)
  const reminder = interaction.fields.getTextInputValue('reminder') || '5m';
  const notifyAllRaw = (interaction.fields.getTextInputValue('notifyAll') || '').toLowerCase().trim();
  const notifyAll = ['si', 'sí', 's', 'yes', 'y', 'true', '1'].includes(notifyAllRaw);

  // Intentar obtener la imagen si existe en el modal
  let image = session.data.image;
  try {
    const imageField = interaction.fields.getTextInputValue('image');
    if (imageField) {
      image = imageField;
    }
  } catch (error) {
    // El campo image no existe en este modal, mantener el valor existente
  }

  // Actualizar datos de la sesión
  updateSession(sessionId, {
    data: {
      ...session.data,
      image: image,
      reminder: reminder,
      notifyAll: notifyAll
    },
    step: 'role_selection'
  });

  // Mostrar selección de roles
  await showRoleSelection(interaction, sessionId);
}

/**
 * Muestra la selección de roles del servidor
 */
async function showRoleSelection(interaction, sessionId) {
  console.log(`[DEBUG] showRoleSelection: sessionId=${sessionId}`);

  // Verificar sesión antes de proceder
  let session = getSession(sessionId);
  if (!session) {
    console.log(`[DEBUG] Session lost in showRoleSelection for ${sessionId}`);

    // Intentar recuperar la sesión por usuario
    const recovered = findSessionByUser(interaction.user.id, interaction.guild.id);
    if (recovered && recovered.session.step === 'role_selection') {
      console.log(`[DEBUG] Recovered session: ${recovered.sessionId}`);
      session = recovered.session;
      // Actualizar el sessionId para futuras referencias
      sessionId = recovered.sessionId;
    } else {
      return await interaction.reply({
        content: '❌ Sesión perdida y no se pudo recuperar. Por favor, usa `/template-create` para empezar de nuevo.',
        flags: 64
      });
    }
  }

  const guild = interaction.guild;
  const roles = guild.roles.cache
    .filter(role => !role.managed && role.id !== guild.id) // Excluir roles de bots y @everyone
    .sort((a, b) => b.position - a.position)
    .first(25); // Límite de Discord para select menus

  if (roles.length === 0) {
    // Si no hay roles, saltar a configuración de armas
    updateSession(sessionId, { step: 'weapon_categories' });
    console.log('[DEBUG] showRoleSelection: No roles found, skipping directly to weapon selection');
    try {
      return await showWeaponCategorySelection(interaction, sessionId);
    } catch (error) {
      console.error('[ERROR] Error al transicionar a selección de armas:', error);
      if (!interaction.replied && !interaction.deferred) {
        return await interaction.reply({
          content: "Ha ocurrido un error al cargar la configuración de armas. Por favor, inténtalo nuevamente con `/template create`.",
          ephemeral: true
        });
      }
    }
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`template_roles_${sessionId}`)
    .setPlaceholder('Selecciona los roles que serán notificados del evento')
    .setMinValues(0)
    .setMaxValues(Math.min(roles.length, 25))
    .addOptions(roles.map(role => ({
      label: role.name,
      value: role.id,
      description: `Posición: ${role.position}`
    })));

  // Crear embed informativo con progreso
  const totalSteps = 3;
  const currentStep = 2;

  const embed = new EmbedBuilder()
    .setTitle(`🎭 Configuración de Template - Paso ${currentStep}/${totalSteps}`)
    .setDescription(`**Selección de Roles**\n\nElige qué roles pueden usar este template para crear raids.`)
    .setColor(0x00FFFF)
    .addFields([
      {
        name: '📋 Template actual',
        value: `**Título:** ${session.data.title}\n**Descripción:** ${session.data.description}`,
        inline: false
      },
      {
        name: '🔒 Control de Acceso',
        value: '• Si seleccionas roles, solo esos roles podrán usar el template\n• Si no seleccionas ninguno, cualquiera podrá usarlo\n• Puedes seleccionar múltiples roles',
        inline: false
      },
      {
        name: '📊 Progreso',
        value: `✅ Información básica\n🔄 **Selección de roles** (paso actual)\n⏳ Configuración de armas`,
        inline: false
      }
    ]);

  // Agregar imagen del template si existe
  if (session.data.image) {
    embed.setThumbnail(session.data.image);
  }

  const continueButton = new ButtonBuilder()
    .setCustomId(`template_continue_roles_${sessionId}`)
    .setLabel('Continuar a Armas')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('⚔️');

  const skipRolesButton = new ButtonBuilder()
    .setCustomId(`template_skip_roles_${sessionId}`)
    .setLabel('Saltar (Sin restricciones)')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏭️');

  const backButton = new ButtonBuilder()
    .setCustomId(`template_back_roles_${sessionId}`)
    .setLabel('Volver')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⬅️');

  const actionRow1 = new ActionRowBuilder().addComponents(selectMenu);
  const actionRow2 = new ActionRowBuilder().addComponents(backButton, skipRolesButton, continueButton);

  // Manejar la respuesta según el tipo de interacción
  console.log('[DEBUG] showRoleSelection: interaction state:', {
    isFromModal: interaction.isModalSubmit(),
    deferred: interaction.deferred,
    replied: interaction.replied
  });

  try {
    // Para interacciones de modal, siempre usar reply ya que no se han respondido todavía
    if (interaction.isModalSubmit()) {
      await interaction.reply({
        embeds: [embed],
        components: [actionRow1, actionRow2],
        ephemeral: true
      });
      console.log('[DEBUG] showRoleSelection: Modal submit interaction replied successfully');
    }
    // Para otras interacciones, usar editReply si están diferidas, o reply si no
    else if (interaction.deferred) {
      await interaction.editReply({
        embeds: [embed],
        components: [actionRow1, actionRow2]
      });
      console.log('[DEBUG] showRoleSelection: Deferred interaction edited successfully');
    } else {
      await interaction.reply({
        embeds: [embed],
        components: [actionRow1, actionRow2],
        ephemeral: true
      });
      console.log('[DEBUG] showRoleSelection: Standard interaction replied successfully');
    }
  } catch (error) {
    console.error('[ERROR] showRoleSelection: Failed to respond:', error);

    // Intento de fallback
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "⚠️ Ha ocurrido un error en la selección de roles. Intenta nuevamente con `/template create`.",
          ephemeral: true
        });
      }
    } catch (fallbackError) {
      console.error('[ERROR] showRoleSelection: Fallback also failed:', fallbackError);
    }
  }
}

/**
 * Maneja la selección de roles
 */
async function handleRoleSelection(interaction) {
  console.log(`[DEBUG] handleRoleSelection: customId=${interaction.customId}`);
  const sessionId = getSessionIdFromInteraction(interaction);
  console.log(`[DEBUG] handleRoleSelection: extracted sessionId=${sessionId}`);

  let session = getSession(sessionId);

  if (!session) {
    console.log(`[DEBUG] handleRoleSelection: No session found for ${sessionId}, attempting recovery`);

    // Intentar recuperar por usuario y paso
    const recovered = findSessionByCriteria(interaction.user.id, interaction.guild.id, 'role_selection');
    if (recovered) {
      console.log(`[DEBUG] handleRoleSelection: Recovered session ${recovered.sessionId}`);
      session = recovered.session;
      sessionId = recovered.sessionId;
    } else {
      // Intentar recuperar cualquier sesión del usuario
      const anySession = findSessionByUser(interaction.user.id, interaction.guild.id);
      if (anySession) {
        console.log(`[DEBUG] handleRoleSelection: Found user session in step ${anySession.session.step}, updating to role_selection`);
        updateSession(anySession.sessionId, { step: 'role_selection' });
        session = anySession.session;
        sessionId = anySession.sessionId;
      } else {
        console.log(`[DEBUG] handleRoleSelection: No recoverable session found`);
        return await interaction.reply({ content: '❌ Sesión expirada. Por favor, usa `/template-create` para empezar de nuevo.', flags: 64 });
      }
    }
  }

  updateSession(sessionId, {
    data: { ...session.data, roles: interaction.values || [] },
    step: 'weapon_categories'
  });

  await interaction.deferUpdate();
  await showWeaponCategorySelection(interaction, sessionId);
}

/**
 * Muestra la selección de categorías de armas
 */
async function showWeaponCategorySelection(interaction, sessionId) {
  try {
    console.log('[DEBUG] showWeaponCategorySelection: Starting');
    const session = getSession(sessionId);
    console.log('[DEBUG] showWeaponCategorySelection: Session found:', !!session);
    console.log('[DEBUG] showWeaponCategorySelection: Session content:', session);
    console.log('[DEBUG] showWeaponCategorySelection: Session.data exists:', !!session?.data);

    if (!session) {
      console.log('[ERROR] showWeaponCategorySelection: No session found');
      return await interaction.editReply({
        content: 'Sesión expirada. Inicia el proceso nuevamente.',
        components: [],
        embeds: []
      });
    }

    if (!session.data) {
      console.log('[ERROR] showWeaponCategorySelection: Session has no data property');
      return await interaction.editReply({
        content: 'Error en la sesión. Por favor inicia el proceso nuevamente.',
        components: [],
        embeds: []
      });
    }

    console.log('[DEBUG] showWeaponCategorySelection: Session data weapons:', session.data.weapons ? Object.keys(session.data.weapons) : 'none');

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Configuración de Template - Paso 2/2')
      .setDescription('**Configuración de Armas**\n\nAquí puedes agregar grupos de armas personalizados para tu template.')
      .setColor(0x00FFFF)
      .addFields([
        {
          name: '📋 Template actual',
          value: `**Título:** ${session.data.title}\n**Descripción:** ${session.data.description}`,
          inline: false
        },
        {
          name: 'Grupos Configurados',
          value: Object.keys(session.data.weapons).length > 0
            ? Object.keys(session.data.weapons).map(key => {
              const group = session.data.weapons[key];
              // Manejar ambos formatos: 'data' (nuevo) y 'weapons' (anterior)
              const weaponCount = group.data ? group.data.length : (group.weapons ? group.weapons.length : 0);
              // Formatear el emoji del grupo
              const groupEmoji = group.defaultEmoji ?
                (group.defaultEmoji.match(/^\d+$/) ? `<:emoji:${group.defaultEmoji}>` : group.defaultEmoji) :
                '⚔️';
              return `${groupEmoji} **${group.displayName}** (${weaponCount} armas)`;
            }).join('\n')
            : 'Ningún grupo configurado aún',
          inline: false
        },
        {
          name: '📊 Progreso',
          value: `✅ Información básica\n🔄 **Configuración de armas** (paso actual)`,
          inline: false
        },
        {
          name: 'ℹ️ Grupos de Armas Mixtos',
          value: 'Cada grupo puede contener armas de diferentes categorías (ej: DPS = maza + espada + arco)',
          inline: false
        }
      ]);

    // Agregar imagen del template si existe
    if (session.data.image) {
      embed.setThumbnail(session.data.image);
    }

    console.log('[DEBUG] showWeaponCategorySelection: Embed created successfully');

    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(generateShortCustomId('template_add_weapon_group', sessionId))
          .setLabel('Agregar Grupo de Armas')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('➕')
      )
    ];

    console.log('[DEBUG] showWeaponCategorySelection: Components created');

    // Si ya hay grupos configurados, mostrar botón para continuar
    if (Object.keys(session.data.weapons).length > 0) {
      const continueButtonCustomId = `template_finish_weapons_${sessionId}`;
      console.log('[DEBUG] showWeaponCategorySelection: Adding continue button with customId:', continueButtonCustomId);

      try {
        const continueButton = new ButtonBuilder()
          .setCustomId(continueButtonCustomId)
          .setLabel('Continuar')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅');

        components[0].addComponents(continueButton);
        console.log('[DEBUG] showWeaponCategorySelection: Continue button created and added successfully');
      } catch (buttonError) {
        console.error('[ERROR] showWeaponCategorySelection: Error creating continue button:', buttonError);
      }
    }

    console.log('[DEBUG] showWeaponCategorySelection: interaction state:', {
      deferred: interaction.deferred,
      replied: interaction.replied
    });

    console.log('[DEBUG] showWeaponCategorySelection: About to call editReply');

    // Validar que los componentes estén bien formados
    console.log('[DEBUG] showWeaponCategorySelection: Components validation:', {
      componentsLength: components.length,
      firstRowComponentsLength: components[0].components?.length || 0,
      componentTypes: components[0].components?.map(c => c.data?.type) || []
    });

    try {
      // Verificar el tipo de interacción y responder adecuadamente
      console.log('[DEBUG] showWeaponCategorySelection: Checking interaction type:', {
        isFromModal: interaction.isModalSubmit(),
        deferred: interaction.deferred,
        replied: interaction.replied
      });

      // Simplificar la lógica - si está diferida o ya respondida, usar editReply
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          embeds: [embed],
          components
        });
        console.log('[DEBUG] showWeaponCategorySelection: Deferred/replied interaction edited successfully');
      } else if ((interaction.isButton?.() || interaction.isStringSelectMenu?.()) && !interaction.deferred && !interaction.replied) {
        await interaction.update({
          embeds: [embed],
          components
        });
        console.log('[DEBUG] showWeaponCategorySelection: Component interaction updated successfully');
      } else {
        // Para otras interacciones no respondidas (modals, etc.)
        await interaction.reply({
          embeds: [embed],
          components,
          ephemeral: true
        });
        console.log('[DEBUG] showWeaponCategorySelection: Standard interaction replied successfully');
      }
    } catch (responseError) {
      console.error('[ERROR] showWeaponCategorySelection: Response failed:', responseError);

      // Intento de fallback más robusto
      try {
        console.log('[DEBUG] showWeaponCategorySelection: Trying fallback response');
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '⚠️ Ha ocurrido un error al mostrar la interfaz de armas. Por favor, usa `/template create` para empezar de nuevo.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.editReply({
            content: '⚠️ Ha ocurrido un error al mostrar la interfaz de armas. Por favor, usa `/template create` para empezar de nuevo.'
          });
        } else {
          await interaction.followUp({
            content: '⚠️ Ha ocurrido un error al mostrar la interfaz de armas. Por favor, usa `/template create` para empezar de nuevo.',
            ephemeral: true
          });
        }
      } catch (fallbackError) {
        console.error('[ERROR] showWeaponCategorySelection: All response methods failed:', fallbackError);
      }
    }
  } catch (error) {
    console.error('[ERROR] Error en showWeaponCategorySelection:', error);
    console.error('[ERROR] Error name:', error.name);
    console.error('[ERROR] Error message:', error.message);
    console.error('[ERROR] Error stack:', error.stack);
    console.error('[ERROR] Error code:', error.code);

    try {
      console.log('[DEBUG] showWeaponCategorySelection: Attempting error reply');

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: `Error interno: ${error.message || 'Error desconocido'}`,
          components: [],
          embeds: []
        });
      } else {
        await interaction.reply({
          content: `Error interno: ${error.message || 'Error desconocido'}`,
          ephemeral: true
        });
      }

      console.log('[DEBUG] showWeaponCategorySelection: Error reply sent successfully');
    } catch (replyError) {
      console.error('[ERROR] Error sending error reply in showWeaponCategorySelection:', replyError);
      console.error('[ERROR] ReplyError name:', replyError.name);
      console.error('[ERROR] ReplyError message:', replyError.message);
      console.error('[ERROR] ReplyError code:', replyError.code);
    }
  }
}

/**
 * Maneja el botón "Agregar Grupo de Armas"
 */
async function handleAddWeaponGroup(interaction) {
  const sessionId = getSessionIdFromInteraction(interaction);

  // Mostrar modal para configuración básica del grupo
  const modal = new ModalBuilder()
    .setCustomId(generateShortCustomId('template_basic_weapon_group', sessionId))
    .setTitle('Nuevo Grupo de Armas');

  const displayNameInput = new TextInputBuilder()
    .setCustomId('displayName')
    .setLabel('Nombre del grupo')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('Ej: DPS, Tanques, Support, Healers');

  modal.addComponents(
    new ActionRowBuilder().addComponents(displayNameInput)
  );

  await interaction.showModal(modal);
}

/**
 * Maneja el envío del modal de configuración básica del grupo
 */
async function handleBasicWeaponGroupSubmit(interaction) {
  const sessionId = getSessionIdFromInteraction(interaction);
  console.log('[DEBUG] handleBasicWeaponGroupSubmit: sessionId:', sessionId);

  const session = getSession(sessionId);
  console.log('[DEBUG] handleBasicWeaponGroupSubmit: session found:', !!session);

  if (!session) {
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: 64 });
  }

  const displayName = interaction.fields.getTextInputValue('displayName');
  console.log('[DEBUG] handleBasicWeaponGroupSubmit: displayName:', displayName);

  // Generar clave automática incremental
  const existingKeys = Object.keys(session.data.weapons || {});
  let weaponKey = 'group_1';
  let counter = 1;
  while (existingKeys.includes(weaponKey)) {
    counter++;
    weaponKey = `group_${counter}`;
  }

  console.log('[DEBUG] handleBasicWeaponGroupSubmit: generated weaponKey:', weaponKey);

  // Guardar configuración temporal del grupo
  const tempGroupConfig = {
    displayName,
    weaponKey,
    weapons: []
  };

  console.log('[DEBUG] handleBasicWeaponGroupSubmit: tempGroupConfig to save:', tempGroupConfig);

  const updatedSession = updateSession(sessionId, {
    tempGroupConfig
  });

  console.log('[DEBUG] handleBasicWeaponGroupSubmit: session updated:', !!updatedSession);
  console.log('[DEBUG] handleBasicWeaponGroupSubmit: updatedSession.tempGroupConfig:', updatedSession?.tempGroupConfig);

  await interaction.deferUpdate();
  await showEmojiCategorySelection(interaction, sessionId);
}

/**
 * Muestra la selección de categoría para elegir el emoji del grupo
 */
async function showEmojiCategorySelection(interaction, sessionId) {
  try {
    const categories = await getWeaponCategoriesWithFallback();
    const session = getSession(sessionId);

    if (!session) {
      console.error('[ERROR] showEmojiCategorySelection: No session found');
      return await interaction.editReply({ content: 'Sesión expirada. Inicia el proceso nuevamente.' });
    }

    if (!session.tempGroupConfig) {
      console.error('[ERROR] showEmojiCategorySelection: No tempGroupConfig found in session');
      return await interaction.editReply({ content: 'Error de configuración. Inicia el proceso nuevamente.' });
    }

    const groupName = session.tempGroupConfig.displayName || 'Nuevo Grupo';

    const embed = new EmbedBuilder()
      .setTitle('🎨 Seleccionar Emoji del Grupo')
      .setDescription(`Elige la categoría de arma para el emoji del grupo **${groupName}**`)
      .setColor(0x00FFFF)
      .addFields([
        {
          name: 'ℹ️ Selección de Emoji',
          value: 'El emoji que elijas representará este grupo en los botones del template',
          inline: false
        }
      ]);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(generateShortCustomId('template_emoji_category', sessionId))
      .setPlaceholder('Selecciona una categoría para el emoji')
      .addOptions(categories.slice(0, 25).map(category => {
        const opt = {
          label: category.displayName,
          value: category.key
        };
        try {
          const e = category.defaultEmoji;
          if (e) {
            if (/^\d{15,20}$/.test(String(e))) opt.emoji = { id: String(e) };
            else opt.emoji = { name: String(e) };
          }
        } catch { }
        return opt;
      }));

    const components = [new ActionRowBuilder().addComponents(selectMenu)];

    const payload = { embeds: [embed], components };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ephemeral: true });
    }

  } catch (error) {
    console.error('[ERROR] Error en showEmojiCategorySelection:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'Error al mostrar las categorías de emoji.', components: [] });
    } else {
      await interaction.reply({ content: 'Error al mostrar las categorías de emoji.', ephemeral: true });
    }
  }
}

/**
 * Maneja la selección de categoría para emoji
 */
async function handleEmojiCategorySelection(interaction) {
  const sessionId = getSessionIdFromInteraction(interaction);
  const session = getSession(sessionId);

  if (!session) {
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: 64 });
  }

  const selectedCategory = interaction.values[0];
  updateSession(sessionId, { emojiCategory: selectedCategory });
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }
  await showEmojiWeaponSelection(interaction, sessionId, selectedCategory);
}

/**
 * Muestra la selección de arma específica para obtener el emoji
 */
async function showEmojiWeaponSelection(interaction, sessionId, category) {
  try {
    const weapons = await getWeaponsWithFallback();
    const categoryWeapons = weapons.filter(weapon => weapon.category === category);
    const session = getSession(sessionId);

    if (categoryWeapons.length === 0) {
      const msg = { content: 'No se encontraron armas en esta categoría.', components: [], embeds: [] };
      if (interaction.deferred || interaction.replied) return await interaction.editReply(msg);
      return await interaction.reply({ ...msg, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎯 Seleccionar Arma para Emoji')
      .setDescription(`Elige el arma específica cuyo emoji representará el grupo **${session.tempGroupConfig.displayName}**`)
      .setColor(0x00FFFF)
      .setFooter({ text: '📍 Editor Principal > Grupos de Armas > Configurar Grupo > Emoji' })
      .addFields([
        {
          name: 'ℹ️ Emoji del Grupo',
          value: 'El emoji del arma que selecciones se usará como icono del grupo',
          inline: false
        }
      ]);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(generateShortCustomId('template_emoji_weapon', sessionId))
      .setPlaceholder('Selecciona el arma para el emoji')
      .addOptions(categoryWeapons.slice(0, 25).map(weapon => {
        const opt = {
          label: weapon.name,
          value: weapon.emojiId || weapon.name
        };
        try {
          const e = weapon.emojiId;
          if (e) {
            if (/^\d{15,20}$/.test(String(e))) opt.emoji = { id: String(e) };
            else opt.emoji = { name: String(e) };
          } else {
            opt.emoji = { name: '⚔️' };
          }
        } catch {
          opt.emoji = { name: '⚔️' };
        }
        return opt;
      }));

    const components = [new ActionRowBuilder().addComponents(selectMenu)];

    const payload = { embeds: [embed], components };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ephemeral: true });
    }

  } catch (error) {
    console.error('[ERROR] Error en showEmojiWeaponSelection:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'Error al mostrar las armas para emoji.', components: [] });
    } else {
      await interaction.reply({ content: 'Error al mostrar las armas para emoji.', ephemeral: true });
    }
  }
}

/**
 * Maneja la selección de arma para emoji y pasa a selección de armas del grupo
 */
async function handleEmojiWeaponSelection(interaction) {
  const sessionId = getSessionIdFromInteraction(interaction);
  const session = getSession(sessionId);

  if (!session) {
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: 64 });
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }

  const selectedEmojiId = interaction.values[0];

  // Guardar el emoji seleccionado en la configuración temporal
  const tempConfig = session.tempGroupConfig;
  tempConfig.defaultEmoji = selectedEmojiId;
  updateSession(sessionId, { tempGroupConfig: tempConfig });

  await showMultipleWeaponSelection(interaction, sessionId);
}

/**
 * Maneja el envío del modal de cantidades de armas
 */
/**
 * Maneja el envío del modal de configuración individual de arma
 */
async function handleWeaponConfigSubmit(interaction) {
  // Extraer sessionId e índice del customId
  const sessionId = getSessionIdFromInteraction(interaction);
  // Obtenemos el índice del arma, que es el último elemento después de dividir por _
  const currentIndex = parseInt(interaction.customId.split('_').pop());

  const session = getSession(sessionId);

  console.log('[DEBUG] handleWeaponConfigSubmit: sessionId=', sessionId, 'currentIndex=', currentIndex);

  if (!session || !session.tempSelectedWeapons) {
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: 64 });
  }

  const allSelectedWeapons = session.tempSelectedWeapons;
  const currentWeapon = allSelectedWeapons[currentIndex];

  if (!currentWeapon) {
    return await interaction.reply({ content: 'Error: Arma no encontrada.', flags: 64 });
  }

  // Obtener valores del modal
  const quantity = parseInt(interaction.fields.getTextInputValue('quantity'));
  const buildUrl = interaction.fields.getTextInputValue('buildUrl') || '';

  // Validar cantidad
  if (isNaN(quantity) || quantity <= 0 || quantity > 999) {
    return await interaction.reply({
      content: `Cantidad inválida para ${currentWeapon.name}. Debe ser un número entre 1 y 999.`,
      flags: 64
    });
  }

  // Calcular sendBuildToPrivate automáticamente: si hay URL -> true, si no hay URL -> false
  const sendBuildToPrivate = buildUrl.trim().length > 0;

  // Agregar arma procesada a la lista
  const processedWeapons = session.processedWeapons || [];
  processedWeapons.push({
    name: currentWeapon.name,
    emoji: currentWeapon.emoji || currentWeapon.emojiId, // Usar emoji si existe, sino emojiId como fallback
    image: currentWeapon.image || '',
    quantity: quantity,
    url: buildUrl,
    sendBuildToPrivate: sendBuildToPrivate
  });

  // Verificar si hay más armas por procesar
  const nextIndex = currentIndex + 1;

  if (nextIndex < allSelectedWeapons.length) {
    // Hay más armas, actualizar sesión y mostrar siguiente modal
    updateSession(sessionId, {
      processedWeapons: processedWeapons,
      currentWeaponIndex: nextIndex
    });

    await interaction.deferUpdate();
    await showWeaponConfigModal(interaction, sessionId, allSelectedWeapons[nextIndex], nextIndex, allSelectedWeapons.length);
  } else {
    // Todas las armas procesadas, agregar al grupo y continuar
    const tempConfig = session.tempGroupConfig;
    tempConfig.weapons = [...(tempConfig.weapons || []), ...processedWeapons];

    updateSession(sessionId, {
      tempGroupConfig: tempConfig,
      tempSelectedWeapons: null,
      processedWeapons: null,
      currentWeaponIndex: null
    });

    await interaction.deferUpdate();
    await showMultipleWeaponSelection(interaction, sessionId);
  }
}

/**
 * Muestra la selección múltiple de armas de diferentes categorías
 */
async function showMultipleWeaponSelection(interaction, sessionId) {
  try {
    const categories = await getWeaponCategoriesWithFallback();
    const session = getSession(sessionId);

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Seleccionar Armas del Grupo')
      .setDescription(`Agregar armas al grupo **${session.tempGroupConfig.displayName}**\n\nPuedes mezclar armas de diferentes categorías.`)
      .setColor(0x00FFFF)
      .setFooter({ text: '📍 Editor Principal > Grupos de Armas > Configurar Grupo > Seleccionar Categorías' });

    // Mostrar armas ya seleccionadas con cantidades
    if (session.tempGroupConfig.weapons.length > 0) {
      embed.addFields([
        {
          name: 'Armas Seleccionadas',
          value: session.tempGroupConfig.weapons.map(w => `• ${w.quantity}x ${w.name}`).join('\n'),
          inline: false
        }
      ]);
    }

    embed.addFields([
      {
        name: 'ℹ️ Proceso de Agregado',
        value: '1. Selecciona una categoría\n2. Elige **una arma** de esa categoría\n3. Configura cantidad, URL y notificación\n4. Repite para agregar más armas',
        inline: false
      }
    ]);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(generateShortCustomId('template_multi_category', sessionId))
      .setPlaceholder('Selecciona una categoría para agregar armas')
      .addOptions(categories.slice(0, 25).map(category => ({
        label: category.displayName,
        value: category.key,
        emoji: category.defaultEmoji
      })));

    const components = [new ActionRowBuilder().addComponents(selectMenu)];

    // Botones de acción
    const buttons = [];

    if (session.tempGroupConfig.weapons.length > 0) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(generateShortCustomId('template_finish_group', sessionId))
          .setLabel('✅ Finalizar Grupo')
          .setStyle(ButtonStyle.Success)
      );
    }

    buttons.push(
      new ButtonBuilder()
        .setCustomId(generateShortCustomId('template_cancel_group', sessionId))
        .setLabel('❌ Cancelar')
        .setStyle(ButtonStyle.Danger)
    );

    if (buttons.length > 0) {
      components.push(new ActionRowBuilder().addComponents(...buttons));
    }

    await interaction.editReply({
      embeds: [embed],
      components,
      ephemeral: true
    });

  } catch (error) {
    console.error('[ERROR] Error en showMultipleWeaponSelection:', error);
    await interaction.editReply({ content: 'Error al mostrar la selección de armas.' });
  }
}

/**
 * Maneja la selección de categoría de arma
 */
async function handleWeaponCategorySelection(interaction) {
  console.log(`[DEBUG] handleWeaponCategorySelection: customId=${interaction.customId}`);
  const sessionId = getSessionIdFromInteraction(interaction);
  console.log(`[DEBUG] handleWeaponCategorySelection: extracted sessionId=${sessionId}`);

  let session = getSession(sessionId);

  if (!session) {
    console.log(`[DEBUG] handleWeaponCategorySelection: No session found for ${sessionId}, attempting recovery`);

    // Intentar recuperar por usuario y paso
    const recovered = findSessionByCriteria(interaction.user.id, interaction.guild.id, 'weapon_categories');
    if (recovered) {
      console.log(`[DEBUG] handleWeaponCategorySelection: Recovered session ${recovered.sessionId}`);
      session = recovered.session;
      sessionId = recovered.sessionId;
    } else {
      // Intentar recuperar cualquier sesión del usuario
      const anySession = findSessionByUser(interaction.user.id, interaction.guild.id);
      if (anySession) {
        console.log(`[DEBUG] handleWeaponCategorySelection: Found user session in step ${anySession.session.step}, updating to weapon_categories`);
        updateSession(anySession.sessionId, { step: 'weapon_categories' });
        session = anySession.session;
        sessionId = anySession.sessionId;
      } else {
        console.log(`[DEBUG] handleWeaponCategorySelection: No recoverable session found`);
        return await interaction.reply({ content: '❌ Sesión expirada. Por favor, usa `/template-create` para empezar de nuevo.', flags: 64 });
      }
    }
  }

  const selectedCategory = interaction.values[0];
  console.log(`[DEBUG] handleWeaponCategorySelection: selectedCategory=${selectedCategory}`);

  updateSession(sessionId, { selectedCategory, weaponSelectionPage: 0 });

  // Mostrar modal para configurar el grupo ANTES de seleccionar armas específicas
  await showGroupConfigModal(interaction, sessionId, selectedCategory);
}

/**
 * Muestra la selección de armas específicas de una categoría
 */
async function showWeaponSelection(interaction, sessionId, category) {
  try {
    const weapons = await getWeaponsWithFallback();
    const categoryWeapons = weapons.filter(weapon => weapon.category === category);

    console.log(`[DEBUG] showWeaponSelection: category=${category}, found ${categoryWeapons.length} weapons`);

    if (categoryWeapons.length > 0) {
      console.log(`[DEBUG] showWeaponSelection: First 3 weapons:`, categoryWeapons.slice(0, 3).map(w => `${w.name} (${w.emojiId})`));
    }

    if (categoryWeapons.length === 0) {
      return await interaction.followUp({ content: 'No se encontraron armas en esta categoría.', ephemeral: true });
    }

    const session = getSession(sessionId);

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ Seleccionar Armas - ${categoryWeapons[0].categoryDisplayName || category}`)
      .setDescription('Selecciona las armas específicas que quieres incluir en este grupo.')
      .setColor(0x00FFFF);

    // Paginación para las armas
    const weaponsPerPage = 25;
    const totalPages = Math.ceil(categoryWeapons.length / weaponsPerPage);

    if (!session.weaponSelectionPage) {
      updateSession(sessionId, { weaponSelectionPage: 0 });
      session.weaponSelectionPage = 0; // Update local copy
    }
    const currentPage = session.weaponSelectionPage || 0;

    const startIndex = currentPage * weaponsPerPage;
    const endIndex = Math.min(startIndex + weaponsPerPage, categoryWeapons.length);
    const currentWeapons = categoryWeapons.slice(startIndex, endIndex);

    console.log(`[DEBUG] showWeaponSelection: totalWeapons=${categoryWeapons.length}, currentPage=${currentPage}, totalPages=${totalPages}`);
    console.log(`[DEBUG] showWeaponSelection: startIndex=${startIndex}, endIndex=${endIndex}, currentWeapons.length=${currentWeapons.length}`);

    // Verificar que tengamos armas para mostrar
    if (currentWeapons.length === 0) {
      console.log(`[ERROR] showWeaponSelection: No weapons found for current page`);
      return await interaction.followUp({ content: 'Error: No se encontraron armas en esta página.', ephemeral: true });
    }

    // Crear opciones del select menu con validación
    const options = [];
    for (const weapon of currentWeapons) {
      if (weapon.name && weapon.emojiId) {
        options.push({
          label: weapon.name.substring(0, 100), // Discord limit
          value: weapon.emojiId.toString(),
          emoji: formatEmoji(weapon.emojiId, '⚔️')
        });
      } else {
        console.log(`[WARNING] showWeaponSelection: Skipping invalid weapon:`, weapon);
      }
    }

    if (options.length === 0) {
      console.log(`[ERROR] showWeaponSelection: No valid options created`);
      return await interaction.followUp({ content: 'Error: No se pudieron crear las opciones de armas.', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`template_weapons_${sessionId}`)
      .setPlaceholder('Selecciona las armas para este grupo')
      .setMinValues(1)
      .setMaxValues(Math.min(options.length, 25))
      .addOptions(options);

    const buttons = [];

    // Botones de paginación
    if (totalPages > 1) {
      if (currentPage > 0) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`template_prev_weapon_page_${sessionId}`)
            .setLabel('Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
        );
      }

      if (currentPage < totalPages - 1) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`template_next_weapon_page_${sessionId}`)
            .setLabel('Siguiente')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➡️')
        );
      }
    }

    buttons.push(
      new ButtonBuilder()
        .setCustomId(`template_back_category_${sessionId}`)
        .setLabel('Volver a Categorías')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔙')
    );

    const components = [new ActionRowBuilder().addComponents(selectMenu)];
    if (buttons.length > 0) {
      components.push(new ActionRowBuilder().addComponents(buttons));
    }

    if (totalPages > 1) {
      embed.setFooter({ text: `Página ${currentPage + 1} de ${totalPages}` });
    }

    await interaction.editReply({
      embeds: [embed],
      components,
      ephemeral: true
    });

  } catch (error) {
    console.error('[ERROR] Error en showWeaponSelection:', error);
    await interaction.followUp({ content: 'Error al cargar las armas.', ephemeral: true });
  }
}

/**
 * Muestra el modal para configurar el grupo ANTES de seleccionar armas
 */
async function showGroupConfigModal(interaction, sessionId, category) {
  try {
    // Obtener información de la categoría
    const categories = await getWeaponCategoriesWithFallback();
    const categoryInfo = categories.find(cat => cat.key === category);

    if (!categoryInfo) {
      return await interaction.reply({ content: 'No se encontró información de la categoría seleccionada.', flags: 64 });
    }

    const modal = new ModalBuilder()
      .setCustomId(generateShortCustomId('template_group_config', sessionId))
      .setTitle(`Configurar Grupo: ${categoryInfo.displayName}`);

    const displayNameInput = new TextInputBuilder()
      .setCustomId('displayName')
      .setLabel('Nombre del grupo de armas')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setPlaceholder('Ej: DPS, Tanques, Support, Offtank')
      .setValue(categoryInfo.displayName);

    const keyInput = new TextInputBuilder()
      .setCustomId('weaponKey')
      .setLabel('Clave única del grupo (sin espacios)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50)
      .setPlaceholder('Ej: dps, tanks, support, offtank')
      .setValue(generateWeaponKey(categoryInfo.displayName));

    const urlInput = new TextInputBuilder()
      .setCustomId('buildUrl')
      .setLabel('URL del build (opcional)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(500)
      .setPlaceholder('https://albionfreemarket.com/builds/...');

    // Guardar el emoji de la categoría en la sesión para uso automático
    updateSession(sessionId, { categoryDefaultEmoji: categoryInfo.defaultEmoji });

    modal.addComponents(
      new ActionRowBuilder().addComponents(displayNameInput),
      new ActionRowBuilder().addComponents(keyInput),
      new ActionRowBuilder().addComponents(urlInput)
    );

    await interaction.showModal(modal);

  } catch (error) {
    console.error('[ERROR] Error en showGroupConfigModal:', error);
    await interaction.reply({ content: 'Error al mostrar el modal de configuración.', flags: 64 });
  }
}

/**
 * Maneja el envío del modal de configuración de grupo
 */
async function handleGroupConfigSubmit(interaction) {
  const sessionId = getSessionIdFromInteraction(interaction);
  const session = getSession(sessionId);

  if (!session) {
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: 64 });
  }

  const displayName = interaction.fields.getTextInputValue('displayName');
  const weaponKey = interaction.fields.getTextInputValue('weaponKey');
  const buildUrl = interaction.fields.getTextInputValue('buildUrl') || '';

  // Usar automáticamente el emoji de la categoría
  const defaultEmoji = session.categoryDefaultEmoji;

  // Validaciones
  if (!defaultEmoji) {
    return await interaction.reply({ content: 'Error: No se encontró el emoji de la categoría.', flags: 64 });
  }

  // Guardar configuración del grupo en la sesión
  const groupConfig = {
    displayName,
    weaponKey,
    defaultEmoji,
    buildUrl
  };

  updateSession(sessionId, { groupConfig });

  await interaction.deferUpdate();
  // Ahora mostrar la selección de armas
  await showWeaponSelection(interaction, sessionId, session.selectedCategory);
}

/**
 * Maneja la selección de armas específicas
 */
async function handleWeaponSelection(interaction) {
  try {
    // Usar la función extractSessionId para mantener consistencia
    const { extractSessionId } = require('./template-create-navigation');
    const sessionId = extractSessionId(interaction.customId);
    console.log('[DEBUG] handleWeaponSelection: Extracted sessionId:', sessionId);

    const session = getSession(sessionId);

    if (!session) {
      console.error('[ERROR] handleWeaponSelection: Session not found for sessionId:', sessionId);
      console.log('[DEBUG] handleWeaponSelection: Available sessions:', Array.from(getTemplateCreationSessions().keys()));
      return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', ephemeral: true });
    }

    const selectedWeaponIds = interaction.values;

    // Obtener la configuración del grupo que se configuró previamente
    const groupConfig = session.groupConfig;
    if (!groupConfig) {
      return await interaction.reply({ content: 'Error: No se encontró la configuración del grupo.', flags: 64 });
    }

    // Obtener información de las armas seleccionadas
    const weapons = await getWeaponsWithFallback();
    const selectedWeapons = weapons.filter(weapon => selectedWeaponIds.includes(weapon.emojiId));

    if (selectedWeapons.length === 0) {
      return await interaction.reply({ content: 'No se encontraron las armas seleccionadas.', flags: 64 });
    }

    // Crear la configuración final del arma
    // Para el flujo anterior, usar 1 unidad por arma por defecto
    const weaponConfig = {
      displayName: groupConfig.displayName,
      defaultEmoji: groupConfig.defaultEmoji,
      units: selectedWeapons.length, // La suma total es el número de armas seleccionadas
      buildUrl: groupConfig.buildUrl,
      weapons: selectedWeapons.map(weapon => ({
        name: weapon.name,
        emoji: weapon.emoji || weapon.emojiId, // Usar emoji si existe, sino emojiId como fallback
        image: weapon.image || '',
        url: weapon.url || ''
      }))
    };

    // Guardar la configuración del arma en la sesión
    if (!session.data.weapons) {
      session.data.weapons = {};
    }
    session.data.weapons[groupConfig.weaponKey] = weaponConfig;

    updateSession(sessionId, {
      data: session.data,
      step: 'weapon_categories'
    });

    await interaction.update({
      embeds: [new EmbedBuilder()
        .setTitle('✅ Grupo de Armas Configurado')
        .setDescription(`Se ha configurado correctamente el grupo **${groupConfig.displayName}** con ${selectedWeapons.length} arma(s).`)
        .setColor(0x00FF00)
        .addFields([
          {
            name: 'Nombre del Grupo',
            value: groupConfig.displayName,
            inline: true
          },
          {
            name: 'Cantidad Máxima',
            value: selectedWeapons.length.toString(),
            inline: true
          },
          {
            name: 'Armas Incluidas',
            value: selectedWeapons.map(w => `• ${w.name}`).join('\n'),
            inline: false
          }
        ])
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`template_add_weapon_${sessionId}`)
            .setLabel('➕ Agregar Otro Grupo')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`template_continue_${sessionId}`)
            .setLabel('Continuar ➡️')
            .setStyle(ButtonStyle.Success)
        )
      ]
    });
  } catch (error) {
    console.error('[ERROR] Error en handleWeaponSelection:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Error al procesar la selección de armas.', flags: 64 });
      } else {
        await interaction.followUp({ content: 'Error al procesar la selección de armas.', flags: 64 });
      }
    } catch (replyError) {
      console.error('[ERROR] Error sending error reply:', replyError);
    }
  }
}

/**
 * Muestra el modal para configurar el grupo de armas
 */
async function showWeaponConfigModal(interaction, sessionId, weaponIds) {
  const session = getSession(sessionId);

  // Obtener información de las armas seleccionadas
  const weapons = await getWeaponsWithFallback();
  const selectedWeapons = weapons.filter(weapon => weaponIds.includes(weapon.emojiId));

  if (selectedWeapons.length === 0) {
    return await interaction.followUp({ content: 'No se encontraron las armas seleccionadas.', ephemeral: true });
  }

  const categoryName = selectedWeapons[0].categoryDisplayName;

  const modal = new ModalBuilder()
    .setCustomId(`template_weapon_config_${sessionId}`)
    .setTitle(`Configurar Grupo: ${categoryName}`);

  const displayNameInput = new TextInputBuilder()
    .setCustomId('displayName')
    .setLabel('Nombre del grupo de armas')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('Ej: Maza íncubo, Tanques, DPS')
    .setValue(categoryName);

  const keyInput = new TextInputBuilder()
    .setCustomId('weaponKey')
    .setLabel('Clave única del grupo (sin espacios)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50)
    .setPlaceholder('Ej: offtank, falce, dps')
    .setValue(generateWeaponKey(categoryName));

  const urlInput = new TextInputBuilder()
    .setCustomId('buildUrl')
    .setLabel('URL del build (opcional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setPlaceholder('https://albionfreemarket.com/builds/...');

  // Guardar temporalmente los weaponIds y categoria
  updateSession(sessionId, {
    tempWeaponIds: weaponIds,
    tempSelectedWeapons: selectedWeapons
  });

  modal.addComponents(
    new ActionRowBuilder().addComponents(displayNameInput),
    new ActionRowBuilder().addComponents(keyInput),
    new ActionRowBuilder().addComponents(urlInput)
  );

  await interaction.showModal(modal);
}

/**
 * Genera una clave única para el grupo de armas
 */
function generateWeaponKey(displayName) {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20);
}

/**
 * Maneja la selección de categoría para agregar armas múltiples
 */
async function handleMultiCategorySelection(interaction) {
  const sessionId = getSessionIdFromInteraction(interaction);
  const session = getSession(sessionId);

  console.log(`[DEBUG] handleMultiCategorySelection: sessionId=${sessionId}`);

  if (!session) {
    console.log('[ERROR] No session found in handleMultiCategorySelection');
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', ephemeral: true });
  }

  if (!session.tempGroupConfig) {
    console.log('[ERROR] No tempGroupConfig found in session');
    return await interaction.reply({ content: 'Configuración de grupo no encontrada. Reinicia el proceso.', flags: 64 });
  }

  const selectedCategory = interaction.values[0];
  console.log(`[DEBUG] Selected category: ${selectedCategory}`);

  await interaction.deferUpdate();
  await showCategoryWeapons(interaction, sessionId, selectedCategory);
}

/**
 * Muestra las armas de una categoría específica para selección múltiple
 */
async function showCategoryWeapons(interaction, sessionId, category) {
  try {
    const weapons = await getWeaponsWithFallback();
    const categoryWeapons = weapons.filter(weapon => weapon.category === category);
    const session = getSession(sessionId);

    if (!session || !session.tempGroupConfig) {
      return await interaction.editReply({ content: 'Sesión expirada. Inicia el proceso nuevamente.' });
    }

    if (categoryWeapons.length === 0) {
      return await interaction.editReply({ content: 'No se encontraron armas en esta categoría.' });
    }

    console.log(`[DEBUG] showCategoryWeapons: Found ${categoryWeapons.length} weapons in category ${category}`);
    console.log(`[DEBUG] Group config: ${session.tempGroupConfig.displayName}`);

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ Armas de ${categoryWeapons[0].categoryDisplayName}`)
      .setDescription(`Selecciona **una arma** para agregar al grupo **${session.tempGroupConfig.displayName}**\n\n⚠️ **Solo puedes agregar una arma a la vez. Para agregar más armas, repite el proceso.**`)
      .setColor(0x00FFFF)
      .setFooter({ text: `📍 Editor Principal > Grupos de Armas > Configurar Grupo > ${categoryWeapons[0].categoryDisplayName}` });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`template_add_weapons_${sessionId}`)
      .setPlaceholder('Selecciona UNA arma para agregar al grupo')
      .setMinValues(1)
      .setMaxValues(1) // Solo permitir seleccionar una arma a la vez
      .addOptions(categoryWeapons.slice(0, 25).map(weapon => {
        console.log(`[DEBUG] Processing weapon: ${weapon.name}, emojiId: ${weapon.emojiId}`);
        return {
          label: weapon.name,
          value: weapon.emojiId || `weapon_${weapon.name.replace(/\s/g, '_')}`,
          emoji: formatEmoji(weapon.emojiId, '⚔️')
        };
      }));

    const components = [
      new ActionRowBuilder().addComponents(selectMenu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`template_back_to_categories_${sessionId}`)
          .setLabel('⬅️ Volver a Categorías')
          .setStyle(ButtonStyle.Secondary)
      )
    ];

    await interaction.editReply({
      embeds: [embed],
      components,
      ephemeral: true
    });

  } catch (error) {
    console.error('[ERROR] Error en showCategoryWeapons:', error);
    await interaction.editReply({ content: 'Error al mostrar las armas.' });
  }
}

/**
 * Maneja la adición de armas al grupo temporal - muestra modal para configurar UNA arma
 */
async function handleAddWeapons(interaction) {
  console.log('[DEBUG] handleAddWeapons: Starting with customId:', interaction.customId);
  const sessionId = getSessionIdFromInteraction(interaction);
  console.log('[DEBUG] handleAddWeapons: Extracted sessionId:', sessionId, 'type:', typeof sessionId);

  const session = getSession(sessionId);

  if (!session) {
    console.error('[ERROR] handleAddWeapons: No session found for sessionId:', sessionId);
    console.log('[DEBUG] handleAddWeapons: Available sessions:', Array.from(getTemplateCreationSessions().keys()));
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', ephemeral: true });
  }

  // Solo debe haber un arma seleccionada
  const selectedWeaponIds = interaction.values;
  if (selectedWeaponIds.length !== 1) {
    return await interaction.reply({ content: 'Error: Solo puedes seleccionar una arma a la vez.', flags: 64 });
  }

  const weapons = await getWeaponsWithFallback();
  const selectedWeapon = weapons.find(weapon => weapon.emojiId === selectedWeaponIds[0]);

  if (!selectedWeapon) {
    return await interaction.reply({ content: 'Error: Arma no encontrada.', flags: 64 });
  }

  console.log('[DEBUG] handleAddWeapons: Selected weapon:', selectedWeapon.name);

  // Guardar temporalmente el arma seleccionada
  const updatedSession = updateSession(sessionId, {
    tempCurrentWeapon: selectedWeapon
  });
  console.log('[DEBUG] handleAddWeapons: Updated session with weapon');
  console.log('[DEBUG] handleAddWeapons: Session update result:', !!updatedSession);
  console.log('[DEBUG] handleAddWeapons: SessionId being used for update:', sessionId);

  // Mostrar modal de configuración para esta arma
  try {
    console.log('[DEBUG] handleAddWeapons: Creating modal');
    const shortCustomId = generateShortCustomId('template_single_weapon_config', sessionId);
    console.log('[DEBUG] handleAddWeapons: Short customId generated:', shortCustomId);

    const modal = new ModalBuilder()
      .setCustomId(shortCustomId)
      .setTitle(`Configurar: ${selectedWeapon.name}`);

    // Campo de cantidad
    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel('Cantidad de jugadores')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(3)
      .setPlaceholder('Ej: 1, 2, 5')
      .setValue('1');

    // Campo de URL del build
    const urlInput = new TextInputBuilder()
      .setCustomId('buildUrl')
      .setLabel('URL del build (opcional)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(500)
      .setPlaceholder('https://albionfreemarket.com/builds/...');

    modal.addComponents(
      new ActionRowBuilder().addComponents(quantityInput),
      new ActionRowBuilder().addComponents(urlInput)
    );

    console.log('[DEBUG] handleAddWeapons: Showing modal');
    await interaction.showModal(modal);
    console.log('[DEBUG] handleAddWeapons: Modal shown successfully');

  } catch (error) {
    console.error('[ERROR] Error showing weapon config modal:', error);
    await interaction.reply({
      content: 'Error al mostrar la configuración del arma. Inténtalo nuevamente.',
      flags: 64
    });
  }
}



/**
 * Maneja la configuración de una sola arma
 */
async function handleSingleWeaponConfigSubmit(interaction) {
  console.log('[DEBUG] handleSingleWeaponConfigSubmit: Starting');
  console.log('[DEBUG] customId:', interaction.customId);

  const sessionId = getSessionIdFromInteraction(interaction);
  console.log('[DEBUG] Extracted sessionId:', sessionId);
  console.log('[DEBUG] SessionId type:', typeof sessionId);

  // Debug: Mostrar todas las sesiones disponibles
  const allSessions = getTemplateCreationSessions();
  console.log('[DEBUG] Available sessions:', Array.from(allSessions.keys()));
  console.log('[DEBUG] Looking for sessionId:', sessionId);

  const session = getSession(sessionId);
  console.log('[DEBUG] Session found:', !!session);

  if (!session) {
    console.error('[ERROR] handleSingleWeaponConfigSubmit: No session found for sessionId:', sessionId);
    console.log('[DEBUG] handleSingleWeaponConfigSubmit: Available sessions:', Array.from(getTemplateCreationSessions().keys()));
    console.log('[ERROR] No session found');
    return await interaction.reply({ content: 'Sesión expirada. Inicia el proceso nuevamente.', flags: 64 });
  }

  console.log('[DEBUG] Session data keys:', Object.keys(session));
  console.log('[DEBUG] Session tempCurrentWeapon:', session.tempCurrentWeapon);
  console.log('[DEBUG] Session tempGroupConfig:', session.tempGroupConfig);

  const currentWeapon = session.tempCurrentWeapon;
  console.log('[DEBUG] Current weapon:', currentWeapon ? currentWeapon.name : 'none');

  if (!currentWeapon) {
    console.log('[ERROR] No current weapon in session');
    return await interaction.reply({ content: 'Error: Arma no encontrada en la sesión.', flags: 64 });
  }

  try {
    // Obtener valores del modal
    const quantityStr = interaction.fields.getTextInputValue('quantity');
    const buildUrl = interaction.fields.getTextInputValue('buildUrl') || '';

    console.log('[DEBUG] Modal values:');
    console.log('[DEBUG] - quantity string:', quantityStr);
    console.log('[DEBUG] - buildUrl:', buildUrl);

    const quantity = parseInt(quantityStr);
    console.log('[DEBUG] - parsed quantity:', quantity);

    // Validar cantidad
    if (isNaN(quantity) || quantity <= 0 || quantity > 999) {
      return await interaction.reply({
        content: `Cantidad inválida para ${currentWeapon.name}. Debe ser un número entre 1 y 999.`,
        flags: 64
      });
    }

    // Calcular sendBuildToPrivate automáticamente: si hay URL -> true, si no hay URL -> false
    const sendBuildToPrivate = buildUrl.trim().length > 0;
    console.log('[DEBUG] - sendBuildToPrivate (auto):', sendBuildToPrivate);

    // Agregar arma al grupo temporal
    const processedWeapon = {
      name: currentWeapon.name,
      emoji: currentWeapon.emoji || currentWeapon.emojiId, // Usar emoji si existe, sino emojiId como fallback
      image: currentWeapon.image || '',
      quantity: quantity,
      url: buildUrl,
      sendBuildToPrivate: sendBuildToPrivate
    };

    // Agregar a la lista de armas del grupo
    const tempConfig = session.tempGroupConfig;
    if (!tempConfig.weapons) {
      tempConfig.weapons = [];
    }
    tempConfig.weapons.push(processedWeapon);

    // Limpiar arma temporal y actualizar sesión
    updateSession(sessionId, {
      tempGroupConfig: tempConfig,
      tempCurrentWeapon: null
    });

    console.log(`[DEBUG] Added weapon ${currentWeapon.name} with quantity ${quantity} to group ${tempConfig.displayName}`);

    await interaction.deferUpdate();
    await showMultipleWeaponSelection(interaction, sessionId);
  } catch (error) {
    console.error('[ERROR] Error in handleSingleWeaponConfigSubmit:', error);
    try {
      await interaction.reply({
        content: 'Error al procesar la configuración del arma. Inténtalo nuevamente.',
        flags: 64
      });
    } catch (replyError) {
      console.error('[ERROR] Error sending error reply:', replyError);
    }
  }
}

/**
 * Maneja la finalización del grupo
 */
async function handleFinishGroup(interaction) {
  try {
    console.log('[DEBUG] handleFinishGroup: Starting');
    const sessionId = getSessionIdFromInteraction(interaction);
    console.log('[DEBUG] handleFinishGroup: sessionId:', sessionId);

    const session = getSession(sessionId);
    console.log('[DEBUG] handleFinishGroup: session found:', !!session);

    if (!session) {
      console.log('[ERROR] handleFinishGroup: No session found');
      console.log('[DEBUG] handleFinishGroup: Available sessions:', Array.from(getTemplateCreationSessions().keys()));
      return await interaction.update({ content: 'Sesión expirada. Inicia el proceso nuevamente.', embeds: [], components: [] });
    }

    const tempConfig = session.tempGroupConfig;
    console.log('[DEBUG] handleFinishGroup: tempConfig:', tempConfig ? 'exists' : 'null');
    console.log('[DEBUG] handleFinishGroup: weapons count:', tempConfig?.weapons?.length || 0);

    if (!tempConfig) {
      console.log('[ERROR] handleFinishGroup: No tempConfig');
      return await interaction.update({ content: 'Error: Configuración de grupo no encontrada.', embeds: [], components: [] });
    }

    if (!tempConfig.weapons || tempConfig.weapons.length === 0) {
      console.log('[ERROR] handleFinishGroup: No weapons in group');
      return await interaction.update({ content: 'Error: No hay armas seleccionadas para el grupo.', embeds: [], components: [] });
    }

    console.log('[DEBUG] handleFinishGroup: Processing weapons...');

    // Verificar que todas las propiedades necesarias existen
    for (let i = 0; i < tempConfig.weapons.length; i++) {
      const weapon = tempConfig.weapons[i];
      console.log(`[DEBUG] handleFinishGroup: Weapon ${i}:`, {
        name: weapon.name,
        emoji: weapon.emoji || weapon.emojiId, // Mostrar emoji en lugar de emojiId
        quantity: weapon.quantity,
        url: weapon.url,
        sendBuildToPrivate: weapon.sendBuildToPrivate
      });

      if (!weapon.name) {
        console.log(`[ERROR] handleFinishGroup: Weapon ${i} missing name`);
        return await interaction.update({ content: `Error: Arma ${i + 1} no tiene nombre.`, embeds: [], components: [] });
      }
      if (!weapon.emoji && !weapon.emojiId) {
        console.log(`[ERROR] handleFinishGroup: Weapon ${i} missing emoji`);
        return await interaction.update({ content: `Error: Arma ${i + 1} (${weapon.name}) no tiene emoji.`, embeds: [], components: [] });
      }
      if (!weapon.quantity || isNaN(weapon.quantity)) {
        console.log(`[ERROR] handleFinishGroup: Weapon ${i} invalid quantity:`, weapon.quantity);
        return await interaction.update({ content: `Error: Arma ${i + 1} (${weapon.name}) no tiene cantidad válida.`, embeds: [], components: [] });
      }
    }

    // Crear la configuración final del grupo en el formato correcto
    const weaponConfig = {
      displayName: tempConfig.displayName,
      defaultEmoji: tempConfig.defaultEmoji || '⚔️', // Fallback emoji
      data: tempConfig.weapons.map((weapon, index) => ({
        id: Date.now() + index, // Generar ID único basado en timestamp
        name: weapon.name,
        units: weapon.quantity,
        image: weapon.image || '',
        emoji: weapon.emoji || weapon.emojiId, // Usar emoji si existe, sino emojiId como fallback
        url: weapon.url || '',
        sendBuildToPrivate: weapon.sendBuildToPrivate || false
      }))
    };

    console.log('[DEBUG] handleFinishGroup: Final weapon config:', JSON.stringify(weaponConfig, null, 2));

    // Guardar en la sesión principal
    if (!session.data.weapons) {
      session.data.weapons = {};
    }
    session.data.weapons[tempConfig.weaponKey] = weaponConfig;

    console.log('[DEBUG] handleFinishGroup: Updated session data weapons:', Object.keys(session.data.weapons));

    // Limpiar configuración temporal
    updateSession(sessionId, {
      data: session.data,
      tempGroupConfig: null
    });

    console.log('[DEBUG] handleFinishGroup: Cleaned temp config');

    await interaction.deferUpdate();

    if (session.originalSessionId) {
      console.log('[DEBUG] handleFinishGroup: Es sesión de edición, sincronizando datos y regresando al editor');
      console.log('[DEBUG] handleFinishGroup: originalSessionId:', session.originalSessionId);
      console.log('[DEBUG] handleFinishGroup: isNewGroup:', session.isNewGroup);
      console.log('[DEBUG] handleFinishGroup: editingGroupIndex:', session.editingGroupIndex);

      // Es una sesión de edición, sincronizar datos y volver al editor
      const templateModule = require('../../commands/utility/template');

      if (session.isNewGroup) {
        // Añadir nuevo grupo
        console.log('[DEBUG] handleFinishGroup: Añadiendo nuevo grupo de armas');
        await templateModule.syncFromCreationToEdit(session.originalSessionId, {
          newWeaponGroup: weaponConfig
        });
      } else if (session.editingGroupIndex !== undefined) {
        // Verificar si estamos añadiendo armas a un grupo existente o reemplazando el grupo completo
        if (session.isAddingWeapons) {
          // Añadir armas al grupo existente
          console.log('[DEBUG] handleFinishGroup: Añadiendo armas al grupo existente en índice:', session.editingGroupIndex);
          await templateModule.syncFromCreationToEdit(session.originalSessionId, {
            addWeaponsToGroup: weaponConfig,
            groupIndex: session.editingGroupIndex
          });
        } else {
          // Reemplazar grupo completo
          console.log('[DEBUG] handleFinishGroup: Actualizando grupo existente en índice:', session.editingGroupIndex);
          await templateModule.syncFromCreationToEdit(session.originalSessionId, {
            editedWeaponGroup: weaponConfig,
            groupIndex: session.editingGroupIndex
          });
        }
      } else {
        // Método de respaldo para compatibilidad
        console.log('[DEBUG] handleFinishGroup: Usando método de sincronización de respaldo');
        await templateModule.syncFromCreationToEdit(session.originalSessionId, {
          weapons: session.data.weapons
        });
      }

      // Limpiar sesión temporal de creación
      const { deleteSession } = require('./template-sessions');
      deleteSession(sessionId);

      // Volver a la vista de armas del editor
      await templateModule.showEditWeapons(interaction, session.originalSessionId);
    } else {
      console.log('[DEBUG] handleFinishGroup: Sesión de creación normal, continuando con showWeaponCategorySelection');
      await showWeaponCategorySelection(interaction, sessionId);
    }

    console.log('[DEBUG] handleFinishGroup: Completed successfully');

  } catch (error) {
    console.error('[ERROR] handleFinishGroup: Caught error:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: `Error interno al crear el grupo: ${error.message}` });
      } else {
        await interaction.update({ content: `Error interno al crear el grupo: ${error.message}`, embeds: [], components: [] });
      }
    } catch (replyError) {
      console.error('[ERROR] handleFinishGroup: Failed to send error reply:', replyError);
    }
  }
}

module.exports = {
  handleAdditionalConfigSubmit,
  handleRoleSelection,
  handleWeaponCategorySelection,
  handleWeaponSelection,
  handleWeaponConfigSubmit,
  handleGroupConfigSubmit,
  handleAddWeaponGroup,
  handleBasicWeaponGroupSubmit,
  handleEmojiCategorySelection,
  handleEmojiWeaponSelection,
  handleMultiCategorySelection,
  handleAddWeapons,
  handleSingleWeaponConfigSubmit,
  handleFinishGroup,
  showWeaponCategorySelection,
  showRoleSelection
};