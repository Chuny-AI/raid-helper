const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getTemplatesByServer, getTemplateByName, updateTemplate, createTemplate, deleteTemplate, getTemplateNames } = require('../../services/templateService');
const { isServerPremium, getOrCreateServer } = require('../../services/serverService');
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, createPremiumEmbed, safeReply } = require('../../utils/errorEmbeds');

// Store temporal para manejar el estado del proceso de edición
const templateEditSessions = new Map();

// Tiempo de vida de sesión en milisegundos (30 minutos)
const SESSION_TIMEOUT = 30 * 60 * 1000;

// Limpiar sesiones expiradas cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of templateEditSessions.entries()) {
    if (session.lastActivity && (now - session.lastActivity > SESSION_TIMEOUT)) {
      console.log(`[DEBUG] Limpiando sesión expirada: ${sessionId}`);
      templateEditSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

/**
 * Función helper para validar y renovar sesiones
 */
function getValidSession(sessionId, userId, guildId) {
  console.log(`[DEBUG] getValidSession - Buscando sesión: ${sessionId}`);
  console.log(`[DEBUG] getValidSession - Usuario: ${userId}, Guild: ${guildId}`);
  console.log(`[DEBUG] getValidSession - Sesiones activas:`, Array.from(templateEditSessions.keys()).slice(0, 3));

  let session = templateEditSessions.get(sessionId);
  let actualSessionId = sessionId;

  // Si no existe la sesión directamente, buscar por usuario/guild
  if (!session) {
    console.log(`[DEBUG] Sesión ${sessionId} no encontrada directamente, buscando por usuario...`);
    for (const [id, sess] of templateEditSessions.entries()) {
      if (sess.userId === userId && sess.guildId === guildId) {
        console.log(`[DEBUG] Sesión encontrada por fallback: ${id}`);
        session = sess;
        actualSessionId = id;
        break;
      }
    }
  }

  if (session) {
    // Verificar si la sesión ha expirado
    const now = Date.now();
    if (session.lastActivity && (now - session.lastActivity > SESSION_TIMEOUT)) {
      console.log(`[DEBUG] Sesión ${actualSessionId} ha expirado`);
      templateEditSessions.delete(actualSessionId);
      return null;
    }

    // Renovar la actividad de la sesión
    session.lastActivity = now;
    console.log(`[DEBUG] Sesión ${actualSessionId} renovada exitosamente`);
    return { session, sessionId: actualSessionId };
  }

  console.log(`[DEBUG] No se encontró sesión válida para usuario ${userId} en guild ${guildId}`);
  return null;
}

// Importar funciones necesarias para template-create
const { getTemplateCreationSessions } = require('../../lib/template/template-sessions');
const { showWeaponCategorySelection } = require('../../lib/template/template-create-handlers');

/**
 * Comando principal unificado para templates con subcomandos
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('template')
    .setDescription('Gestión completa de templates del servidor')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Muestra todos los templates disponibles del servidor')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Crea un nuevo template para el servidor')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edita un template existente del servidor')
        .addStringOption(option =>
          option
            .setName('template')
            .setDescription('Selecciona el template a editar')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Elimina un template del servidor')
        .addStringOption(option =>
          option
            .setName('template')
            .setDescription('Selecciona el template a eliminar')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clone')
        .setDescription('Clona un template existente con un nuevo nombre')
        .addStringOption(option =>
          option
            .setName('template')
            .setDescription('Template a clonar')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Nombre para el nuevo template')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'list':
          await this.executeList(interaction);
          break;
        case 'create':
          await this.executeCreate(interaction);
          break;
        case 'edit':
          await this.executeEdit(interaction);
          break;
        case 'delete':
          await this.executeDelete(interaction);
          break;
        case 'clone':
          await this.executeClone(interaction);
          break;
        default:
          await interaction.reply({
            content: 'Subcomando no reconocido.',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error(`[ERROR] Error ejecutando template ${subcommand}:`, error);
      const errorMessage = 'Hubo un error al ejecutar este comando.';

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      } else if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      }
    }
  },

  // =============== TEMPLATE LIST ===============
  async executeList(interaction) {
    try {
      const isPremium = await isServerPremium(interaction.guild.id);
      if (!isPremium) {
        const premiumEmbed = createPremiumEmbed();
        return await interaction.reply({ embeds: [premiumEmbed], ephemeral: true });
      }

      const guildId = interaction.guild.id;
      await getOrCreateServer(guildId, interaction.guild.name);
      const templates = await getTemplatesByServer(guildId);

      if (templates.length === 0) {
        const infoEmbed = createInfoEmbed(
          "No Hay Templates",
          "No hay templates disponibles en este servidor.",
          [{
            name: "💡 Solución",
            value: "Usa `/template create` para crear tu primer template.",
            inline: false
          }]
        );
        return await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
      }

      const templateList = templates.map((template, index) =>
        `**${index + 1}.** ${template.title}`
      ).join('\n');

      const successEmbed = createSuccessEmbed(
        '📋 Templates Disponibles',
        `Se encontraron ${templates.length} template(s) en este servidor.`,
        [
          {
            name: '📄 Lista de Templates',
            value: templateList.length > 1024 ? templateList.substring(0, 1021) + '...' : templateList,
            inline: false
          }
        ]
      );

      await interaction.reply({ embeds: [successEmbed], ephemeral: true });
    } catch (error) {
      console.error('[ERROR] Error en template list:', error);
      const errorEmbed = createErrorEmbed(
        "Error al Listar Templates",
        "No se pudieron obtener los templates del servidor."
      );
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },  // =============== TEMPLATE CREATE ===============
  async executeCreate(interaction) {
    const isPremium = await isServerPremium(interaction.guild.id);
    if (!isPremium) {
      const premiumEmbed = createPremiumEmbed();
      return await interaction.reply({ embeds: [premiumEmbed], ephemeral: true });
    }

    // Mostrar directamente el modal simplificado
    await this.showTemplateModal(interaction);
  },

  // Mostrar modal simplificado (solo title, description, image)
  async showTemplateModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('template_basic_info_modal')
      .setTitle('Crear Nuevo Template');

    const titleInput = new TextInputBuilder()
      .setCustomId('template_title')
      .setLabel('Título del Template')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ej: Raid Semanal')
      .setRequired(true)
      .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('template_description')
      .setLabel('Descripción')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Descripción del evento...')
      .setRequired(true)
      .setMaxLength(1000);

    const imageInput = new TextInputBuilder()
      .setCustomId('template_image')
      .setLabel('URL de la imagen')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://ejemplo.com/imagen.png')
      .setValue('https://media.discordapp.net/attachments/1289065983071223864/1419911950954926201/hNAKGAl.jpeg?ex=68d61e8d&is=68d4cd0d&hm=e68da2ac32a28aa08f3797b7560657a78c0b438bb419be74492bb62703f48b91&=&format=webp&width=1230&height=694')
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
    const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
    const thirdActionRow = new ActionRowBuilder().addComponents(imageInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
    await interaction.showModal(modal);
  },

  // =============== TEMPLATE EDIT ===============
  async executeEdit(interaction) {
    try {
      const isPremium = await isServerPremium(interaction.guild.id);
      if (!isPremium) {
        const premiumEmbed = createPremiumEmbed();
        return await interaction.reply({ embeds: [premiumEmbed], ephemeral: true });
      }

      const templateName = interaction.options.getString("template");
      const template = await getTemplateByName(templateName, interaction.guild.id);

      if (!template) {
        const errorEmbed = createErrorEmbed(
          "Template No Encontrado",
          `No se encontró un template con el nombre "${templateName}".`
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      console.log('[DEBUG] template-edit - Original template.weapons:', template.weapons);
      console.log('[DEBUG] template-edit - weapons type:', typeof template.weapons);
      console.log('[DEBUG] template-edit - is Array:', Array.isArray(template.weapons));

      // Crear sesión para este usuario
      const sessionId = `${interaction.user.id}_${interaction.guild.id}_${Date.now()}`;
      console.log('[DEBUG] template-edit execute - Creando sesión con ID:', sessionId);
      templateEditSessions.set(sessionId, {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        templateId: template._id,
        originalData: template,
        lastActivity: Date.now(),
        data: {
          title: template.title,
          description: template.description,
          image: template.image,
          weapons: Array.isArray(template.weapons) ? template.weapons :
            (template.weapons && typeof template.weapons === 'object') ?
              Object.values(template.weapons).map(weaponGroup => {
                // Si es formato antiguo (sin estructura de grupo)
                if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
                  return {
                    name: weaponGroup.displayName || weaponGroup.category || 'Grupo Sin Nombre',
                    defaultEmoji: weaponGroup.defaultEmoji || '⚔️',
                    categories: [{
                      name: weaponGroup.category || 'General',
                      weapons: weaponGroup.data
                    }]
                  };
                }
                // Si ya tiene el formato correcto
                return weaponGroup;
              }) : []
        },
        hasChanges: false,
        step: 'overview'
      });

      // Debug: Verificar la conversión de weapons
      const sessionData = templateEditSessions.get(sessionId);
      console.log('[DEBUG] template-edit - weapons después de conversión:', sessionData.data.weapons);
      console.log('[DEBUG] template-edit - weapons es array después de conversión:', Array.isArray(sessionData.data.weapons));
      console.log('[DEBUG] template-edit - weapons length:', sessionData.data.weapons?.length);

      await this.showEditOverview(interaction, sessionId);
    } catch (error) {
      console.error('[ERROR] Error en template edit:', error);
      const errorEmbed = createErrorEmbed("Error", "Hubo un error al procesar tu solicitud.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Función para mostrar el menú principal de edición del template
  async showEditOverview(interaction, sessionId) {
    try {
      const session = templateEditSessions.get(sessionId);
      if (!session) {
        const errorEmbed = createErrorEmbed("Error", "Sesión de edición no encontrada.");
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      const template = session.data;

      // Helper para mostrar emojis correctamente en texto de embeds
      const { client } = require('../../utils/client');
      const renderEmoji = (emojiLike) => {
        if (!emojiLike) return '⚔️';
        // Si es unicode (contiene caracteres no dígitos o es corto), devolver tal cual
        if (typeof emojiLike === 'string' && !/^\d{15,20}$/.test(emojiLike)) return emojiLike;
        const id = String(emojiLike);
        try {
          // Buscar en cache global del cliente primero
          const globalEmoji = client?.emojis?.cache?.get(id);
          if (globalEmoji) return globalEmoji.toString();
          // Fallback: intentar en el guild actual
          const guildEmoji = interaction.guild?.emojis?.cache?.get(id);
          if (guildEmoji) return guildEmoji.toString();
        } catch { }
        // Fallback: usar la mención directa para que Discord lo renderice si existe en el guild
        return `<:e:${id}>`;
      };

      const embed = new EmbedBuilder()
        .setTitle('📝 Editor de Templates')
        .setDescription(`**${template.title}**\n\n¿Qué deseas editar?`)
        .setColor(0x00FFFF)
        .addFields([
          {
            name: '📋 Información Básica',
            value: `Título: \`${template.title}\``,
            inline: true
          },
          {
            name: '📝 Descripción',
            value: template.description.length > 150
              ? template.description.substring(0, 150) + '...'
              : template.description,
            inline: false
          },
          {
            name: '⚔️ Grupos de Armas',
            value: template.weapons && template.weapons.length > 0
              ? template.weapons.map((weaponGroup, index) => {
                const totalWeapons = weaponGroup.categories.reduce((total, cat) => total + (cat.weapons?.length || 0), 0);
                const categoryNames = weaponGroup.categories.map(cat => cat.name).join(', ');
                const groupName = weaponGroup.name || weaponGroup.displayName || `Grupo ${index + 1}`;
                const emojiRendered = renderEmoji(weaponGroup.defaultEmoji);
                return `• ${emojiRendered} ${groupName} (${totalWeapons} armas) - ${categoryNames}`;
              }).join('\n')
              : 'Sin grupos configurados',
            inline: false
          }
        ]);

      if (template.image) {
        embed.setThumbnail(template.image);
      }

      // Mostrar todas las opciones directamente
      const editOptionsRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`template_edit_basic_${sessionId}`)
            .setLabel('Información Básica')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
          new ButtonBuilder()
            .setCustomId(`template_edit_weapons_${sessionId}`)
            .setLabel('Gestionar Armas')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⚔️')
        );

      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`template_edit_preview_${sessionId}`)
            .setLabel('Vista Previa')
            .setStyle(ButtonStyle.Success)
            .setEmoji('👁️'),
          new ButtonBuilder()
            .setCustomId(`template_edit_save_${sessionId}`)
            .setLabel('Guardar Cambios')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💾')
        );

      const cancelRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`template_edit_cancel_${sessionId}`)
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
        );

      await interaction.reply({
        embeds: [embed],
        components: [editOptionsRow, actionRow, cancelRow],
        ephemeral: true
      });

    } catch (error) {
      console.error('[ERROR] Error en showEditOverview:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al mostrar el editor del template.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Manejador principal de botones del editor
  async handleEditButton(interaction) {
    try {
      const customId = interaction.customId;
      console.log('[DEBUG] Template Edit Button:', customId);

      // Manejar casos especiales primero
      if (customId.includes('template_edit_weapons_add_new_')) {
        const sessionId = customId.replace('template_edit_weapons_add_new_', '');
        const session = templateEditSessions.get(sessionId);
        console.log('[DEBUG] Buscando sesión con ID (add_new):', sessionId);
        console.log('[DEBUG] Sesiones disponibles:', Array.from(templateEditSessions.keys()));
        console.log('[DEBUG] Sesión encontrada:', !!session);
        if (!session) {
          return await interaction.reply({ content: 'Sesión de edición expirada. Reinicia la edición.', ephemeral: true });
        }
        return await this.handleAddNewWeaponGroup(interaction, sessionId);
      }

      if (customId.includes('template_edit_weapons_delete_')) {
        const sessionId = customId.replace('template_edit_weapons_delete_', '');
        const session = templateEditSessions.get(sessionId);
        if (!session) {
          return await interaction.reply({ content: 'Sesión de edición expirada. Reinicia la edición.', ephemeral: true });
        }
        return await this.handleDeleteWeaponGroup(interaction, sessionId);
      }

      // Manejar botones de edición de grupos específicos
      if (customId.startsWith('group_edit_')) {
        return await this.handleGroupEditButton(interaction, customId);
      } else if (customId.startsWith('group_')) {
        return await handleGroupButton(interaction, customId);
      }

      // MANEJAR CASOS ESPECIALES PRIMERO (antes del parsing general)

      // Manejar roles_clear específicamente
      if (customId.includes('_roles_clear_')) {
        const actualSessionId = customId.replace('template_edit_roles_clear_', '');
        console.log('[DEBUG] Roles Clear - SessionId extraído:', actualSessionId);
        const session = templateEditSessions.get(actualSessionId);
        console.log('[DEBUG] Roles Clear - Sesión encontrada:', !!session);
        if (!session) {
          return await interaction.reply({ content: 'Sesión de edición expirada. Reinicia la edición.', ephemeral: true });
        }
        return await this.handleRolesClear(interaction, actualSessionId);
      }

      // Manejar weapons_add específicamente  
      if (customId.includes('_weapons_add_')) {
        const actualSessionId = customId.replace('template_edit_weapons_add_', '');
        const session = templateEditSessions.get(actualSessionId);
        if (!session) {
          return await interaction.reply({ content: 'Sesión de edición expirada. Reinicia la edición.', ephemeral: true });
        }
        return await this.handleWeaponsAdd(interaction, actualSessionId);
      }

      // Manejar weapons_remove específicamente
      if (customId.includes('_weapons_remove_')) {
        const actualSessionId = customId.replace('template_edit_weapons_remove_', '');
        const session = templateEditSessions.get(actualSessionId);
        if (!session) {
          return await interaction.reply({ content: 'Sesión de edición expirada. Reinicia la edición.', ephemeral: true });
        }
        return await this.handleWeaponsRemove(interaction, actualSessionId);
      }

      // Extraer sessionId del customId para casos normales
      const parts = customId.split('_');
      if (parts.length < 4 || parts[0] !== 'template' || parts[1] !== 'edit') {
        return await interaction.reply({ content: 'ID de sesión inválido.', ephemeral: true });
      }

      const action = parts[2];
      const sessionId = parts.slice(3).join('_'); // Reconstruir sessionId que puede contener guiones bajos

      const session = templateEditSessions.get(sessionId);
      console.log('[DEBUG] Casos normales - Buscando sesión con ID:', sessionId);
      console.log('[DEBUG] Casos normales - Sesiones disponibles:', Array.from(templateEditSessions.keys()));
      console.log('[DEBUG] Casos normales - Sesión encontrada:', !!session);

      if (!session) {
        return await interaction.reply({ content: 'Sesión de edición expirada. Reinicia la edición.', ephemeral: true });
      }

      switch (action) {
        case 'all':
          await this.showEditAllModal(interaction, sessionId);
          break;
        case 'basic':
          await this.showEditBasicModal(interaction, sessionId);
          break;
        case 'description':
          await this.showEditDescriptionModal(interaction, sessionId);
          break;
        case 'config':
          await this.showEditConfigModal(interaction, sessionId);
          break;
        case 'roles':
          // Solo casos normales, los especiales ya se manejaron arriba
          await this.showEditRoles(interaction, sessionId);
          break;
        case 'weapons':
          // Solo casos normales, los especiales ya se manejaron arriba
          await this.showEditWeapons(interaction, sessionId);
          break;
        case 'image':
          await this.showEditImageModal(interaction, sessionId);
          break;
        case 'preview':
          await this.showEditPreview(interaction, sessionId);
          break;
        case 'save':
          await this.saveTemplateChanges(interaction, sessionId);
          break;
        case 'cancel':
          await this.cancelTemplateEdit(interaction, sessionId);
          break;
        case 'back':
          await this.showEditOverview(interaction, sessionId);
          break;
        default:
          // Manejar casos especiales con múltiples partes
          if (customId.includes('weapons_back_') || customId.includes('weapons_remove_specific_')) {
            if (customId.includes('back_')) {
              await this.showEditWeapons(interaction, sessionId);
            } else if (customId.includes('remove_specific_')) {
              // Extraer el key del grupo y sessionId
              const parts = customId.split('_');
              const groupKey = parts[4]; // template_edit_weapons_remove_specific_KEY_sessionId
              const actualSessionId = parts.slice(5).join('_');
              await this.handleWeaponRemoveSpecific(interaction, actualSessionId, groupKey);
            }
          } else {
            await interaction.reply({ content: 'Acción no reconocida.', ephemeral: true });
          }
          break;
      }
    } catch (error) {
      console.error('[ERROR] Error en handleEditButton:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al procesar la acción de edición.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // =============== TEMPLATE DELETE ===============
  async executeDelete(interaction) {
    try {
      const isPremium = await isServerPremium(interaction.guild.id);
      if (!isPremium) {
        const premiumEmbed = createPremiumEmbed();
        return await interaction.reply({ embeds: [premiumEmbed], ephemeral: true });
      }

      const templateName = interaction.options.getString("template");
      const template = await getTemplateByName(templateName, interaction.guild.id);

      if (!template) {
        const errorEmbed = createErrorEmbed(
          "Template No Encontrado",
          `No se encontró un template con el nombre "${templateName}".`
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      // Crear embed de confirmación usando el sistema estandarizado
      const confirmEmbed = createErrorEmbed(
        "Confirmar Eliminación de Template",
        `¿Estás seguro de que quieres eliminar el template **"${template.title}"**?\n\n⚠️ **Esta acción no se puede deshacer**`,
        [
          {
            name: "📋 Información del Template",
            value: [
              `**📝 Título:** ${template.title}`,
              `**📄 Descripción:** ${template.description.length > 80 ? template.description.substring(0, 80) + '...' : template.description}`,
              `**⚔️ Grupos de armas:** ${Object.keys(template.weapons || {}).length}`
            ].join('\n'),
            inline: false
          },
          {
            name: "🚨 Advertencia Importante",
            value: "• Se perderán todos los datos del template\n• Los raids activos con este template no se verán afectados\n• No podrás recuperar esta información después",
            inline: false
          }
        ]
      );

      const confirmButton = new ButtonBuilder()
        .setCustomId(`template_delete_confirm_${template._id}`)
        .setLabel('Confirmar Eliminación')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️');

      const cancelButton = new ButtonBuilder()
        .setCustomId(`template_delete_cancel_${template._id}`)
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌');

      const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

      await interaction.reply({
        embeds: [confirmEmbed],
        components: [row],
        ephemeral: true
      });

    } catch (error) {
      console.error('[ERROR] Error en template delete:', error);
      const errorEmbed = createErrorEmbed("Error", "Hubo un error al procesar la eliminación.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // =============== TEMPLATE CLONE ===============
  async executeClone(interaction) {
    try {
      const isPremium = await isServerPremium(interaction.guild.id);
      if (!isPremium) {
        const premiumEmbed = createPremiumEmbed();
        return await interaction.reply({ embeds: [premiumEmbed], ephemeral: true });
      }

      const templateName = interaction.options.getString("template");
      const newName = interaction.options.getString("name");

      const originalTemplate = await getTemplateByName(templateName, interaction.guild.id);
      if (!originalTemplate) {
        const errorEmbed = createErrorEmbed(
          "Template No Encontrado",
          `No se encontró un template con el nombre "${templateName}".`
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      // Verificar que el nuevo nombre no exista
      const existingTemplate = await getTemplateByName(newName, interaction.guild.id);
      if (existingTemplate) {
        const errorEmbed = createErrorEmbed(
          "Nombre Ya Existe",
          `Ya existe un template con el nombre "${newName}". Elige un nombre diferente.`
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      // Crear el nuevo template copiando todos los datos del original
      const newTemplateData = {
        title: newName,
        description: originalTemplate.description,
        image: originalTemplate.image,
        weapons: originalTemplate.weapons || {}
      };

      const clonedTemplate = await createTemplate(newTemplateData, interaction.guild.id);

      // Mostrar éxito
      const successEmbed = createSuccessEmbed(
        'Template Clonado',
        `Se ha creado exitosamente el template "${newName}" basado en "${originalTemplate.title}".`,
        [
          {
            name: '📋 Detalles del Clone',
            value: [
              `**Nombre original:** ${originalTemplate.title}`,
              `**Nuevo nombre:** ${newName}`,
              `**Descripción:** ${newTemplateData.description}`,
              `**Grupos de armas:** ${Object.keys(newTemplateData.weapons).length} grupos`
            ].join('\n'),
            inline: false
          }
        ]
      );

      await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
      console.error('[ERROR] Error en template-clone:', error);
      const errorEmbed = createErrorEmbed(
        "Error al Clonar",
        "Hubo un error al clonar el template. Inténtalo de nuevo."
      );

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (['edit', 'delete', 'clone'].includes(subcommand)) {
        const templates = await getTemplatesByServer(interaction.guild.id);
        const focusedValue = interaction.options.getFocused();
        const filtered = templates.filter(template =>
          template.title.toLowerCase().includes(focusedValue.toLowerCase())
        );

        await interaction.respond(
          filtered.slice(0, 25).map(template => ({
            name: template.title,
            value: template.title,
          }))
        );
      }
    } catch (error) {
      console.error(`[ERROR] Error en autocomplete template ${subcommand}:`, error);
      await interaction.respond([]);
    }
  },

  // =============== EVENT HANDLERS ===============


  async handleModalSubmit(interaction) {
    try {
      // Manejo de modals de creación de templates
      if (interaction.customId === 'template_basic_info_modal') {
        await this.handleBasicInfoModal(interaction);
      }
      // Manejo de modals de edición del template editor
      else if (interaction.customId.includes('template_edit_') && interaction.customId.includes('_submit_')) {
        console.log('[DEBUG] Procesando modal del editor:', interaction.customId);
        try {
          await this.handleEditModalSubmit(interaction);
        } catch (editError) {
          console.error('[ERROR] Error en modal de edición:', editError);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Error al procesar el modal de edición.', ephemeral: true });
          }
        }
        return;
      }
      // Manejo de modals de grupos de armas
      else if (interaction.customId.startsWith('add_weapon_modal_')) {
        await this.handleAddWeaponModalSubmit(interaction);
        return;
      }
      else if (interaction.customId.startsWith('edit_weapon_modal_')) {
        await this.handleEditWeaponModalSubmit(interaction);
        return;
      }
      else if (interaction.customId.startsWith('new_group_modal_')) {
        await this.handleNewGroupModalSubmit(interaction);
        return;
      }
      else if (interaction.customId.startsWith('weapon_config_modal_')) {
        await handleWeaponConfigModal(interaction);
        return;
      }
      // Mapear otros modals de creación a sus handlers específicos
      else if (interaction.customId.startsWith('template_')) {
        const createHandlers = require('../../lib/template/template-create-handlers');

        if (interaction.customId.includes('basic_weapon_group')) {
          await createHandlers.handleBasicWeaponGroupSubmit(interaction);
        } else if (interaction.customId.includes('single_weapon_config')) {
          await createHandlers.handleSingleWeaponConfigSubmit(interaction);
        } else if (interaction.customId.includes('weapon_config')) {
          await createHandlers.handleWeaponConfigSubmit(interaction);
        } else if (interaction.customId.includes('group_config')) {
          await createHandlers.handleGroupConfigSubmit(interaction);
        } else if (interaction.customId.includes('additional_config')) {
          await this.handleAdditionalConfigModal(interaction);
        } else {
          console.warn('[WARN] Modal de template no reconocido:', interaction.customId);
        }
      }
    } catch (error) {
      console.error('[ERROR] Error en handleModalSubmit:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Error al procesar el modal.', ephemeral: true });
      }
    }
  },

  async handleSelectMenu(interaction) {
    try {
      // Para template-edit, manejar select menus de edición
      if (interaction.customId.startsWith('template_edit_')) {
        if (interaction.customId.includes('roles_select_')) {
          await this.handleRolesSelect(interaction);
        } else if (interaction.customId.includes('weapon_group_select_')) {
          // Manejar selección de grupo de armas para editar
          console.log('[DEBUG] Select menu detectado - customId completo:', interaction.customId);
          const sessionId = interaction.customId.replace('template_edit_weapon_group_select_', '');
          console.log('[DEBUG] SessionId extraído del customId:', sessionId);
          console.log('[DEBUG] Values seleccionados:', interaction.values);
          await this.handleEditWeaponGroupSelect(interaction, sessionId);
        } else if (interaction.customId.includes('delete_confirm_')) {
          // Manejar confirmación de eliminación de grupo
          const sessionId = interaction.customId.replace('template_edit_delete_confirm_', '');
          await this.handleDeleteWeaponGroupConfirm(interaction, sessionId);
        } else {
          console.warn('[WARN] Select menu de edit no reconocido:', interaction.customId);
        }
        return;
      }

      // Manejar selects de grupos de armas
      if (interaction.customId.startsWith('group_emoji_select_')) {
        console.log('[DEBUG] Group emoji select detectado - customId:', interaction.customId);
        console.log('[DEBUG] Values seleccionados:', interaction.values);
        await handleGroupEmojiSelect(interaction);
        return;
      }
      if (interaction.customId.startsWith('select_weapon_edit_')) {
        await this.handleSelectWeaponEdit(interaction);
        return;
      }
      if (interaction.customId.startsWith('select_weapon_remove_')) {
        await this.handleSelectWeaponRemove(interaction);
        return;
      }
      if (interaction.customId.startsWith('confirm_delete_group_')) {
        await this.handleConfirmDeleteGroup(interaction);
        return;
      }
      if (interaction.customId.startsWith('back_to_group_')) {
        await this.handleBackToGroup(interaction);
        return;
      }

      // Mapear select menus de creación a handlers específicos
      if (interaction.customId.startsWith('template_')) {
        const createHandlers = require('../../lib/template/template-create-handlers');

        if (interaction.customId.includes('_roles_')) {
          await createHandlers.handleRoleSelection(interaction);
        } else if (interaction.customId.includes('weapon_selection')) {
          await createHandlers.handleWeaponSelection(interaction);
        } else if (interaction.customId.includes('category_selection')) {
          await createHandlers.handleWeaponCategorySelection(interaction);
        } else if (interaction.customId.includes('emoji_category_')) {
          await createHandlers.handleEmojiCategorySelection(interaction);
        } else if (interaction.customId.includes('emoji_weapon_')) {
          await createHandlers.handleEmojiWeaponSelection(interaction);
        } else if (interaction.customId.includes('multi_category_')) {
          await createHandlers.handleMultiCategorySelection(interaction);
        } else if (interaction.customId.includes('add_weapons_')) {
          await createHandlers.handleAddWeapons(interaction);
        } else {
          console.warn('[WARN] Select menu de template no reconocido:', interaction.customId);
        }
      }
    } catch (error) {
      console.error('[ERROR] Error en handleSelectMenu:', error);
      console.error('[ERROR] CustomId que causó el error:', interaction.customId);
      console.error('[ERROR] User:', interaction.user.id);
      console.error('[ERROR] Guild:', interaction.guild.id);
      console.error('[ERROR] Values:', interaction.values);
      console.error('[ERROR] Error stack:', error.stack);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `Error al procesar el menú: ${error.message}`,
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: `Error al procesar el menú: ${error.message}`,
          ephemeral: true
        });
      }
    }
  },

  // =============== CREATE HANDLERS ===============
  async handleBasicInfoModal(interaction) {
    try {
      // Extraer datos del modal (solo title, description, image)
      const title = interaction.fields.getTextInputValue('template_title');
      const description = interaction.fields.getTextInputValue('template_description');
      const image = interaction.fields.getTextInputValue('template_image');

      // Crear sesión usando el sistema existente
      const { createSession } = require('../../lib/template/template-sessions');
      const sessionId = `${Date.now()}`;
      console.log('🔄 Creando nueva sesión con id:', sessionId);

      createSession(sessionId, {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        step: 'weapon_categories',
        data: {
          title,
          description,
          image,
          weapons: {}
        }
      });

      // Ir directamente a la configuración de armas
      const { showWeaponCategorySelection } = require('../../lib/template/template-create-handlers');
      await showWeaponCategorySelection(interaction, sessionId);

    } catch (error) {
      console.error('[ERROR] Error en handleBasicInfoModal:', error);

      const errorEmbed = createErrorEmbed(
        "Error al Procesar Template",
        "Ocurrió un error al procesar la información del template.",
        [
          {
            name: "🔍 Verifica los Datos",
            value: "• El color debe ser un código hex válido (ej: #FF0000)\n• La URL de imagen debe ser válida\n• Todos los campos son obligatorios",
            inline: false
          }
        ]
      );

      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  async handleButton(interaction) {
    try {
      console.log('🔄 [DEBUG] Botón detectado:', interaction.customId);
      console.log('🔄 [DEBUG] handleButton llamado con customId:', interaction.customId);
      console.log('🔄 [DEBUG] Button type check - includes template_confirm_:', interaction.customId.includes('template_confirm_'));
      // Manejar botones de edición del template editor
      if (interaction.customId.startsWith('template_edit_')) {
        console.log('[DEBUG] Procesando botón del editor:', interaction.customId);
        await this.handleEditButton(interaction);
        return;
      } else if (interaction.customId.includes('delete_confirm') || interaction.customId.includes('delete_cancel')) {
        // Manejar botones de confirmación de eliminación
        if (interaction.customId.includes('delete_confirm')) {
          await this.handleDeleteConfirm(interaction);
        } else {
          await this.handleDeleteCancel(interaction);
        }
      } else if (interaction.customId.startsWith('template_')) {
        // Mapear botones específicos a sus handlers
        const createHandlers = require('../../lib/template/template-create-handlers');

        if (interaction.customId.includes('_roles_')) {
          await createHandlers.handleRoleSelection(interaction);
        } else if (interaction.customId.includes('add_weapon_group')) {
          await createHandlers.handleAddWeaponGroup(interaction);
        } else if (interaction.customId.includes('finish_weapons')) {
          // Verificar si es una sesión de edición o creación
          const { extractSessionId } = require('../../lib/template/template-create-navigation');
          const { getTemplateCreationSessions } = require('../../lib/template/template-sessions');
          const sessionId = extractSessionId(interaction.customId);
          const creationSessions = getTemplateCreationSessions();
          const session = creationSessions.get(sessionId);

          await interaction.deferUpdate();

          if (session && session.isEdit) {
            // Es una sesión de edición, sincronizar datos y volver al editor
            await this.syncFromCreationToEdit(sessionId, {
              weapons: session.data.weapons
            });

            // Limpiar sesión temporal de creación
            creationSessions.delete(sessionId);

            // Volver al editor principal
            await this.showEditOverview(interaction, sessionId);
          } else {
            // Es una sesión de creación normal, mostrar resumen final
            const { showFinalSummary } = require('../../lib/template/template-create-navigation');
            await showFinalSummary(interaction, sessionId);
          }
        } else if (interaction.customId.includes('template_finish_group_')) {
          await createHandlers.handleFinishGroup(interaction);
        } else if (interaction.customId.includes('continue_') || interaction.customId.includes('skip_')) {
          // Delegar a navigation handlers
          const { handleContinue } = require('../../lib/template/template-create-navigation');
          await handleContinue(interaction);
        } else if (interaction.customId.includes('_back_')) {
          // Delegar a navigation handlers
          const { handleBack } = require('../../lib/template/template-create-navigation');
          await handleBack(interaction);
        } else if (interaction.customId.includes('add_weapons')) {
          await createHandlers.handleAddWeapons(interaction);
        } else if (interaction.customId.includes('back_to_categories')) {
          // Delegar a navigation handlers para botón de volver
          const { handleBack } = require('../../lib/template/template-create-navigation');
          await handleBack(interaction);
        } else if (interaction.customId.includes('template_confirm_')) {
          // Manejar confirmación final del template
          console.log('[DEBUG] Detected template_confirm_ button, calling handleConfirm');
          const { handleConfirm } = require('../../lib/template/template-create-navigation');
          await handleConfirm(interaction);
        } else if (interaction.customId.includes('template_cancel_')) {
          // Manejar cancelación del template
          const { handleCancel } = require('../../lib/template/template-create-navigation');
          await handleCancel(interaction);
        } else {
          // Handler genérico para otros botones
          console.warn('[WARN] Botón de template no reconocido:', interaction.customId);
        }
      }
    } catch (error) {
      console.error('[ERROR] Error en handleButtonInteraction:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Error al procesar la interacción.', ephemeral: true });
      }
    }
  },





  // =============== DELETE HANDLERS ===============
  async handleDeleteConfirm(interaction) {
    try {
      const templateId = interaction.customId.replace('template_delete_confirm_', '');

      await interaction.deferUpdate();

      const deletedTemplate = await deleteTemplate(templateId);

      if (deletedTemplate) {
        const successEmbed = createSuccessEmbed(
          "Template Eliminado Exitosamente",
          `El template **"${deletedTemplate.title}"** ha sido eliminado correctamente del servidor.`,
          [
            {
              name: "📋 Template Eliminado",
              value: [
                `**📝 Título:** ${deletedTemplate.title}`,
                `**📄 Descripción:** ${deletedTemplate.description}`,
                `**🗓️ Eliminado:** <t:${Math.floor(Date.now() / 1000)}:F>`
              ].join('\n'),
              inline: false
            },
            {
              name: "ℹ️ Información Adicional",
              value: "• Los raids activos con este template no se ven afectados\n• Puedes crear un nuevo template con el mismo nombre si lo deseas",
              inline: false
            }
          ]
        );

        await interaction.editReply({
          embeds: [successEmbed],
          components: []
        });
      } else {
        throw new Error('Template no encontrado');
      }

    } catch (error) {
      console.error('[ERROR] Error al eliminar template:', error);

      const errorEmbed = createErrorEmbed(
        "Error al Eliminar Template",
        "No se pudo completar la eliminación del template.",
        [
          {
            name: "🔍 Posibles Causas",
            value: "• El template ya fue eliminado por otro administrador\n• Error temporal de conexión a la base de datos\n• El template está siendo usado en un raid activo",
            inline: false
          },
          {
            name: "💡 Soluciones",
            value: "• Verifica si el template aún existe con `/template list`\n• Intenta nuevamente en unos momentos\n• Contacta al soporte si el problema persiste",
            inline: false
          }
        ]
      );

      await interaction.editReply({
        embeds: [errorEmbed],
        components: []
      });
    }
  },

  async handleDeleteCancel(interaction) {
    const embed = createInfoEmbed(
      "Eliminación Cancelada",
      "La eliminación del template fue cancelada. El template permanece intacto en el servidor.",
      [
        {
          name: "💡 ¿Qué puedes hacer ahora?",
          value: "• Usar `/template edit` para modificar el template\n• Usar `/template list` para ver todos los templates\n• Usar `/template clone` para crear una copia",
          inline: false
        }
      ]
    );

    await interaction.update({
      embeds: [embed],
      components: []
    });
  },

  async handleButton(interaction) {
    try {
      console.log('🔄 [DEBUG] Botón detectado:', interaction.customId);
      console.log('🔄 [DEBUG] handleButton llamado con customId:', interaction.customId);

      // Manejar botones de navegación de vuelta
      if (interaction.customId.startsWith('back_to_group_')) {
        // Formato: back_to_group_sessionId_groupIndex
        const parts = interaction.customId.replace('back_to_group_', '').split('_');
        const sessionId = parts[0];
        const groupIndex = parseInt(parts[1]);

        const session = templateEditSessions.get(sessionId);
        if (session) {
          const weaponGroup = session.data.weapons[groupIndex];
          await this.showGroupEditInterface(interaction, sessionId, weaponGroup, groupIndex);
        }
        return;
      }

      if (interaction.customId.startsWith('back_to_weapons_')) {
        console.log('🔄 [DEBUG] Botón back_to_weapons detectado:', interaction.customId);
        const sessionId = interaction.customId.replace('back_to_weapons_', '');
        console.log('🔄 [DEBUG] SessionId extraído:', sessionId);

        // Verificar si la sesión existe
        const session = templateEditSessions.get(sessionId);
        console.log('🔄 [DEBUG] Sesión encontrada:', !!session);
        console.log('🔄 [DEBUG] Sesiones disponibles:', Array.from(templateEditSessions.keys()));

        if (!session) {
          const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado. Por favor, inicia el comando nuevamente.');
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          return;
        }

        await this.showEditWeapons(interaction, sessionId);
        return;
      }

      // Manejar botones de edición del template editor
      if (interaction.customId.startsWith('template_edit_')) {
        console.log('[DEBUG] Procesando botón del editor:', interaction.customId);
        await this.handleEditButton(interaction);
        return;
      }

      // Los botones template_edit_back_ ya se manejan en handleEditButton
      // por el case 'back', no necesitan handler especial aquí

      // Manejar botones de confirmación de eliminación
      if (interaction.customId.includes('delete_confirm') || interaction.customId.includes('delete_cancel')) {
        if (interaction.customId.includes('delete_confirm')) {
          await this.handleDeleteConfirm(interaction);
        } else {
          await this.handleDeleteCancel(interaction);
        }
        return;
      }

      // Si es un botón de creación de templates, delegarlo al sistema de creación
      if (interaction.customId.startsWith('template_')) {
        const createHandlers = require('../../lib/template/template-create-handlers');

        if (interaction.customId.includes('_roles_')) {
          await createHandlers.handleRoleSelection(interaction);
        } else if (interaction.customId.includes('add_weapon_group')) {
          await createHandlers.handleAddWeaponGroup(interaction);
        } else if (interaction.customId.includes('finish_weapons')) {
          // Verificar si es una sesión de edición o creación
          const { extractSessionId } = require('../../lib/template/template-create-navigation');
          const { getTemplateCreationSessions } = require('../../lib/template/template-sessions');
          const sessionId = extractSessionId(interaction.customId);
          const creationSessions = getTemplateCreationSessions();
          const session = creationSessions.get(sessionId);

          await interaction.deferUpdate();

          if (session && session.isEdit) {
            // Es una sesión de edición, sincronizar datos y volver al editor
            await this.syncFromCreationToEdit(sessionId, {
              weapons: session.data.weapons
            });

            // Limpiar sesión temporal de creación
            creationSessions.delete(sessionId);

            // Volver al editor principal
            await this.showEditOverview(interaction, sessionId);
          } else {
            // Es una sesión de creación normal, mostrar resumen final
            const { showFinalSummary } = require('../../lib/template/template-create-navigation');
            await showFinalSummary(interaction, sessionId);
          }
        } else if (interaction.customId.includes('template_finish_group_')) {
          await createHandlers.handleFinishGroup(interaction);
        } else if (interaction.customId.includes('template_confirm_')) {
          // Manejar confirmación final del template
          console.log('[DEBUG] Detected template_confirm_ button, calling handleConfirm');
          const { handleConfirm } = require('../../lib/template/template-create-navigation');
          await handleConfirm(interaction);
        } else if (interaction.customId.includes('template_cancel_')) {
          // Manejar cancelación del template
          const { handleCancel } = require('../../lib/template/template-create-navigation');
          await handleCancel(interaction);
        } else {
          // Handler genérico para otros botones
          console.warn('[WARN] Botón de template no reconocido:', interaction.customId);
        }
      }
    } catch (error) {
      console.error('[ERROR] Error en handleButton:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Error al procesar la interacción.', ephemeral: true });
      }
    }
  },

  // Modal para mostrar todas las opciones de edición
  async showEditAllModal(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);
    const template = session.data;

    // Crear un embed con todas las opciones de edición
    const embed = new EmbedBuilder()
      .setTitle('🛠️ Editor de Template')
      .setDescription(`**Template:** ${template.title}\n\nSelecciona qué deseas editar:`)
      .setColor(template.color || '#0099ff');

    const editOptionsRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`template_edit_basic_${sessionId}`)
          .setLabel('📝 Información Básica')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📝'),
        new ButtonBuilder()
          .setCustomId(`template_edit_weapons_${sessionId}`)
          .setLabel('⚔️ Gestionar Armas')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚔️'),
        new ButtonBuilder()
          .setCustomId(`template_edit_roles_${sessionId}`)
          .setLabel('👥 Roles a Notificar')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('👥')
      );

    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`template_edit_preview_${sessionId}`)
          .setLabel('👁️ Vista Previa')
          .setStyle(ButtonStyle.Success)
          .setEmoji('👁️'),
        new ButtonBuilder()
          .setCustomId(`template_edit_save_${sessionId}`)
          .setLabel('💾 Guardar Cambios')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💾'),
        new ButtonBuilder()
          .setCustomId(`template_edit_cancel_${sessionId}`)
          .setLabel('❌ Cancelar')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );

    await interaction.reply({
      embeds: [embed],
      components: [editOptionsRow, actionRow],
      ephemeral: true
    });
  },

  // Modal para editar información básica (título, descripción, imagen, tiempo, color)
  async showEditBasicModal(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);
    const template = session.data;

    const modal = new ModalBuilder()
      .setCustomId(`template_edit_basic_submit_${sessionId}`)
      .setTitle('Editar Información Básica');

    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Título del Template')
      .setStyle(TextInputStyle.Short)
      .setValue(template.title || '')
      .setRequired(true)
      .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Descripción del Template')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(template.description || '')
      .setRequired(true)
      .setMaxLength(4000);

    const imageInput = new TextInputBuilder()
      .setCustomId('image')
      .setLabel('URL de la Imagen (opcional)')
      .setStyle(TextInputStyle.Short)
      .setValue(template.image || '')
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descriptionInput),
      new ActionRowBuilder().addComponents(imageInput)
    );

    await interaction.showModal(modal);
  },

  // Modal para editar descripción
  async showEditDescriptionModal(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);
    const template = session.data;

    const modal = new ModalBuilder()
      .setCustomId(`template_edit_description_submit_${sessionId}`)
      .setTitle('Editar Descripción');

    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Descripción del Template')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(template.description || '')
      .setRequired(true)
      .setMaxLength(4000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(descriptionInput)
    );

    await interaction.showModal(modal);
  },

  // Modal para editar configuración (recordatorio, notifyAll)
  async showEditConfigModal(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);
    const template = session.data;

    const modal = new ModalBuilder()
      .setCustomId(`template_edit_config_submit_${sessionId}`)
      .setTitle('Editar Configuración');

    const reminderInput = new TextInputBuilder()
      .setCustomId('reminder')
      .setLabel('Tiempo de Recordatorio (ej: 5m, 10m, 1h)')
      .setStyle(TextInputStyle.Short)
      .setValue(template.reminder || '5m')
      .setRequired(false)
      .setMaxLength(10);

    const notifyAllInput = new TextInputBuilder()
      .setCustomId('notifyAll')
      .setLabel('Notificar a Todos (Escribir: si o no)')
      .setStyle(TextInputStyle.Short)
      .setValue(template.notifyAll ? 'si' : 'no')
      .setRequired(false)
      .setMaxLength(5);

    modal.addComponents(
      new ActionRowBuilder().addComponents(reminderInput),
      new ActionRowBuilder().addComponents(notifyAllInput)
    );

    await interaction.showModal(modal);
  },

  // Modal para editar imagen
  async showEditImageModal(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);
    const template = session.data;

    const modal = new ModalBuilder()
      .setCustomId(`template_edit_image_submit_${sessionId}`)
      .setTitle('Editar Imagen');

    const imageInput = new TextInputBuilder()
      .setCustomId('image')
      .setLabel('URL de la Imagen (opcional)')
      .setStyle(TextInputStyle.Short)
      .setValue(template.image || '')
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(
      new ActionRowBuilder().addComponents(imageInput)
    );

    await interaction.showModal(modal);
  },

  // Manejador de envío de modales de edición
  async handleEditModalSubmit(interaction) {
    try {
      const customId = interaction.customId;
      console.log('[DEBUG] Template Edit Modal Submit:', customId);

      // Extraer tipo y sessionId - formato: template_edit_TYPE_submit_SESSIONID
      const parts = customId.split('_');
      if (parts.length < 5 || parts[0] !== 'template' || parts[1] !== 'edit' || parts[3] !== 'submit') {
        return await interaction.reply({ content: 'ID de modal inválido.', ephemeral: true });
      }

      const modalType = parts[2];
      const sessionId = parts.slice(4).join('_'); // Reconstruir sessionId que puede contener guiones bajos

      const session = templateEditSessions.get(sessionId);
      console.log('[DEBUG] Modal - Buscando sesión con ID:', sessionId);
      console.log('[DEBUG] Modal - Sesiones disponibles:', Array.from(templateEditSessions.keys()));
      console.log('[DEBUG] Modal - Sesión encontrada:', !!session);

      if (!session) {
        return await interaction.reply({ content: 'Sesión de edición expirada.', ephemeral: true });
      }

      switch (modalType) {
        case 'basic':
          await this.handleBasicEditSubmit(interaction, sessionId);
          break;
        case 'description':
          await this.handleDescriptionEditSubmit(interaction, sessionId);
          break;
        case 'config':
          await this.handleConfigEditSubmit(interaction, sessionId);
          break;
        case 'image':
          await this.handleImageEditSubmit(interaction, sessionId);
          break;
        default:
          await interaction.reply({ content: 'Tipo de modal no reconocido.', ephemeral: true });
      }
    } catch (error) {
      console.error('[ERROR] Error en handleEditModalSubmit:', error);

      // Solo responder si la interacción no ha sido respondida aún
      if (!interaction.replied && !interaction.deferred) {
        try {
          const errorEmbed = createErrorEmbed("Error", "Error al procesar el modal de edición.");
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } catch (replyError) {
          console.error('[ERROR] No se pudo enviar respuesta de error:', replyError);
        }
      }
    }
  },

  // Procesar edición de información básica
  async handleBasicEditSubmit(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);

    const title = interaction.fields.getTextInputValue('title');
    const description = interaction.fields.getTextInputValue('description');
    const image = interaction.fields.getTextInputValue('image');

    // Validar URL de imagen si se proporciona
    if (image && image.trim() !== '') {
      try {
        new URL(image);
      } catch {
        return await interaction.reply({
          content: 'URL de imagen inválida. Debe ser una URL válida.',
          ephemeral: true
        });
      }
    }

    // Actualizar datos de la sesión
    session.data.title = title;
    session.data.description = description;
    session.data.image = image.trim() || null;
    session.hasChanges = true;

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Información Básica Actualizada')
      .setDescription([
        `**Título:** ${title}`,
        `**Descripción:** ${description.length > 100 ? description.substring(0, 100) + '...' : description}`,
        `**Imagen:** ${image ? 'Configurada' : 'Sin imagen'}`
      ].join('\n'))
      .setColor(parseInt((session.data.color || '#0099ff').replace('#', ''), 16));

    if (image) {
      successEmbed.setThumbnail(image);
    }

    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  },

  // Procesar edición de descripción
  async handleDescriptionEditSubmit(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);

    const description = interaction.fields.getTextInputValue('description');

    session.data.description = description;
    session.hasChanges = true;

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Descripción Actualizada')
      .setDescription(description.length > 200 ? description.substring(0, 200) + '...' : description)
      .setColor(parseInt((session.data.color || '#0099ff').replace('#', ''), 16));

    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  },

  // Procesar edición de configuración
  async handleConfigEditSubmit(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);

    const reminder = interaction.fields.getTextInputValue('reminder');
    const notifyAllRaw = (interaction.fields.getTextInputValue('notifyAll') || '').toLowerCase().trim();

    // Aceptar múltiples variaciones para "sí"
    const notifyAll = ['si', 'sí', 's', 'yes', 'y', 'true', '1'].includes(notifyAllRaw);

    session.data.reminder = reminder || '5m';
    session.data.notifyAll = notifyAll;
    session.hasChanges = true;

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Configuración Actualizada')
      .setDescription([
        `**Recordatorio:** ${session.data.reminder}`,
        `**Notificar a Todos:** ${notifyAll ? 'Sí' : 'No'}`
      ].join('\n'))
      .setColor(parseInt((session.data.color || '#0099ff').replace('#', ''), 16));

    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  },

  // Procesar edición de imagen
  async handleImageEditSubmit(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);

    const imageUrl = interaction.fields.getTextInputValue('image');

    // Validar URL si se proporciona
    if (imageUrl && !isValidUrl(imageUrl)) {
      return await interaction.reply({
        content: 'URL de imagen inválida. Debe ser una URL válida.',
        ephemeral: true
      });
    }

    session.data.image = imageUrl || null;
    session.hasChanges = true;

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Imagen Actualizada')
      .setDescription(imageUrl ? `Imagen establecida` : 'Imagen eliminada')
      .setColor(parseInt((session.data.color || '#0099ff').replace('#', ''), 16));

    if (imageUrl) {
      successEmbed.setImage(imageUrl);
    }

    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  },

  // Obtener sesión de edición activa
  getEditSession(sessionId) {
    return templateEditSessions.get(sessionId);
  },

  // Sincronizar cambios desde sistema de creación de vuelta a sesión de edición
  async syncFromCreationToEdit(sessionId, updatedData) {
    try {
      const editSession = templateEditSessions.get(sessionId);
      if (!editSession) {
        console.warn(`[WARNING] No se encontró sesión de edición para ${sessionId}`);
        return false;
      }

      // Helper: convierte un grupo en formato de creación ({displayName, data: [...]})
      // al formato del editor ({categories: [{ name, weapons: [...] }]}).
      const convertCreationGroupToEditorGroup = (weaponConfig, existingGroup) => {
        console.log('[DEBUG] convertCreationGroupToEditorGroup: weaponConfig received:', JSON.stringify(weaponConfig, null, 2));

        const editorWeapons = (weaponConfig?.data || []).map(w => ({
          id: w.id,
          name: w.name,
          quantity: w.units,
          image: w.image || '',
          emojiId: w.emojiId, // Preservar emojiId original
          emoji: w.emoji || `<:weapon:${w.emojiId}>`, // Formato de emoji para mostrar
          url: w.url || '',
          sendBuildToPrivate: !!w.sendBuildToPrivate
        }));

        console.log('[DEBUG] convertCreationGroupToEditorGroup: editorWeapons created:', JSON.stringify(editorWeapons, null, 2));

        // Intentar preservar nombres de categorías existentes si están disponibles
        let categoryName = 'General';
        if (existingGroup && Array.isArray(existingGroup.categories) && existingGroup.categories.length > 0) {
          // Usar el primer nombre de categoría existente
          categoryName = existingGroup.categories[0].name || 'General';
        }

        const result = {
          name: weaponConfig?.displayName || 'Nuevo Grupo',
          defaultEmoji: weaponConfig?.defaultEmoji || '⚔️',
          categories: [
            {
              name: categoryName,
              weapons: editorWeapons
            }
          ]
        };

        console.log('[DEBUG] convertCreationGroupToEditorGroup: final result:', JSON.stringify(result, null, 2));
        return result;
      };

      // Actualizar datos de la sesión de edición
      if (updatedData.roles !== undefined) {
        editSession.data.roles = updatedData.roles;
      }

      if (updatedData.weapons !== undefined) {
        // Aceptar tanto array (formato editor) como objeto (formato creación)
        if (Array.isArray(updatedData.weapons)) {
          editSession.data.weapons = updatedData.weapons;
        } else if (updatedData.weapons && typeof updatedData.weapons === 'object') {
          // Convertir objeto de grupos de creación a array de grupos de editor
          const groups = Object.values(updatedData.weapons).map(wc => convertCreationGroupToEditorGroup(wc));
          editSession.data.weapons = groups;
        } else {
          editSession.data.weapons = [];
        }
      }

      // Manejar adición de nuevo grupo de armas desde sesión temporal
      if (updatedData.newWeaponGroup !== undefined) {
        if (!editSession.data.weapons) {
          editSession.data.weapons = [];
        }
        // Convertir al formato de editor antes de insertar
        const editorGroup = convertCreationGroupToEditorGroup(updatedData.newWeaponGroup);
        editSession.data.weapons.push(editorGroup);
        editSession.hasChanges = true;
      }

      // Manejar actualización de grupo existente
      if (updatedData.editedWeaponGroup !== undefined && updatedData.groupIndex !== undefined) {
        if (editSession.data.weapons && editSession.data.weapons[updatedData.groupIndex]) {
          const existing = editSession.data.weapons[updatedData.groupIndex];
          const editorGroup = convertCreationGroupToEditorGroup(updatedData.editedWeaponGroup, existing);
          editSession.data.weapons[updatedData.groupIndex] = editorGroup;
          editSession.hasChanges = true;
        }
      }

      // Manejar adición de armas a un grupo existente
      if (updatedData.addWeaponsToGroup !== undefined && updatedData.groupIndex !== undefined) {
        if (editSession.data.weapons && editSession.data.weapons[updatedData.groupIndex]) {
          const existing = editSession.data.weapons[updatedData.groupIndex];
          const newWeapons = (updatedData.addWeaponsToGroup?.data || []).map(w => ({
            id: w.id || Date.now() + Math.random(),
            name: w.name,
            quantity: w.units,
            image: w.image || '',
            emojiId: w.emojiId, // Preservar emojiId original
            emoji: w.emoji || `<:weapon:${w.emojiId}>`, // Formato de emoji para mostrar
            url: w.url || '',
            sendBuildToPrivate: !!w.sendBuildToPrivate
          }));

          // Añadir las nuevas armas a la primera categoría del grupo existente
          if (existing.categories && existing.categories.length > 0) {
            existing.categories[0].weapons = [...(existing.categories[0].weapons || []), ...newWeapons];
          } else {
            // Si no hay categorías, crear una nueva
            existing.categories = [{
              name: 'General',
              weapons: newWeapons
            }];
          }
          editSession.hasChanges = true;
        }
      }

      console.log(`[DEBUG] Datos sincronizados exitosamente desde creación a edición para sesión ${sessionId}`);
      return true;
    } catch (error) {
      console.error('[ERROR] Error al sincronizar datos desde creación a edición:', error);
      return false;
    }
  },

  // Convierte los datos de weapons del formato de editor al formato de base de datos
  convertEditorToDbFormat(editorWeapons) {
    if (!Array.isArray(editorWeapons)) {
      console.log('[DEBUG] convertEditorToDbFormat: Input is not an array, returning as-is');
      return editorWeapons;
    }

    const dbFormat = {};

    editorWeapons.forEach((group, index) => {
      const groupKey = `group_${index + 1}`;

      // Recolectar todas las armas de todas las categorías
      const allWeapons = [];
      if (group.categories && Array.isArray(group.categories)) {
        group.categories.forEach(category => {
          if (category.weapons && Array.isArray(category.weapons)) {
            category.weapons.forEach(weapon => {
              allWeapons.push({
                id: weapon.id || Date.now() + Math.random(),
                name: weapon.name,
                units: weapon.quantity || 1,
                image: weapon.image || '',
                emojiId: weapon.emojiId || weapon.emoji, // Usar emojiId si existe, sino emoji como fallback
                url: weapon.url || '',
                sendBuildToPrivate: weapon.sendBuildToPrivate || false
              });
            });
          }
        });
      }

      dbFormat[groupKey] = {
        displayName: group.name || 'Nuevo Grupo',
        defaultEmoji: group.defaultEmoji || '⚔️',
        data: allWeapons
      };
    });

    return dbFormat;
  },

  // Mostrar editor de roles con multi-select directo
  async showEditRoles(interaction, sessionId) {
    try {
      const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);

      if (!validSession) {
        return await interaction.reply({
          content: 'Sesión de edición expirada o inválida. Reinicia la edición del template.',
          ephemeral: true
        });
      }

      const session = validSession.session;

      const template = session.data;

      const titleText = template.notifyAll ? 'Roles a Notificar' : 'Roles de Ping';
      const descriptionText = template.notifyAll
        ? 'Selecciona los roles que serán notificados cuando se cree un raid'
        : 'Selecciona los roles que serán etiquetados cuando se cree un raid';

      const embed = new EmbedBuilder()
        .setTitle(`🎭 ${titleText}`)
        .setDescription(descriptionText)
        .setColor(parseInt((template.color || '#0099ff').replace('#', ''), 16))
        .addFields([
          {
            name: 'Roles Actuales',
            value: template.roles && template.roles.length > 0
              ? template.roles.map(roleId => `<@&${roleId}>`).join('\n')
              : 'Sin roles configurados',
            inline: false
          },
          {
            name: '📌 Información',
            value: 'Estos roles se etiquetan automáticamente al crear un raid con este template.',
            inline: false
          }
        ]);

      // Obtener roles del servidor (excluyendo roles del bot y @everyone)
      const guild = interaction.guild;
      const guildRoles = guild.roles.cache
        .filter(role => !role.managed && role.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .first(25); // Límite de Discord para select menus

      if (guildRoles.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`template_edit_roles_select_${sessionId}`)
          .setPlaceholder('Selecciona los roles')
          .setMinValues(0)
          .setMaxValues(Math.min(guildRoles.length, 25))
          .addOptions(
            guildRoles.map(role => ({
              label: role.name,
              value: role.id,
              description: `Miembros: ${role.members.size}`,
              default: template.roles && template.roles.includes(role.id)
            }))
          );

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);

        const buttonRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`template_edit_roles_clear_${sessionId}`)
              .setLabel('Quitar Todos')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️'),
            new ButtonBuilder()
              .setCustomId(`template_edit_back_${sessionId}`)
              .setLabel('Volver al Editor')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⬅️')
          );

        await interaction.reply({
          embeds: [embed],
          components: [selectRow, buttonRow],
          ephemeral: true
        });
      } else {
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`template_edit_back_${sessionId}`)
              .setLabel('Volver al Editor')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⬅️')
          );

        embed.addFields([{
          name: '⚠️ Sin Roles Disponibles',
          value: 'No hay roles disponibles para seleccionar en este servidor.',
          inline: false
        }]);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

    } catch (error) {
      console.error('[ERROR] Error en showEditRoles:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al mostrar la selección de roles.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Mostrar editor de armas con vista de grupos existentes
  async showEditWeapons(interaction, sessionId) {
    try {
      const session = templateEditSessions.get(sessionId);
      if (!session) {
        if (interaction.deferred) {
          return await interaction.editReply({ content: 'Sesión de edición expirada.' });
        } else {
          return await interaction.reply({ content: 'Sesión de edición expirada.', ephemeral: true });
        }
      }

      const template = session.data;
      console.log('[DEBUG] showEditWeapons - template.weapons:', template.weapons);
      console.log('[DEBUG] showEditWeapons - weapons type:', typeof template.weapons);
      console.log('[DEBUG] showEditWeapons - weapons length:', template.weapons?.length);

      // Helper local para renderizar emojis en texto
      const { client } = require('../../utils/client');
      const renderEmoji = (emojiLike) => {
        if (!emojiLike) return '⚔️';
        if (typeof emojiLike === 'string' && !/^\d{15,20}$/.test(emojiLike)) return emojiLike;
        const id = String(emojiLike);
        const globalEmoji = client?.emojis?.cache?.get(id);
        if (globalEmoji) return globalEmoji.toString();
        const guildEmoji = interaction.guild?.emojis?.cache?.get(id);
        return guildEmoji ? guildEmoji.toString() : `<:e:${id}>`;
      };

      const embed = new EmbedBuilder()
        .setTitle('⚔️ Editor de Grupos de Armas')
        .setDescription('Gestiona los grupos de armas de tu template')
        .setColor(parseInt((template.color || '#0099ff').replace('#', ''), 16));

      // Mostrar grupos existentes
      if (template.weapons && template.weapons.length > 0) {
        const weaponsList = template.weapons.map((weaponGroup, index) => {
          const categoryNames = weaponGroup.categories.map(cat => cat.name).join(', ');
          const totalWeapons = weaponGroup.categories.reduce((total, cat) => total + (cat.weapons?.length || 0), 0);
          const groupName = weaponGroup.name || `Grupo ${index + 1}`;
          const groupEmoji = renderEmoji(weaponGroup.defaultEmoji);

          return `${groupEmoji} **${groupName}**\n• ${totalWeapons} armas configuradas\n• Categorías: ${categoryNames || 'Ninguna'}`;
        }).join('\n\n');

        embed.addFields([
          {
            name: 'Grupos Actuales',
            value: weaponsList,
            inline: false
          }
        ]);

        // Select menu para editar grupos existentes
        const selectOptions = template.weapons.map((weaponGroup, index) => {
          const categoryNames = weaponGroup.categories.map(cat => cat.name).join(', ');
          const totalWeapons = weaponGroup.categories.reduce((total, cat) => total + (cat.weapons?.length || 0), 0);
          const groupName = weaponGroup.name || `Grupo ${index + 1}`;
          const groupEmoji = weaponGroup.defaultEmoji || '⚔️';
          const option = {
            label: groupName,
            value: index.toString(),
            description: `${totalWeapons} armas - ${categoryNames.length > 50 ? categoryNames.substring(0, 47) + '...' : categoryNames || 'Sin armas'}`,
          };
          try {
            if (/^\d{15,20}$/.test(String(groupEmoji))) option.emoji = { id: String(groupEmoji) };
            else option.emoji = { name: String(groupEmoji) };
          } catch { option.emoji = { name: '⚔️' }; }
          return option;
        });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`template_edit_weapon_group_select_${sessionId}`)
          .setPlaceholder('Selecciona un grupo para editar')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(selectOptions);

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);

        // Botones de gestión
        const buttonRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`template_edit_weapons_add_new_${sessionId}`)
              .setLabel('Añadir Nuevo Grupo')
              .setStyle(ButtonStyle.Success)
              .setEmoji('➕'),
            new ButtonBuilder()
              .setCustomId(`template_edit_weapons_delete_${sessionId}`)
              .setLabel('Eliminar Grupo')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️'),
            new ButtonBuilder()
              .setCustomId(`template_edit_back_${sessionId}`)
              .setLabel('Volver al Editor')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⬅️')
          );

        if (interaction.deferred) {
          await interaction.editReply({
            embeds: [embed],
            components: [selectRow, buttonRow]
          });
        } else if (interaction.isButton?.() && !interaction.replied) {
          await interaction.update({
            embeds: [embed],
            components: [selectRow, buttonRow]
          });
        } else {
          await interaction.reply({
            embeds: [embed],
            components: [selectRow, buttonRow],
            ephemeral: true
          });
        }
      } else {
        embed.addFields([{
          name: 'Grupos Actuales',
          value: 'Sin grupos configurados',
          inline: false
        }]);

        // Solo botón para añadir nuevo grupo si no hay grupos
        const buttonRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`template_edit_weapons_add_new_${sessionId}`)
              .setLabel('Añadir Primer Grupo')
              .setStyle(ButtonStyle.Success)
              .setEmoji('➕'),
            new ButtonBuilder()
              .setCustomId(`template_edit_back_${sessionId}`)
              .setLabel('Volver al Editor')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⬅️')
          );

        if (interaction.deferred) {
          await interaction.editReply({ embeds: [embed], components: [buttonRow] });
        } else if (interaction.isButton?.() && !interaction.replied) {
          await interaction.update({ embeds: [embed], components: [buttonRow] });
        } else {
          await interaction.reply({ embeds: [embed], components: [buttonRow], ephemeral: true });
        }
      }

    } catch (error) {
      console.error('[ERROR] Error en showEditWeapons:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al mostrar la selección de armas.");
      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else if (interaction.isButton?.() && !interaction.replied) {
        await interaction.update({ embeds: [errorEmbed], components: [] });
      } else if (!interaction.replied) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  // Manejar selección de grupo de armas para editar
  async handleEditWeaponGroupSelect(interaction, sessionId) {
    try {
      console.log('[DEBUG] handleEditWeaponGroupSelect - customId:', interaction.customId);
      console.log('[DEBUG] handleEditWeaponGroupSelect - sessionId recibido:', sessionId);

      const groupIndex = parseInt(interaction.values[0]);
      const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);

      if (!validSession) {
        const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado. Por favor, inicia el comando nuevamente.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }

      const { session, sessionId: actualSessionId } = validSession;
      const weaponGroup = session.data.weapons[groupIndex];

      console.log('[DEBUG] handleEditWeaponGroupSelect - groupIndex:', groupIndex);
      console.log('[DEBUG] handleEditWeaponGroupSelect - weapons disponibles:', session.data.weapons.length);
      console.log('[DEBUG] handleEditWeaponGroupSelect - weapons array:', session.data.weapons);
      console.log('[DEBUG] handleEditWeaponGroupSelect - weaponGroup encontrado:', !!weaponGroup);
      console.log('[DEBUG] handleEditWeaponGroupSelect - weaponGroup content:', weaponGroup);

      if (!weaponGroup) {
        console.log('[ERROR] Grupo no encontrado - groupIndex:', groupIndex, 'weapons length:', session.data.weapons.length);
        const errorEmbed = createErrorEmbed('Grupo no encontrado', `El grupo seleccionado no existe. Grupos disponibles: ${session.data.weapons.length}`);

        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          } else {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
          }
        } catch (replyError) {
          console.error('Error al responder:', replyError);
        }
        return;
      }

      // Guardar el índice del grupo actual en la sesión para operaciones posteriores
      session.currentGroupIndex = groupIndex;

      // Mostrar interfaz completa de edición de grupo
      await this.showGroupEditInterface(interaction, actualSessionId, weaponGroup, groupIndex);

    } catch (error) {
      console.error('Error al manejar selección de grupo de armas:', error);
      console.error('Error stack:', error.stack);
      console.error('CustomId que causó el error:', interaction.customId);
      console.error('Values seleccionados:', interaction.values);

      const errorEmbed = createErrorEmbed('Error', `Hubo un error al procesar la selección del grupo de armas: ${error.message}`);

      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } else {
          await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyError) {
        console.error('Error al responder con mensaje de error:', replyError);
      }
    }
  },

  // Mostrar interfaz completa de edición de grupo
  async showGroupEditInterface(interaction, sessionId, weaponGroup, groupIndex) {
    try {
      const totalWeapons = weaponGroup.categories ?
        weaponGroup.categories.reduce((total, cat) => total + (cat.weapons?.length || 0), 0) : 0;
      const categoryNames = weaponGroup.categories ?
        weaponGroup.categories.map(cat => cat.name).join(', ') : 'Sin categorías';

      const weaponsList = [];
      if (weaponGroup.categories && weaponGroup.categories.length > 0) {
        weaponGroup.categories.forEach(category => {
          if (category.weapons && category.weapons.length > 0) {
            weaponsList.push(`**${category.name}:**`);
            category.weapons.forEach(weapon => {
              weaponsList.push(`• ${weapon.name} (x${weapon.quantity || weapon.units || 1})`);
            });
          }
        });
      }

      const embed = createInfoEmbed(
        `${weaponGroup.defaultEmoji || '⚔️'} ${weaponGroup.name || weaponGroup.displayName || `Grupo ${groupIndex + 1}`} - Editor de Armas`,
        'Selecciona una acción para modificar este grupo de armas.',
        [
          {
            name: '📊 Resumen',
            value: `**Total de armas:** ${totalWeapons}\n**Categorías:** ${categoryNames}`,
            inline: false
          },
          {
            name: '🗡️ Lista de Armas',
            value: weaponsList.length > 0 ? weaponsList.slice(0, 15).join('\n') + (weaponsList.length > 15 ? '\n...' : '') : 'Sin armas configuradas',
            inline: false
          }
        ]
      );

      const addWeaponBtn = new ButtonBuilder()
        .setCustomId(`group_add_weapon_${sessionId}_${groupIndex}`)
        .setLabel('➕ Añadir Arma')
        .setStyle(ButtonStyle.Success);

      const editWeaponBtn = new ButtonBuilder()
        .setCustomId(`group_edit_weapon_${sessionId}_${groupIndex}`)
        .setLabel('✏️ Editar Arma')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(totalWeapons === 0);

      const removeWeaponBtn = new ButtonBuilder()
        .setCustomId(`group_remove_weapon_${sessionId}_${groupIndex}`)
        .setLabel('🗑️ Eliminar Arma')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(totalWeapons === 0);

      const deleteGroupBtn = new ButtonBuilder()
        .setCustomId(`group_delete_${sessionId}_${groupIndex}`)
        .setLabel('🚮 Eliminar Grupo')
        .setStyle(ButtonStyle.Danger);

      const backButton = new ButtonBuilder()
        .setCustomId(`template_edit_weapons_${sessionId}`)
        .setLabel('← Volver a Grupos')
        .setStyle(ButtonStyle.Secondary);

      const row1 = new ActionRowBuilder().addComponents(addWeaponBtn, editWeaponBtn, removeWeaponBtn);
      const row2 = new ActionRowBuilder().addComponents(deleteGroupBtn, backButton);

      console.log('[DEBUG] showGroupEditInterface - Intentando actualizar interaction');
      console.log('[DEBUG] showGroupEditInterface - Replied:', interaction.replied, 'Deferred:', interaction.deferred);

      if (interaction.replied) {
        await interaction.editReply({
          embeds: [embed],
          components: [row1, row2]
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          embeds: [embed],
          components: [row1, row2]
        });
      } else {
        await interaction.update({
          embeds: [embed],
          components: [row1, row2]
        });
      }

      console.log('[DEBUG] showGroupEditInterface - Actualización exitosa');

    } catch (error) {
      console.error('Error al mostrar interfaz de edición de grupo:', error);
      console.error('Error stack:', error.stack);

      const errorEmbed = createErrorEmbed('Error', 'Hubo un error al mostrar la interfaz de edición del grupo.');

      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } else {
          await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyError) {
        console.error('Error al responder con mensaje de error:', replyError);
      }
    }
  },

  // Manejar botón de añadir nuevo grupo de armas
  async handleAddNewWeaponGroup(interaction, sessionId) {
    try {
      const session = templateEditSessions.get(sessionId);
      if (!session) {
        const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado. Por favor, inicia el comando nuevamente.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }

      // Crear una sesión temporal de creación de template para el nuevo grupo
      const { createSession } = require('../../lib/template/template-sessions');

      // Generar ID único para la sesión temporal de creación
      const tempSessionId = `edit_${sessionId}_${Date.now()}`;

      // Crear sesión de creación temporal con datos básicos del template
      const tempSessionData = {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        step: 'weapon_category_selection',
        isEdit: true,
        originalSessionId: sessionId,
        isNewGroup: true,
        data: {
          // Copiar datos básicos del template existente
          templateId: session.data.templateId,
          name: session.data.name,
          description: session.data.description,
          weapons: {}
        },
        tempGroupConfig: null
      };

      createSession(tempSessionId, tempSessionData);

      // Diferir la interacción si es un botón
      if (interaction.isButton()) {
        await interaction.deferUpdate();
      }

      // Mostrar selección de categorías de armas usando el sistema de template create
      const createHandlers = require('../../lib/template/template-create-handlers');
      await createHandlers.showWeaponCategorySelection(interaction, tempSessionId);

    } catch (error) {
      console.error('Error al añadir nuevo grupo de armas:', error);
      const errorEmbed = createErrorEmbed('Error', 'Hubo un error al crear un nuevo grupo de armas.');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.editReply({ embeds: [errorEmbed], components: [] });
      }
    }
  },

  // Manejar botón de eliminar grupo de armas
  async handleDeleteWeaponGroup(interaction, sessionId) {
    try {
      const session = templateEditSessions.get(sessionId);
      if (!session) {
        const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado. Por favor, inicia el comando nuevamente.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }

      if (!session.data.weapons || session.data.weapons.length === 0) {
        const errorEmbed = createErrorEmbed('Sin grupos', 'No hay grupos de armas para eliminar.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }

      // Crear selector para eliminar grupo
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`template_edit_delete_confirm_${sessionId}`)
        .setPlaceholder('Selecciona el grupo a eliminar')
        .setMinValues(1)
        .setMaxValues(1);

      session.data.weapons.forEach((group, index) => {
        const categoriesDesc = group.categories.map(cat => cat.name).join(', ');
        const labelName = group.name || group.displayName || `Grupo ${index + 1}`;
        const emoji = group.defaultEmoji || '⚔️';
        const option = {
          label: labelName,
          description: categoriesDesc.length > 100 ? categoriesDesc.substring(0, 97) + '...' : (categoriesDesc || 'Sin categorías'),
          value: index.toString()
        };
        try {
          if (/^\d{15,20}$/.test(String(emoji))) {
            option.emoji = { id: String(emoji) };
          } else if (emoji) {
            option.emoji = { name: String(emoji) };
          }
        } catch { }
        selectMenu.addOptions(option);
      });

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setTitle('🗑️ Eliminar Grupo de Armas')
        .setDescription('**⚠️ ATENCIÓN:** Esta acción no se puede deshacer.\n\nSelecciona el grupo de armas que deseas eliminar:')
        .setColor(0xff6b6b);

      const backButton = new ButtonBuilder()
        .setCustomId(`template_edit_weapons_${sessionId}`)
        .setLabel('← Volver')
        .setStyle(ButtonStyle.Secondary);

      const buttonRow = new ActionRowBuilder().addComponents(backButton);

      await interaction.reply({
        embeds: [embed],
        components: [row, buttonRow],
        ephemeral: true
      });

    } catch (error) {
      console.error('Error al mostrar eliminación de grupo:', error);
      const errorEmbed = createErrorEmbed('Error', 'Hubo un error al mostrar las opciones de eliminación.');
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Confirmar eliminación de grupo de armas
  async handleDeleteWeaponGroupConfirm(interaction, sessionId) {
    try {
      const groupIndex = parseInt(interaction.values[0]);
      const session = templateEditSessions.get(sessionId);
      if (!session) {
        const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado. Por favor, inicia el comando nuevamente.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }

      if (!session.data.weapons || groupIndex >= session.data.weapons.length) {
        const errorEmbed = createErrorEmbed('Grupo no encontrado', 'El grupo seleccionado no existe.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }

      // Eliminar el grupo
      const deletedGroup = session.data.weapons.splice(groupIndex, 1)[0];
      const groupName = deletedGroup.categories.map(cat => cat.name).join(', ');

      // Marcar que hay cambios para poder guardar
      session.hasChanges = true;

      // Actualizar la sesión
      templateEditSessions.set(sessionId, session);
      console.log('🔄 [DEBUG] Sesión actualizada después de eliminar grupo:', sessionId);
      console.log('🔄 [DEBUG] Sesiones disponibles después de guardar:', Array.from(templateEditSessions.keys()));

      // Mostrar confirmación y volver a la vista de armas
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Grupo Eliminado')
        .setDescription(`El grupo **"${groupName}"** ha sido eliminado correctamente.\n\n**Usa el botón de abajo para continuar editando armas.**`)
        .setColor(0x57f287);

      const backButton = new ButtonBuilder()
        .setCustomId(`back_to_weapons_${sessionId}`)
        .setLabel('Continuar Editando Armas')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📝');

      const row = new ActionRowBuilder()
        .addComponents(backButton);

      console.log('🔄 [DEBUG] Creando botón back_to_weapons con ID:', `back_to_weapons_${sessionId}`);

      await interaction.reply({
        embeds: [successEmbed],
        components: [row],
        ephemeral: true
      });

    } catch (error) {
      console.error('Error al eliminar grupo de armas:', error);
      const errorEmbed = createErrorEmbed('Error', 'Hubo un error al eliminar el grupo de armas.');
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Manejar botones específicos de edición de grupos
  async handleGroupEditButton(interaction, customId) {
    try {
      console.log('[DEBUG] handleGroupEditButton - customId:', customId);

      // Parsing más específico del customId
      if (customId.includes('group_edit_add_weapons_')) {
        const parts = customId.replace('group_edit_add_weapons_', '').split('_');
        const groupIndex = parseInt(parts.pop());
        const tempSessionId = parts.join('_');

        console.log('[DEBUG] handleGroupEditButton - add weapons - tempSessionId:', tempSessionId, 'groupIndex:', groupIndex);

        // Usar getValidSession que maneja tanto templateEditSessions como fallback
        const validSession = getValidSession(tempSessionId, interaction.user.id, interaction.guild.id);
        if (!validSession) {
          return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
        }

        // Almacenar el groupIndex en la sesión para usarlo después
        validSession.session.currentGroupIndex = groupIndex;

        // Mostrar categorías primero, como en el flujo de creación
        return await showWeaponCategorySelectionForEdit(interaction, tempSessionId);

      } else if (customId.includes('group_edit_remove_weapons_')) {
        const parts = customId.replace('group_edit_remove_weapons_', '').split('_');
        const groupIndex = parseInt(parts.pop());
        const tempSessionId = parts.join('_');

        console.log('[DEBUG] handleGroupEditButton - remove weapons - tempSessionId:', tempSessionId, 'groupIndex:', groupIndex);

        const validSession = getValidSession(tempSessionId, interaction.user.id, interaction.guild.id);
        if (!validSession) {
          return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
        }

        // Mostrar interfaz para quitar armas
        return await showRemoveWeaponsInterface(interaction, tempSessionId, groupIndex, validSession.session);
      } else if (customId.includes('group_edit_finish_')) {
        // Terminar edición y volver al editor principal
        const tempSessionId = customId.replace('group_edit_finish_', '');
        console.log('[DEBUG] handleGroupEditButton - finish tempSessionId:', tempSessionId);

        const validSession = getValidSession(tempSessionId, interaction.user.id, interaction.guild.id);
        if (!validSession) {
          return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
        }

        // Volver a la interface principal de edición
        return await this.showEditWeapons(interaction, tempSessionId);

      } else {
        console.warn('[WARN] CustomId de grupo no reconocido:', customId);
        await interaction.reply({ content: 'Acción no reconocida.', ephemeral: true });
      }

    } catch (error) {
      console.error('[ERROR] Error en handleGroupEditButton:', error);
      const errorEmbed = createErrorEmbed('Error', 'Hubo un error al procesar la acción.');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  // Mostrar interfaz de edición para un grupo específico
  async showGroupEditInterface(interaction, tempSessionId, weaponGroup, groupIndex) {
    try {
      const totalWeapons = weaponGroup.categories.reduce((total, cat) => total + (cat.weapons?.length || 0), 0);
      const categoryNames = weaponGroup.categories.map(cat => cat.name).join(', ');

      const embed = new EmbedBuilder()
        .setTitle(`${weaponGroup.defaultEmoji || '⚔️'} Editar ${weaponGroup.name || `Grupo ${groupIndex + 1}`}`)
        .setDescription('Administra las armas de este grupo. Puedes añadir más armas, eliminar existentes o modificar cantidades.')
        .setColor(0x00FFFF)
        .addFields([
          {
            name: 'Contenido Actual',
            value: `**${totalWeapons}** armas configuradas\n**Categorías:** ${categoryNames}`,
            inline: false
          }
        ]);

      // Mostrar lista detallada de armas si hay pocas
      if (totalWeapons <= 10 && totalWeapons > 0) {
        const weaponsList = [];
        weaponGroup.categories.forEach(category => {
          if (category.weapons && category.weapons.length > 0) {
            weaponsList.push(`**${category.name}:**`);
            category.weapons.forEach(weapon => {
              weaponsList.push(`• ${weapon.name} (x${weapon.quantity || weapon.units || 1})`);
            });
          }
        });

        if (weaponsList.length > 0) {
          embed.addFields([{
            name: 'Armas Configuradas',
            value: weaponsList.join('\n'),
            inline: false
          }]);
        }
      }

      // Botones de acción
      const buttonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`group_edit_add_weapons_${tempSessionId}_${groupIndex}`)
            .setLabel('➕ Añadir Armas')
            .setStyle(ButtonStyle.Success)
            .setEmoji('➕'),
          new ButtonBuilder()
            .setCustomId(`group_edit_remove_weapons_${tempSessionId}_${groupIndex}`)
            .setLabel('🗑️ Quitar Armas')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
          new ButtonBuilder()
            .setCustomId(`group_edit_finish_${tempSessionId}`)
            .setLabel('✅ Guardar Cambios')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅')
        );

      const backButtonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`group_edit_back_${tempSessionId}`)
            .setLabel('← Volver al Editor')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
        );

      // Preferimos actualizar el mensaje original si la interacción proviene de un componente
      if ((interaction.isButton?.() || interaction.isStringSelectMenu?.()) && !interaction.deferred && !interaction.replied) {
        await interaction.update({
          embeds: [embed],
          components: [buttonRow, backButtonRow]
        });
      } else if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          embeds: [embed],
          components: [buttonRow, backButtonRow]
        });
      } else {
        await interaction.reply({
          embeds: [embed],
          components: [buttonRow, backButtonRow],
          ephemeral: true
        });
      }

    } catch (error) {
      console.error('[ERROR] Error en showGroupEditInterface:', error);
      const errorEmbed = createErrorEmbed('Error', 'Hubo un error al mostrar la interfaz de edición del grupo.');

      try {
        if ((interaction.isButton?.() || interaction.isStringSelectMenu?.()) && !interaction.deferred && !interaction.replied) {
          await interaction.update({ embeds: [errorEmbed], components: [] });
        } else if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (secondError) {
        console.error('[ERROR] Error al enviar mensaje de error:', secondError);
      }
    }
  },

  // Mostrar interfaz para quitar armas del grupo
  async showRemoveWeaponsInterface(interaction, tempSessionId, session) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🗑️ Quitar Armas del Grupo')
        .setDescription('Selecciona las armas que deseas quitar del grupo.')
        .setColor(0xff6b6b);

      // Crear lista de armas disponibles para quitar
      const weaponOptions = [];
      if (session.currentGroup && session.currentGroup.categories) {
        session.currentGroup.categories.forEach((category, catIndex) => {
          if (category.weapons && category.weapons.length > 0) {
            category.weapons.forEach((weapon, weaponIndex) => {
              weaponOptions.push({
                label: weapon.name,
                description: `${category.name} - Cantidad: ${weapon.quantity || 1}`,
                value: `${catIndex}_${weaponIndex}`,
                emoji: '🗑️'
              });
            });
          }
        });
      }

      if (weaponOptions.length === 0) {
        const noWeaponsEmbed = createErrorEmbed('Sin Armas', 'No hay armas en este grupo para quitar.');
        return await interaction.editReply({ embeds: [noWeaponsEmbed] });
      }

      // Limitar a 25 opciones (máximo de Discord)
      if (weaponOptions.length > 25) {
        weaponOptions.splice(25);
        embed.setFooter({ text: 'Mostrando las primeras 25 armas. Si no encuentras la que buscas, quita algunas primero.' });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`group_remove_weapons_${tempSessionId}`)
        .setPlaceholder('Selecciona las armas a quitar')
        .setMinValues(1)
        .setMaxValues(Math.min(weaponOptions.length, 10)) // Hasta 10 a la vez
        .addOptions(weaponOptions);

      const selectRow = new ActionRowBuilder().addComponents(selectMenu);

      const backButton = new ButtonBuilder()
        .setCustomId(`group_edit_back_to_edit_${tempSessionId}`)
        .setLabel('← Volver a Edición')
        .setStyle(ButtonStyle.Secondary);

      const buttonRow = new ActionRowBuilder().addComponents(backButton);

      // Si venimos de un botón, actualizar el mensaje; si no, usar editReply/reply según corresponda
      if ((interaction.isButton?.() || interaction.isStringSelectMenu?.()) && !interaction.deferred && !interaction.replied) {
        await interaction.update({
          embeds: [embed],
          components: [selectRow, buttonRow]
        });
      } else if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          embeds: [embed],
          components: [selectRow, buttonRow]
        });
      } else {
        await interaction.reply({
          embeds: [embed],
          components: [selectRow, buttonRow],
          ephemeral: true
        });
      }

    } catch (error) {
      console.error('[ERROR] Error en showRemoveWeaponsInterface:', error);
      const errorEmbed = createErrorEmbed('Error', 'Hubo un error al mostrar las opciones de eliminación.');
      if ((interaction.isButton?.() || interaction.isStringSelectMenu?.()) && !interaction.deferred && !interaction.replied) {
        await interaction.update({ embeds: [errorEmbed], components: [] });
      } else if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  // Manejar la eliminación de armas seleccionadas del grupo
  async handleRemoveWeaponsFromGroup(interaction, tempSessionId) {
    try {
      const selectedWeapons = interaction.values; // Array de "catIndex_weaponIndex"

      const { getTemplateCreationSessions } = require('../../lib/template/template-sessions');
      const templateCreationSessions = getTemplateCreationSessions();
      const session = templateCreationSessions.get(tempSessionId);

      if (!session) {
        return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
      }

      let removedCount = 0;
      const removedWeapons = [];

      // Procesar selecciones en orden inverso para no alterar índices
      const sortedSelections = selectedWeapons
        .map(value => {
          const [catIndex, weaponIndex] = value.split('_').map(Number);
          return { catIndex, weaponIndex, value };
        })
        .sort((a, b) => {
          if (a.catIndex !== b.catIndex) return b.catIndex - a.catIndex;
          return b.weaponIndex - a.weaponIndex;
        });

      // Eliminar armas seleccionadas
      sortedSelections.forEach(({ catIndex, weaponIndex }) => {
        if (session.currentGroup?.categories?.[catIndex]?.weapons?.[weaponIndex]) {
          const removedWeapon = session.currentGroup.categories[catIndex].weapons.splice(weaponIndex, 1)[0];
          removedWeapons.push(removedWeapon.name);
          removedCount++;
        }
      });

      // Limpiar categorías vacías
      if (session.currentGroup?.categories) {
        session.currentGroup.categories = session.currentGroup.categories.filter(cat =>
          cat.weapons && cat.weapons.length > 0
        );
      }

      // Mantener tempGroupConfig.weapons sincronizado con currentGroup
      try {
        const flattened = [];
        (session.currentGroup?.categories || []).forEach(cat => {
          (cat.weapons || []).forEach(w => flattened.push({
            name: w.name,
            emojiId: w.emoji || w.emojiId || '⚔️',
            image: w.image || '',
            url: w.url || '',
            quantity: w.quantity || w.units || 1,
            sendBuildToPrivate: !!w.sendBuildToPrivate
          }));
        });
        if (session.tempGroupConfig) {
          session.tempGroupConfig.weapons = flattened;
        }
      } catch (syncError) {
        console.log('[DEBUG] Error syncing tempGroupConfig:', syncError);
      }

      // Crear embed de confirmación con botón para volver
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Armas Eliminadas')
        .setDescription(`Se eliminaron **${removedCount}** arma(s) del grupo:\n\n${removedWeapons.map(name => `• ${name}`).join('\n')}\n\n**¿Qué deseas hacer ahora?**`)
        .setColor(0x57f287);

      // Botones de acción después de eliminar
      const buttonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`group_edit_back_to_edit_${tempSessionId}`)
            .setLabel('← Volver a Editar Grupo')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬅️'),
          new ButtonBuilder()
            .setCustomId(`group_edit_remove_weapons_${tempSessionId}`)
            .setLabel('🗑️ Quitar Más Armas')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🗑️')
        );

      // Actualizar el mensaje original del select con el resultado
      if (!interaction.deferred && !interaction.replied) {
        await interaction.update({
          embeds: [successEmbed],
          components: [buttonRow]
        });
      } else {
        await interaction.editReply({
          embeds: [successEmbed],
          components: [buttonRow]
        });
      }

    } catch (error) {
      console.error('[ERROR] Error en handleRemoveWeaponsFromGroup:', error);
      const errorEmbed = createErrorEmbed('Error', 'Hubo un error al eliminar las armas seleccionadas.');
      if (!interaction.deferred && !interaction.replied) {
        await interaction.update({ embeds: [errorEmbed], components: [] });
      } else {
        await interaction.editReply({ embeds: [errorEmbed] });
      }
    }
  },

  // Mostrar vista previa del template editado
  async showEditPreview(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);
    const template = session.data;

    // Crear embed de vista previa similar al template final
    const previewEmbed = new EmbedBuilder()
      .setTitle(`🎯 ${template.title || 'Sin título'}`)
      .setDescription(template.description || 'Sin descripción')
      .setColor(parseInt((template.color || '#0099ff').replace('#', ''), 16))
      .addFields([
        {
          name: '⏱️ Duración',
          value: template.time || 'No especificada',
          inline: true
        },
        {
          name: '🔔 Recordatorio',
          value: template.reminder || '5m',
          inline: true
        },
        {
          name: '📢 Notificar Todos',
          value: template.notifyAll ? 'Sí' : 'No',
          inline: true
        }
      ]);

    if (template.image) {
      previewEmbed.setImage(template.image);
    }

    // Añadir información sobre armas y roles si existen (soporta array u objeto)
    const { client } = require('../../utils/client');
    const renderEmoji = (emojiLike) => {
      if (!emojiLike) return '⚔️';
      if (typeof emojiLike === 'string' && !/^\d{15,20}$/.test(emojiLike)) return emojiLike;
      const id = String(emojiLike);
      const globalEmoji = client?.emojis?.cache?.get(id);
      if (globalEmoji) return globalEmoji.toString();
      const guildEmoji = interaction.guild?.emojis?.cache?.get(id);
      return guildEmoji ? guildEmoji.toString() : `<:e:${id}>`;
    };
    try {
      let weaponsInfo = '';
      if (Array.isArray(template.weapons)) {
        // Formato de editor: [{ categories: [{ name, weapons: [...] }] }]
        weaponsInfo = template.weapons.map((group, idx) => {
          const total = (group.categories || []).reduce((acc, c) => acc + ((c.weapons || []).length), 0);
          const cats = (group.categories || []).map(c => c.name).join(', ') || '—';
          const name = group.name || group.displayName || `Grupo ${idx + 1}`;
          const emoji = renderEmoji(group.defaultEmoji);
          return `• ${emoji} ${name}: ${total} armas (${cats})`;
        }).join('\n');
      } else if (template.weapons && typeof template.weapons === 'object') {
        // Formato de creación: { key: { displayName, data: [...] } }
        weaponsInfo = Object.values(template.weapons).map(wc => {
          const count = (wc.data || []).length;
          // Formatear el emoji del grupo
          const groupEmoji = wc.defaultEmoji ?
            (wc.defaultEmoji.match(/^\d+$/) ? `<:emoji:${wc.defaultEmoji}>` : wc.defaultEmoji) :
            '⚔️';
          return `${groupEmoji} **${wc.displayName || 'Grupo'}**: ${count} armas`;
        }).join('\n');
      }

      if (weaponsInfo && weaponsInfo.length > 0) {
        previewEmbed.addFields([{
          name: '⚔️ Grupos de Armas',
          value: weaponsInfo,
          inline: false
        }]);
      }
    } catch (e) {
      console.warn('[WARN] No se pudo generar información de armas para la vista previa:', e?.message);
    }

    if (template.roles && template.roles.length > 0) {
      previewEmbed.addFields([{
        name: '🎭 Roles Autorizados',
        value: template.roles.map(roleId => `<@&${roleId}>`).join(', '),
        inline: false
      }]);
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`template_edit_back_${sessionId}`)
          .setLabel('Volver al Editor')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️'),
        new ButtonBuilder()
          .setCustomId(`template_edit_save_${sessionId}`)
          .setLabel('Guardar Cambios')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💾')
      );

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [previewEmbed], components: [row], ephemeral: true });
    } else {
      await interaction.followUp({ embeds: [previewEmbed], components: [row], ephemeral: true });
    }
  },

  // Guardar cambios del template
  async saveTemplateChanges(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);

    if (!session.hasChanges) {
      return await interaction.reply({
        content: 'No hay cambios para guardar.',
        ephemeral: true
      });
    }

    try {
      const templateService = require('../../services/templateService');

      // Convertir datos del formato de editor al formato de base de datos
      const dataToSave = {
        ...session.data,
        weapons: this.convertEditorToDbFormat(session.data.weapons)
      };

      console.log('[DEBUG] saveTemplateChanges: Converting weapons format');
      console.log('[DEBUG] saveTemplateChanges: Editor format:', JSON.stringify(session.data.weapons, null, 2));
      console.log('[DEBUG] saveTemplateChanges: DB format:', JSON.stringify(dataToSave.weapons, null, 2));

      // Actualizar el template en la base de datos
      await templateService.updateTemplate(session.templateId, dataToSave);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Template Actualizado')
        .setDescription(`El template **${session.data.title}** ha sido actualizado exitosamente.`)
        .setColor(parseInt((session.data.color || '#0099ff').replace('#', ''), 16))
        .addFields([
          {
            name: '📝 Cambios Guardados',
            value: 'Todos los cambios han sido aplicados al template.',
            inline: false
          }
        ]);

      // Limpiar la sesión
      templateEditSessions.delete(sessionId);

      await interaction.reply({ embeds: [successEmbed], ephemeral: true });

    } catch (error) {
      console.error('[ERROR] Error al guardar template:', error);
      const errorEmbed = createErrorEmbed("Error", "No se pudo guardar el template. Inténtalo nuevamente.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Cancelar edición del template
  async cancelTemplateEdit(interaction, sessionId) {
    templateEditSessions.delete(sessionId);

    const cancelEmbed = new EmbedBuilder()
      .setTitle('❌ Edición Cancelada')
      .setDescription('La edición del template ha sido cancelada. No se guardaron cambios.')
      .setColor(0xFF6B6B);

    await interaction.reply({ embeds: [cancelEmbed], ephemeral: true });
  },

  // Manejar selección de roles
  async handleRolesSelect(interaction) {
    try {
      const customId = interaction.customId;
      const sessionId = customId.replace('template_edit_roles_select_', '');

      const session = templateEditSessions.get(sessionId);
      if (!session) {
        return await interaction.reply({ content: 'Sesión de edición expirada.', ephemeral: true });
      }

      const selectedRoles = interaction.values;
      session.data.roles = selectedRoles;
      session.hasChanges = true;

      const titleText = session.data.notifyAll ? 'Roles a Notificar' : 'Roles de Ping';

      const successEmbed = new EmbedBuilder()
        .setTitle(`✅ ${titleText} Actualizados`)
        .setDescription(
          selectedRoles.length > 0
            ? `**Roles seleccionados:**\n${selectedRoles.map(roleId => `<@&${roleId}>`).join('\n')}`
            : 'Se eliminaron todos los roles'
        )
        .setColor(parseInt((session.data.color || '#0099ff').replace('#', ''), 16));

      await interaction.reply({ embeds: [successEmbed], ephemeral: true });

    } catch (error) {
      console.error('[ERROR] Error en handleRolesSelect:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al actualizar los roles.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Manejar limpiar roles
  async handleRolesClear(interaction, sessionId) {
    try {
      const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);

      if (!validSession) {
        return await interaction.reply({
          content: 'Sesión de edición expirada o inválida. Reinicia la edición del template.',
          ephemeral: true
        });
      }

      const session = validSession.session;
      session.data.roles = [];
      session.hasChanges = true;

      const titleText = session.data.notifyAll ? 'Roles a Notificar' : 'Roles de Ping';

      const successEmbed = new EmbedBuilder()
        .setTitle(`✅ ${titleText} Limpiados`)
        .setDescription('Se eliminaron todos los roles del template.')
        .setColor(parseInt((session.data.color || '#0099ff').replace('#', ''), 16));

      await interaction.reply({ embeds: [successEmbed], ephemeral: true });

    } catch (error) {
      console.error('[ERROR] Error en handleRolesClear:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al limpiar los roles.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Manejar selección de grupo de armas (mostrar detalles)
  async handleWeaponsSelect(interaction) {
    try {
      const customId = interaction.customId;
      const sessionId = customId.replace('template_edit_weapons_select_', '');

      const session = templateEditSessions.get(sessionId);
      if (!session) {
        return await interaction.reply({ content: 'Sesión de edición expirada.', ephemeral: true });
      }

      const selectedGroupKey = interaction.values[0];
      const weaponGroup = session.data.weapons[selectedGroupKey];

      if (!weaponGroup) {
        return await interaction.reply({ content: 'Grupo de armas no encontrado.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${weaponGroup.displayName}`)
        .setDescription(`Detalles del grupo de armas`)
        .setColor(parseInt((session.data.color || '#0099ff').replace('#', ''), 16))
        .addFields([
          {
            name: '📊 Información',
            value: [
              `**Categoría:** ${weaponGroup.category || 'General'}`,
              `**Cantidad de armas:** ${weaponGroup.data.length}`,
              `**Emoji:** ${weaponGroup.emoji || '⚔️'}`
            ].join('\n'),
            inline: false
          },
          {
            name: '🗡️ Lista de Armas',
            value: weaponGroup.data.length > 0
              ? weaponGroup.data.slice(0, 10).map(weapon => `• ${weapon.name}`).join('\n') +
              (weaponGroup.data.length > 10 ? `\n... y ${weaponGroup.data.length - 10} más` : '')
              : 'Sin armas configuradas',
            inline: false
          }
        ]);

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`template_edit_weapons_remove_specific_${selectedGroupKey}_${sessionId}`)
            .setLabel('Eliminar Este Grupo')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
          new ButtonBuilder()
            .setCustomId(`template_edit_weapons_back_${sessionId}`)
            .setLabel('Volver a Armas')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
        );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    } catch (error) {
      console.error('[ERROR] Error en handleWeaponsSelect:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al mostrar el grupo de armas.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Manejar añadir grupo de armas
  async handleWeaponsAdd(interaction, sessionId) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('➕ Añadir Grupo de Armas')
        .setDescription('Para añadir grupos de armas, usa el sistema de creación de templates completo.')
        .setColor(0x3498DB)
        .addFields([
          {
            name: '💡 Recomendación',
            value: 'Los grupos de armas requieren configuración avanzada. Te sugerimos crear un nuevo template con la configuración deseada.',
            inline: false
          }
        ]);

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`template_edit_back_${sessionId}`)
            .setLabel('Volver al Editor')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
        );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    } catch (error) {
      console.error('[ERROR] Error en handleWeaponsAdd:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al procesar la acción.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Manejar eliminar grupo de armas
  async handleWeaponsRemove(interaction, sessionId) {
    try {
      const session = templateEditSessions.get(sessionId);
      if (!session) {
        return await interaction.reply({ content: 'Sesión de edición expirada.', ephemeral: true });
      }

      const weaponGroups = Object.entries(session.data.weapons);

      if (weaponGroups.length === 0) {
        return await interaction.reply({ content: 'No hay grupos de armas para eliminar.', ephemeral: true });
      }

      const selectOptions = weaponGroups.map(([key, weapon]) => ({
        label: weapon.displayName,
        value: key,
        description: `${weapon.data.length} armas`,
        emoji: '🗑️'
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`template_edit_weapons_remove_select_${sessionId}`)
        .setPlaceholder('Selecciona el grupo a eliminar')
        .setMinValues(1)
        .setMaxValues(Math.min(selectOptions.length, 25))
        .addOptions(selectOptions);

      const embed = new EmbedBuilder()
        .setTitle('🗑️ Eliminar Grupos de Armas')
        .setDescription('Selecciona los grupos que deseas eliminar')
        .setColor(0xFF6B6B);

      const selectRow = new ActionRowBuilder().addComponents(selectMenu);
      const buttonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`template_edit_weapons_back_${sessionId}`)
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
        );

      await interaction.reply({
        embeds: [embed],
        components: [selectRow, buttonRow],
        ephemeral: true
      });

    } catch (error) {
      console.error('[ERROR] Error en handleWeaponsRemove:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al procesar la eliminación.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Manejar selección de grupos para eliminar
  async handleWeaponsRemoveSelect(interaction) {
    try {
      const customId = interaction.customId;
      const sessionId = customId.replace('template_edit_weapons_remove_select_', '');

      const session = templateEditSessions.get(sessionId);
      if (!session) {
        return await interaction.reply({ content: 'Sesión de edición expirada.', ephemeral: true });
      }

      const selectedGroups = interaction.values;
      const removedGroups = [];

      // Eliminar los grupos seleccionados
      selectedGroups.forEach(groupKey => {
        if (session.data.weapons[groupKey]) {
          removedGroups.push(session.data.weapons[groupKey].displayName);
          delete session.data.weapons[groupKey];
        }
      });

      session.hasChanges = true;

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Grupos Eliminados')
        .setDescription(`Se eliminaron los siguientes grupos:\n${removedGroups.map(name => `• ${name}`).join('\n')}`)
        .setColor(parseInt((session.data.color || '#0099ff').replace('#', ''), 16));

      await interaction.reply({ embeds: [successEmbed], ephemeral: true });

    } catch (error) {
      console.error('[ERROR] Error en handleWeaponsRemoveSelect:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al eliminar los grupos.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Manejar eliminación de un grupo específico
  async handleWeaponRemoveSpecific(interaction, sessionId, groupKey) {
    try {
      const session = templateEditSessions.get(sessionId);
      if (!session) {
        return await interaction.reply({ content: 'Sesión de edición expirada.', ephemeral: true });
      }

      const weaponGroup = session.data.weapons[groupKey];
      if (!weaponGroup) {
        return await interaction.reply({ content: 'Grupo de armas no encontrado.', ephemeral: true });
      }

      const groupName = weaponGroup.displayName;
      delete session.data.weapons[groupKey];
      session.hasChanges = true;

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Grupo Eliminado')
        .setDescription(`Se eliminó el grupo: **${groupName}**`)
        .setColor(parseInt((session.data.color || '#0099ff').replace('#', ''), 16));

      await interaction.reply({ embeds: [successEmbed], ephemeral: true });

    } catch (error) {
      console.error('[ERROR] Error en handleWeaponRemoveSpecific:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al eliminar el grupo.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
};

// Función auxiliar para validar URLs
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}



// Manejar todos los botones relacionados con grupos
async function handleGroupButton(interaction, customId) {
  try {
    console.log('[DEBUG] handleGroupButton - customId:', customId);
    console.log('[DEBUG] handleGroupButton - parts:', customId.split('_'));

    // Parsear el customId correctamente según los diferentes formatos
    const parts = customId.split('_');

    // Determinar el formato del customId
    let action, sessionId, groupIndex;

    if (customId.includes('group_add_weapon_')) {
      // Format: group_add_weapon_sessionId_groupIndex
      action = 'add_weapon';
      sessionId = parts[3];
      groupIndex = parseInt(parts[4]);
    } else if (customId.includes('group_edit_weapon_')) {
      // Format: group_edit_weapon_sessionId_groupIndex
      action = 'edit_weapon';
      sessionId = parts[3];
      groupIndex = parseInt(parts[4]);
    } else if (customId.includes('group_remove_weapon_')) {
      // Format: group_remove_weapon_sessionId_groupIndex
      action = 'remove_weapon';
      sessionId = parts[3];
      groupIndex = parseInt(parts[4]);
    } else if (customId.includes('group_delete_')) {
      // Format: group_delete_sessionId_groupIndex
      action = 'delete';
      sessionId = parts[2];
      groupIndex = parseInt(parts[3]);
    } else {
      throw new Error(`Formato de customId no reconocido: ${customId}`);
    }

    console.log('[DEBUG] handleGroupButton - action:', action, 'sessionId:', sessionId, 'groupIndex:', groupIndex);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado. Por favor, inicia el comando nuevamente.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const { session, sessionId: actualSessionId } = validSession;

    switch (action) {
      case 'add_weapon':
        return await handleAddWeaponToGroup(interaction, actualSessionId, groupIndex);
      case 'edit_weapon':
        return await handleEditWeaponInGroup(interaction, actualSessionId, groupIndex);
      case 'remove_weapon':
        return await handleRemoveWeaponFromGroup(interaction, actualSessionId, groupIndex);
      case 'delete':
        return await handleDeleteGroup(interaction, actualSessionId, groupIndex);
      default:
        throw new Error(`Acción no reconocida: ${action}`);
    }

  } catch (error) {
    console.error('Error al manejar botón de grupo:', error);
    console.error('Error stack:', error.stack);
    console.error('CustomId completo:', customId);
    console.error('Interaction user:', interaction.user.id);
    console.error('Interaction guild:', interaction.guild.id);

    const errorEmbed = createErrorEmbed('Error', `Hubo un error al procesar la acción del grupo: ${error.message}`);

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (replyError) {
      console.error('Error enviando respuesta de error:', replyError);
    }
  }
}

// Añadir arma a un grupo usando el sistema completo de template create
async function handleAddWeaponToGroup(interaction, sessionId, groupIndex) {
  try {
    const session = templateEditSessions.get(sessionId);
    if (!session) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      return;
    }

    const weaponGroup = session.data.weapons[groupIndex];
    if (!weaponGroup) {
      const errorEmbed = createErrorEmbed('Grupo no encontrado', 'El grupo seleccionado no existe.');
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      return;
    }

    // Crear una sesión temporal de creación de template para añadir armas al grupo
    const { createSession } = require('../../lib/template/template-sessions');

    // Generar ID único para la sesión temporal de creación
    const tempSessionId = `editweapon_${sessionId}_${groupIndex}_${Date.now()}`;

    // Crear sesión de creación temporal con datos del grupo existente
    const tempSessionData = {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      step: 'weapon_category_selection',
      isEdit: true,
      originalSessionId: sessionId,
      editingGroupIndex: groupIndex,
      isNewGroup: false,
      isAddingWeapons: true, // Marcar que estamos añadiendo armas, no reemplazando el grupo
      data: {
        // Copiar datos básicos del template existente
        templateId: session.data.templateId,
        name: session.data.name,
        description: session.data.description,
        weapons: {}
      },
      tempGroupConfig: {
        displayName: weaponGroup.name || weaponGroup.displayName || `Grupo ${groupIndex + 1}`,
        defaultEmoji: weaponGroup.defaultEmoji || '⚔️',
        weaponKey: `group_${groupIndex}`,
        weapons: [] // Empezar sin armas para que el usuario pueda añadir nuevas
      }
    };

    createSession(tempSessionId, tempSessionData);

    // Diferir la interacción si es un botón
    if (interaction.isButton()) {
      await interaction.deferUpdate();
    }

    // Mostrar selección de categorías de armas usando el sistema de template create
    const createHandlers = require('../../lib/template/template-create-handlers');
    await createHandlers.showWeaponCategorySelection(interaction, tempSessionId);

  } catch (error) {
    console.error('Error al añadir arma al grupo:', error);
  }
}

// Editar arma en un grupo
async function handleEditWeaponInGroup(interaction, sessionId, groupIndex) {
  try {
    const session = templateEditSessions.get(sessionId);
    const weaponGroup = session.data.weapons[groupIndex];

    // Crear select menu con todas las armas del grupo
    const weaponOptions = [];
    if (weaponGroup.categories && weaponGroup.categories.length > 0) {
      weaponGroup.categories.forEach((category, categoryIndex) => {
        if (category.weapons && category.weapons.length > 0) {
          category.weapons.forEach((weapon, weaponIndex) => {
            weaponOptions.push({
              label: `${weapon.name} (${category.name})`,
              description: `Cantidad: ${weapon.quantity || weapon.units || 1}`,
              value: `${categoryIndex}_${weaponIndex}`
            });
          });
        }
      });
    }

    if (weaponOptions.length === 0) {
      const errorEmbed = createErrorEmbed('Sin armas', 'Este grupo no tiene armas para editar.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`select_weapon_edit_${sessionId}_${groupIndex}`)
      .setPlaceholder('Selecciona el arma a editar')
      .addOptions(weaponOptions.slice(0, 25)); // Límite de Discord

    const embed = createInfoEmbed(
      '✏️ Editar Arma',
      'Selecciona el arma que deseas editar de la lista.'
    );

    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
      .setLabel('← Volver al Grupo')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.update({
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Error al mostrar selección de armas para editar:', error);
    throw error;
  }
}

// Eliminar arma de un grupo
async function handleRemoveWeaponFromGroup(interaction, sessionId, groupIndex) {
  try {
    const session = templateEditSessions.get(sessionId);
    const weaponGroup = session.data.weapons[groupIndex];

    // Crear select menu con todas las armas del grupo
    const weaponOptions = [];
    if (weaponGroup.categories && weaponGroup.categories.length > 0) {
      weaponGroup.categories.forEach((category, categoryIndex) => {
        if (category.weapons && category.weapons.length > 0) {
          category.weapons.forEach((weapon, weaponIndex) => {
            weaponOptions.push({
              label: `${weapon.name} (${category.name})`,
              description: `Cantidad: ${weapon.quantity || weapon.units || 1}`,
              value: `${categoryIndex}_${weaponIndex}`
            });
          });
        }
      });
    }

    if (weaponOptions.length === 0) {
      const errorEmbed = createErrorEmbed('Sin armas', 'Este grupo no tiene armas para eliminar.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`select_weapon_remove_${sessionId}_${groupIndex}`)
      .setPlaceholder('Selecciona el arma a eliminar')
      .addOptions(weaponOptions.slice(0, 25)); // Límite de Discord

    const embed = createInfoEmbed(
      '🗑️ Eliminar Arma',
      '⚠️ Selecciona el arma que deseas eliminar permanentemente.'
    );

    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
      .setLabel('← Volver al Grupo')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.update({
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Error al mostrar selección de armas para eliminar:', error);
    throw error;
  }
}

// Eliminar grupo completo
async function handleDeleteGroup(interaction, sessionId, groupIndex) {
  try {
    const session = templateEditSessions.get(sessionId);
    const weaponGroup = session.data.weapons[groupIndex];

    const embed = createInfoEmbed(
      '🚮 Confirmar Eliminación',
      `¿Estás seguro de que deseas eliminar el grupo **${session.data.weapons[groupIndex]?.name || session.data.weapons[groupIndex]?.displayName || `Grupo ${groupIndex + 1}`}** completo?\n\nEsta acción no se puede deshacer.`
    );

    const confirmBtn = new ButtonBuilder()
      .setCustomId(`confirm_delete_group_${sessionId}_${groupIndex}`)
      .setLabel('✅ Sí, Eliminar')
      .setStyle(ButtonStyle.Danger);

    const cancelBtn = new ButtonBuilder()
      .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
      .setLabel('❌ Cancelar')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

    await interaction.update({
      embeds: [embed],
      components: [row]
    });

  } catch (error) {
    console.error('Error al mostrar confirmación de eliminación:', error);
    throw error;
  }
}

// =============== MODAL HANDLERS PARA GRUPOS ===============

// Manejar modal de añadir arma
const templateModule = module.exports; // Referencia al módulo principal

templateModule.handleAddWeaponModalSubmit = async function (interaction) {
  try {
    console.log('[DEBUG] handleAddWeaponModalSubmit - customId:', interaction.customId);

    const parts = interaction.customId.split('_'); // add_weapon_modal_sessionId_groupIndex
    const sessionId = parts[3];
    const groupIndex = parseInt(parts[4]);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const { session, sessionId: actualSessionId } = validSession;

    const weaponName = interaction.fields.getTextInputValue('weapon_name');
    const weaponQuantity = parseInt(interaction.fields.getTextInputValue('weapon_quantity')) || 1;
    const weaponEmoji = interaction.fields.getTextInputValue('weapon_emoji') || '⚔️';
    const weaponCategory = interaction.fields.getTextInputValue('weapon_category') || 'General';

    // Añadir el arma al grupo
    const weaponGroup = session.data.weapons[groupIndex];
    if (!weaponGroup.categories) {
      weaponGroup.categories = [];
    }

    // Buscar o crear la categoría
    let category = weaponGroup.categories.find(cat => cat.name === weaponCategory);
    if (!category) {
      category = { name: weaponCategory, weapons: [] };
      weaponGroup.categories.push(category);
    }

    // Añadir el arma
    const newWeapon = {
      name: weaponName,
      quantity: weaponQuantity,
      emoji: weaponEmoji,
      image: '',
      url: '',
      sendBuildToPrivate: false
    };

    category.weapons.push(newWeapon);

    // Marcar que hay cambios para poder guardar
    session.hasChanges = true;

    const successEmbed = createSuccessEmbed('Arma Añadida', `**${weaponName}** ha sido añadida al grupo.`);

    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_group_${actualSessionId}_${groupIndex}`)
      .setLabel('Volver al Grupo')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder()
      .addComponents(backButton);

    await interaction.reply({
      embeds: [successEmbed],
      components: [row],
      ephemeral: true
    });

  } catch (error) {
    console.error('Error al procesar modal de añadir arma:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo añadir el arma.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
};

// Manejar modal de nuevo grupo
templateModule.handleNewGroupModalSubmit = async function (interaction) {
  try {
    console.log('[DEBUG] handleNewGroupModalSubmit - customId:', interaction.customId);

    const parts = interaction.customId.split('_'); // new_group_modal_sessionId
    const sessionId = parts[3];

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const { session, sessionId: actualSessionId } = validSession;

    const groupName = interaction.fields.getTextInputValue('group_name');

    // Guardar datos temporales del grupo para después de seleccionar el emoji
    session.tempGroupData = {
      name: groupName
    };

    // Asegurar que la interacción del modal esté reconocida
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    // Mostrar selección de armas para elegir el emoji sobre el mismo reply
    await showWeaponSelectionForGroupEmoji(interaction, actualSessionId);

  } catch (error) {
    console.error('Error al procesar modal de nuevo grupo:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo crear el grupo.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
};

/**
 * Muestra selección de armas para elegir emoji del nuevo grupo
 */
async function showWeaponSelectionForGroupEmoji(interaction, sessionId) {
  try {
    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    // Cargar armas usando el mismo sistema de fallback que las otras funciones
    let categories = [];

    // Fallback 1: Intentar desde UserCategory
    try {
      const UserCategory = require('../../database/models/UserCategory');
      categories = await UserCategory.find({ userId: interaction.user.id });
      console.log('[DEBUG] Categorías del usuario encontradas:', categories.length);

      if (categories.length > 0) {
        // Mapear a formato consistente
        categories = categories.map(cat => ({
          _id: cat._id.toString(),
          displayName: cat.displayName,
          defaultEmoji: cat.defaultEmoji,
          weapons: cat.weapons || []
        }));
      }
    } catch (error) {
      console.error('[DEBUG] Error cargando UserCategory:', error);
    }

    // Fallback 2: Si no hay UserCategory, usar Weapon model
    if (!categories.length) {
      try {
        const Weapon = require('../../database/models/Weapon');
        const weapons = await Weapon.find({ isActive: true }).sort({ category: 1, name: 1 });
        console.log('[DEBUG] Armas del modelo Weapon encontradas:', weapons.length);

        if (weapons.length > 0) {
          // Agrupar armas por categoría
          const weaponsByCategory = {};
          weapons.forEach(weapon => {
            if (!weaponsByCategory[weapon.category]) {
              weaponsByCategory[weapon.category] = [];
            }
            weaponsByCategory[weapon.category].push({
              name: weapon.name,
              code: weapon.code || weapon.name,
              emojiId: weapon.emojiId || '⚔️'
            });
          });

          // Convertir a formato de categorías
          categories = [];
          for (const [categoryName, weaponList] of Object.entries(weaponsByCategory)) {
            // Buscar información de la categoría desde la primera arma
            const firstWeapon = weapons.find(w => w.category === categoryName);
            categories.push({
              _id: `weapon_${categoryName}`,
              displayName: firstWeapon?.categoryDisplayName || categoryName,
              defaultEmoji: firstWeapon?.categoryDefaultEmoji || '⚔️',
              weapons: weaponList
            });
          }
        }
      } catch (weaponError) {
        console.error('[DEBUG] Error cargando desde Weapon model:', weaponError);
      }
    }

    // Fallback 3: Si no hay Weapon model, usar weapons.json
    if (!categories.length) {
      try {
        const fs = require('fs');
        const path = require('path');
        const weaponsPath = path.join(__dirname, '../../weapons/weapons.json');

        if (fs.existsSync(weaponsPath)) {
          const weaponsData = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));
          categories = [];
          for (const [categoryName, weapons] of Object.entries(weaponsData)) {
            categories.push({
              _id: `system_${categoryName}`,
              displayName: categoryName,
              weapons: weapons.map(weapon => ({
                name: weapon.name,
                code: weapon.code || weapon.name,
                emojiId: weapon.emoji || '⚔️'
              }))
            });
          }
        }
      } catch (fallbackError) {
        console.error('[DEBUG] Error cargando armas del sistema:', fallbackError);
      }
    }

    if (!categories.length) {
      return await interaction.reply({
        content: 'No hay armas disponibles para seleccionar emoji. Usa `/upload_weapons` para cargar armas primero.',
        ephemeral: true
      });
    }

    // Recopilar todas las armas de todas las categorías para selección de emoji
    const allWeapons = [];
    categories.forEach(category => {
      if (category.weapons && category.weapons.length > 0) {
        category.weapons.forEach(weapon => {
          const option = {
            label: weapon.name,
            value: `${category._id}_${weapon.name}`,
            description: `${category.displayName} - Emoji para el grupo`
          };

          // Agregar emoji si existe - soporta unicode o custom emoji ID
          try {
            // weapon.emojiId puede ser un ID de emoji personalizado o un unicode en algunos fallbacks
            if (weapon.emojiId) {
              if (/^\d{15,20}$/.test(String(weapon.emojiId))) {
                option.emoji = { id: String(weapon.emojiId) };
              } else {
                option.emoji = { name: String(weapon.emojiId) };
              }
            } else if (weapon.emoji) {
              // fallback para weapons.json
              option.emoji = { name: String(weapon.emoji) };
            }
          } catch (emojiError) {
            console.log('[DEBUG] Error agregando emoji:', weapon.emojiId || weapon.emoji, emojiError);
            // Si falla, continuar sin emoji
          }

          allWeapons.push(option);
        });
      }
    });

    if (!allWeapons.length) {
      return await interaction.reply({
        content: 'No se encontraron armas en las categorías disponibles.',
        ephemeral: true
      });
    }

    // Crear select menu con todas las armas (máximo 25)
    const weaponOptions = allWeapons.slice(0, 25);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`group_emoji_select_${sessionId}`)
      .setPlaceholder('Selecciona un arma para usar su emoji como emoji del grupo...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(weaponOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setTitle('🎨 Seleccionar Emoji del Grupo')
      .setDescription(`Selecciona un arma cuyo emoji quieres usar para el grupo **${validSession.session.tempGroupData.name}**.\n\nEl emoji del arma seleccionada será el emoji del grupo.`)
      .setColor('#3498db');

    const backButton = new ButtonBuilder()
      .setCustomId(`template_edit_back_${sessionId}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❌');

    const buttonRow = new ActionRowBuilder().addComponents(backButton);

    // Modal submit interactions don't have a message to update; prefer reply/editReply
    const payload = {
      embeds: [embed],
      components: [row, buttonRow],
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ephemeral: true });
    }

  } catch (error) {
    console.error('Error en showWeaponSelectionForGroupEmoji:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: 'Ocurrió un error al mostrar la selección de armas.',
        embeds: [],
        components: []
      });
    } else {
      await interaction.reply({
        content: 'Ocurrió un error al mostrar la selección de armas.',
        ephemeral: true
      });
    }
  }
}

/**
 * Maneja la selección del emoji del grupo basado en arma elegida
 */
async function handleGroupEmojiSelect(interaction) {
  try {
    // Acknowledge the select interaction early to avoid timeouts
    if (!interaction.deferred && !interaction.replied) {
      // For select menus, prefer deferUpdate to keep the same message
      await interaction.deferUpdate();
    }
    const sessionId = interaction.customId.replace('group_emoji_select_', '');
    const selectedWeaponData = interaction.values[0]; // "categoryId_weaponName"

    console.log('[DEBUG] handleGroupEmojiSelect - sessionId:', sessionId, 'weapon:', selectedWeaponData);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    console.log('[DEBUG] handleGroupEmojiSelect - validSession found:', !!validSession);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const { session, sessionId: actualSessionId } = validSession;
    const tempData = session.tempGroupData;

    if (!tempData) {
      return await interaction.reply({
        content: 'No se encontraron los datos temporales del grupo.',
        ephemeral: true
      });
    }

    // Buscar el arma seleccionada para obtener su emoji
    // Usar una división más segura que maneje nombres con underscore
    const firstUnderscoreIndex = selectedWeaponData.indexOf('_');
    const categoryId = selectedWeaponData.substring(0, firstUnderscoreIndex);
    const weaponName = selectedWeaponData.substring(firstUnderscoreIndex + 1);
    console.log('[DEBUG] handleGroupEmojiSelect - categoryId:', categoryId, 'weaponName:', weaponName);

    let selectedWeapon = null;
    let weaponEmoji = '⚔️';

    // Buscar el arma usando el mismo sistema de fallback
    if (categoryId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        const UserCategory = require('../../database/models/UserCategory');
        const category = await UserCategory.findOne({
          _id: categoryId,
          userId: interaction.user.id
        });

        if (category && category.weapons?.length) {
          const weapon = category.weapons.find(w => w.name === weaponName);
          if (weapon) {
            weaponEmoji = weapon.emojiId || weapon.emoji || '⚔️';
            selectedWeapon = weapon;
          }
        }
      } catch (error) {
        console.error('[DEBUG] Error cargando desde UserCategory:', error);
      }
    }

    // Fallback: Buscar en Weapon model
    if (!selectedWeapon) {
      try {
        const Weapon = require('../../database/models/Weapon');
        const weapon = await Weapon.findOne({
          name: weaponName,
          isActive: true
        });

        if (weapon) {
          weaponEmoji = weapon.emojiId || '⚔️';
          selectedWeapon = weapon;
        }
      } catch (error) {
        console.error('[DEBUG] Error cargando desde Weapon model:', error);
      }
    }

    // Fallback final: weapons.json
    if (!selectedWeapon) {
      try {
        const fs = require('fs');
        const path = require('path');
        const weaponsPath = path.join(__dirname, '../../weapons/weapons.json');

        if (fs.existsSync(weaponsPath)) {
          const weaponsData = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));

          for (const [catName, weapons] of Object.entries(weaponsData)) {
            const weapon = weapons.find(w => w.name === weaponName);
            if (weapon) {
              weaponEmoji = weapon.emoji || '⚔️';
              selectedWeapon = weapon;
              break;
            }
          }
        }
      } catch (error) {
        console.error('[DEBUG] Error cargando desde weapons.json:', error);
      }
    }

    // Crear el grupo con el emoji seleccionado
    const newGroup = {
      name: tempData.name,
      defaultEmoji: weaponEmoji,
      categories: [
        {
          name: 'General',
          weapons: []
        }
      ]
    };

    // Añadir al template
    if (!session.data.weapons) {
      session.data.weapons = [];
    }
    session.data.weapons.push(newGroup);

    // Limpiar datos temporales
    delete session.tempGroupData;

    // Marcar que hay cambios para poder guardar
    session.hasChanges = true;

    const successEmbed = createSuccessEmbed(
      'Grupo Creado',
      `El grupo **${tempData.name}** ha sido creado exitosamente con el emoji ${weaponEmoji}.\n\n**Arma seleccionada:** ${selectedWeapon?.name || weaponName}`
    );

    const botones = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`template_edit_back_${actualSessionId}`)
          .setLabel('Volver al Editor')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('◀️'),
        new ButtonBuilder()
          .setCustomId(`template_edit_weapons_${actualSessionId}`)
          .setLabel('Editar Armas')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔫')
      );

    // After deferUpdate, edit the original reply message
    if (interaction.message && interaction.message.edit) {
      await interaction.message.edit({
        embeds: [successEmbed],
        components: [botones]
      });
    } else if (interaction.editReply) {
      await interaction.editReply({
        embeds: [successEmbed],
        components: [botones]
      });
    }

  } catch (error) {
    console.error('Error en handleGroupEmojiSelect:', error);
    console.error('Error stack:', error.stack);
    console.error('CustomId:', interaction.customId);
    console.error('Selected values:', interaction.values);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Ocurrió un error al procesar la selección del emoji.',
        ephemeral: true
      });
    } else {
      await interaction.followUp({
        content: 'Ocurrió un error al procesar la selección del emoji.',
        ephemeral: true
      });
    }
  }
}

// =============== SELECT HANDLERS PARA GRUPOS ===============

// Manejar selección de arma para editar
templateModule.handleSelectWeaponEdit = async function (interaction) {
  try {
    const parts = interaction.customId.split('_'); // select_weapon_edit_sessionId_groupIndex
    const sessionId = parts[3];
    const groupIndex = parseInt(parts[4]);
    const weaponPath = interaction.values[0]; // "categoryIndex_weaponIndex"
    const [categoryIndex, weaponIndex] = weaponPath.split('_').map(i => parseInt(i));

    const session = templateEditSessions.get(sessionId);
    if (!session) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponGroup = session.data.weapons[groupIndex];
    const weapon = weaponGroup.categories[categoryIndex].weapons[weaponIndex];

    // Mostrar modal para editar el arma
    const modal = new ModalBuilder()
      .setCustomId(`edit_weapon_modal_${sessionId}_${groupIndex}_${categoryIndex}_${weaponIndex}`)
      .setTitle('Editar Arma');

    const weaponNameInput = new TextInputBuilder()
      .setCustomId('weapon_name')
      .setLabel('Nombre del Arma')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(weapon.name)
      .setMaxLength(50);

    const weaponQuantityInput = new TextInputBuilder()
      .setCustomId('weapon_quantity')
      .setLabel('Cantidad')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(weapon.quantity || weapon.units || 1))
      .setMaxLength(3);

    const weaponEmojiInput = new TextInputBuilder()
      .setCustomId('weapon_emoji')
      .setLabel('Emoji')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(weapon.emoji || weapon.emojiId || '⚔️')
      .setMaxLength(10);

    const row1 = new ActionRowBuilder().addComponents(weaponNameInput);
    const row2 = new ActionRowBuilder().addComponents(weaponQuantityInput);
    const row3 = new ActionRowBuilder().addComponents(weaponEmojiInput);

    modal.addComponents(row1, row2, row3);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Error al manejar selección de arma para editar:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo procesar la selección.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
};

// Manejar modal de editar arma
templateModule.handleEditWeaponModalSubmit = async function (interaction) {
  try {
    const parts = interaction.customId.split('_'); // edit_weapon_modal_sessionId_groupIndex_categoryIndex_weaponIndex
    const sessionId = parts[3];
    const groupIndex = parseInt(parts[4]);
    const categoryIndex = parseInt(parts[5]);
    const weaponIndex = parseInt(parts[6]);

    const session = templateEditSessions.get(sessionId);
    if (!session) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponName = interaction.fields.getTextInputValue('weapon_name');
    const weaponQuantity = parseInt(interaction.fields.getTextInputValue('weapon_quantity')) || 1;
    const weaponEmoji = interaction.fields.getTextInputValue('weapon_emoji') || '⚔️';

    // Actualizar el arma
    const weaponGroup = session.data.weapons[groupIndex];
    const weapon = weaponGroup.categories[categoryIndex].weapons[weaponIndex];

    weapon.name = weaponName;
    weapon.quantity = weaponQuantity;
    weapon.emoji = weaponEmoji;
    // Compatibilidad
    weapon.units = weaponQuantity;
    weapon.emojiId = weaponEmoji;

    // Marcar que hay cambios para poder guardar
    session.hasChanges = true;

    const successEmbed = createSuccessEmbed('Arma Actualizada', `**${weaponName}** ha sido actualizada exitosamente.`);

    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
      .setLabel('Volver al Grupo')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder()
      .addComponents(backButton);

    await interaction.reply({
      embeds: [successEmbed],
      components: [row],
      ephemeral: true
    });

  } catch (error) {
    console.error('Error al procesar modal de editar arma:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo actualizar el arma.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
};

// Manejar selección de arma para eliminar
templateModule.handleSelectWeaponRemove = async function (interaction) {
  try {
    const parts = interaction.customId.split('_'); // select_weapon_remove_sessionId_groupIndex
    const sessionId = parts[3];
    const groupIndex = parseInt(parts[4]);
    const weaponPath = interaction.values[0]; // "categoryIndex_weaponIndex"
    const [categoryIndex, weaponIndex] = weaponPath.split('_').map(i => parseInt(i));

    const session = templateEditSessions.get(sessionId);
    if (!session) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponGroup = session.data.weapons[groupIndex];
    const weapon = weaponGroup.categories[categoryIndex].weapons[weaponIndex];

    // Eliminar el arma
    weaponGroup.categories[categoryIndex].weapons.splice(weaponIndex, 1);

    // Si la categoría queda vacía, eliminarla también
    if (weaponGroup.categories[categoryIndex].weapons.length === 0) {
      weaponGroup.categories.splice(categoryIndex, 1);
    }

    // Marcar que hay cambios pendientes
    session.hasChanges = true;

    const successEmbed = createSuccessEmbed('Arma Eliminada', `**${weapon.name}** ha sido eliminada del grupo.`);

    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
      .setLabel('Volver al Grupo')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder()
      .addComponents(backButton);

    await interaction.update({
      embeds: [successEmbed],
      components: [row]
    });

  } catch (error) {
    console.error('Error al eliminar arma:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo eliminar el arma.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
};

// Manejar confirmación de eliminar grupo completo
templateModule.handleConfirmDeleteGroup = async function (interaction) {
  try {
    const parts = interaction.customId.split('_'); // confirm_delete_group_sessionId_groupIndex
    const sessionId = parts[3];
    const groupIndex = parseInt(parts[4]);

    const session = templateEditSessions.get(sessionId);
    if (!session) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Eliminar el grupo completo
    const removedGroup = session.data.weapons.splice(groupIndex, 1)[0];

    // Marcar que hay cambios para poder guardar
    session.hasChanges = true;

    const successEmbed = createSuccessEmbed('Grupo Eliminado', `El grupo **${removedGroup.name || removedGroup.displayName || `Grupo ${groupIndex + 1}`}** ha sido eliminado completamente.`);

    const backButton = new ButtonBuilder()
      .setCustomId(`template_edit_back_${sessionId}`)
      .setLabel('◀️ Volver al Editor')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.update({
      embeds: [successEmbed],
      components: [row]
    });

  } catch (error) {
    console.error('Error al eliminar grupo:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo eliminar el grupo.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
};

// Manejar botón de volver al grupo
templateModule.handleBackToGroup = async function (interaction) {
  try {
    const parts = interaction.customId.split('_'); // back_to_group_sessionId_groupIndex
    const sessionId = parts[3];
    const groupIndex = parseInt(parts[4]);

    const session = templateEditSessions.get(sessionId);
    if (!session) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponGroup = session.data.weapons[groupIndex];
    await templateModule.showGroupEditInterface(interaction, sessionId, weaponGroup, groupIndex);

  } catch (error) {
    console.error('Error al volver al grupo:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo regresar al grupo.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
};

// Mostrar interfaz para eliminar armas de un grupo
async function showRemoveWeaponsInterface(interaction, sessionId, groupIndex, session) {
  try {
    console.log('[DEBUG] showRemoveWeaponsInterface - sessionId:', sessionId, 'groupIndex:', groupIndex);

    if (!session.data.weapons || !session.data.weapons[groupIndex]) {
      return await interaction.reply({
        content: 'No se encontró el grupo de armas especificado.',
        ephemeral: true
      });
    }

    const weaponGroup = session.data.weapons[groupIndex];
    const allWeapons = [];

    // Recopilar todas las armas del grupo con sus categorías
    if (weaponGroup.categories) {
      weaponGroup.categories.forEach((category, catIndex) => {
        if (category.weapons) {
          category.weapons.forEach((weapon, weaponIndex) => {
            allWeapons.push({
              label: `${weapon.name} (${category.name})`,
              value: `${catIndex}_${weaponIndex}`,
              description: weapon.code ? `Código: ${weapon.code}` : 'Sin código'
            });
          });
        }
      });
    }

    if (!allWeapons.length) {
      return await interaction.reply({
        content: 'Este grupo no tiene armas para eliminar.',
        ephemeral: true
      });
    }

    // Crear select menu para elegir armas a eliminar
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`remove_weapons_select_${sessionId}_${groupIndex}`)
      .setPlaceholder('Selecciona las armas a eliminar...')
      .setMinValues(1)
      .setMaxValues(Math.min(allWeapons.length, 25))
      .addOptions(allWeapons.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setTitle(`🗑️ Eliminar Armas de ${session.data.weapons[groupIndex]?.name || session.data.weapons[groupIndex]?.displayName || `Grupo ${groupIndex + 1}`}`)
      .setDescription('Selecciona las armas que quieres eliminar de este grupo:')
      .setColor('#FF4444');

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

  } catch (error) {
    console.error('Error en showRemoveWeaponsInterface:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo mostrar la interfaz de eliminación.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

// Mostrar directamente todas las armas disponibles para añadir (sin categorías)
async function showDirectWeaponSelectionForEdit(interaction, sessionId, groupIndex) {
  try {
    console.log('[DEBUG] showDirectWeaponSelectionForEdit - sessionId:', sessionId, 'groupIndex:', groupIndex);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    // Cargar todas las categorías y sus armas
    let categories = null;
    try {
      const UserCategory = require('../../database/models/UserCategory');
      console.log('🔄 [DEBUG] Buscando UserCategory para guild:', interaction.guild.id);

      // Obtener todos los miembros del guild para buscar sus categorías
      const guildMembers = await interaction.guild.members.fetch();
      const userIds = Array.from(guildMembers.keys());
      console.log('🔄 [DEBUG] Miembros del guild encontrados:', userIds.length);

      categories = await UserCategory.find({ userId: { $in: userIds } }).sort({ displayName: 1 });
      console.log('🔄 [DEBUG] UserCategories encontradas:', categories?.length || 0);
      if (categories?.length > 0) {
        console.log('🔄 [DEBUG] Primera categoría:', categories[0].displayName, 'con', categories[0].weapons?.length || 0, 'armas');
      }
    } catch (error) {
      console.error('[DEBUG] Error cargando UserCategory:', error);
      categories = [];
    }

    if (!categories || !categories.length) {
      console.log('🔄 [DEBUG] No se encontraron UserCategories, intentando Weapon model...');

      // Fallback 1: Usar el Weapon model del sistema
      try {
        const Weapon = require('../../database/models/Weapon');
        const weapons = await Weapon.find({ isActive: true }).sort({ category: 1, name: 1 });
        console.log('🔄 [DEBUG] Armas del modelo Weapon encontradas:', weapons.length);

        if (weapons.length > 0) {
          // Agrupar armas por categoría
          const weaponsByCategory = {};
          weapons.forEach(weapon => {
            if (!weaponsByCategory[weapon.category]) {
              weaponsByCategory[weapon.category] = [];
            }
            weaponsByCategory[weapon.category].push({
              name: weapon.name,
              code: weapon.code || weapon.name,
              quantity: weapon.quantity || 1,
              emojiId: weapon.emojiId || '⚔️'
            });
          });

          // Convertir a formato de categorías
          categories = [];
          for (const [categoryName, weaponList] of Object.entries(weaponsByCategory)) {
            // Buscar información de la categoría desde la primera arma
            const firstWeapon = weapons.find(w => w.category === categoryName);
            categories.push({
              _id: `weapon_${categoryName}`,
              displayName: firstWeapon?.categoryDisplayName || categoryName,
              defaultEmoji: firstWeapon?.categoryDefaultEmoji || '⚔️',
              weapons: weaponList
            });
          }
          console.log('🔄 [DEBUG] Categorías creadas desde Weapon model:', categories.length);
        }
      } catch (weaponError) {
        console.error('[DEBUG] Error cargando desde Weapon model:', weaponError);
      }

      // Fallback 2: Si no hay Weapon model, usar weapons.json
      if ((!categories || !categories.length)) {
        console.log('🔄 [DEBUG] Intentando cargar desde weapons.json...');
        try {
          const fs = require('fs');
          const path = require('path');
          const weaponsPath = path.join(__dirname, '../../weapons/weapons.json');

          if (fs.existsSync(weaponsPath)) {
            const weaponsData = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));
            console.log('🔄 [DEBUG] Armas del sistema cargadas:', Object.keys(weaponsData).length, 'categorías');

            // Convertir weapons.json a formato de categorías
            categories = [];
            for (const [categoryName, weapons] of Object.entries(weaponsData)) {
              categories.push({
                _id: `system_${categoryName}`,
                displayName: categoryName,
                weapons: weapons.map(weapon => ({
                  name: weapon.name,
                  code: weapon.code || weapon.name,
                  quantity: weapon.quantity || 1,
                  emojiId: weapon.emoji || '⚔️'
                }))
              });
            }
            console.log('🔄 [DEBUG] Categorías del sistema convertidas:', categories.length);
          } else {
            console.log('🔄 [DEBUG] No se encontró weapons.json');
            return await interaction.reply({
              content: 'No hay armas disponibles. Usa `/upload_weapons` para cargar armas primero.',
              ephemeral: true
            });
          }
        } catch (fallbackError) {
          console.error('[DEBUG] Error cargando armas del sistema:', fallbackError);
          return await interaction.reply({
            content: 'No hay armas disponibles. Usa `/upload_weapons` para cargar armas primero.',
            ephemeral: true
          });
        }
      }
    }

    // Verificar si finalmente tenemos categorías
    if (!categories || !categories.length) {
      return await interaction.reply({
        content: 'No hay armas disponibles. Usa `/upload_weapons` para cargar armas primero.',
        ephemeral: true
      });
    }

    // Recopilar todas las armas de todas las categorías
    const allWeapons = [];
    categories.forEach(category => {
      if (category.weapons && category.weapons.length > 0) {
        category.weapons.forEach(weapon => {
          allWeapons.push({
            label: weapon.name,
            value: `${category._id}_${weapon.name}`,
            description: `${category.displayName || category.name} - ${weapon.emojiId || weapon.emoji || 'Sin código'}`
          });
        });
      }
    });

    if (!allWeapons.length) {
      return await interaction.reply({
        content: 'No se encontraron armas en las categorías disponibles.',
        ephemeral: true
      });
    }

    // Crear select menu con todas las armas (máximo 25)
    const weaponOptions = allWeapons.slice(0, 25);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`direct_weapon_select_${sessionId}_${groupIndex}`)
      .setPlaceholder('Selecciona un arma para configurar...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(weaponOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setTitle(`➕ Añadir Armas a ${session.data.weapons[groupIndex]?.name || session.data.weapons[groupIndex]?.displayName || `Grupo ${groupIndex + 1}`}`)
      .setDescription(`Selecciona las armas que quieres añadir al grupo.\n\n**Armas disponibles:** ${allWeapons.length}${allWeapons.length > 25 ? ' (mostrando las primeras 25)' : ''}`)
      .setColor('#00FF00');

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

  } catch (error) {
    console.error('Error en showDirectWeaponSelectionForEdit:', error);
    console.error('Error stack:', error.stack);

    try {
      const errorEmbed = createErrorEmbed('Error', `No se pudieron cargar las armas: ${error.message}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (replyError) {
      console.error('Error enviando error embed:', replyError);
    }
  }
}

// Mostrar selección de categorías para añadir armas (versión para edición) - DEPRECADA
async function showWeaponCategorySelectionForEdit(interaction, sessionId) {
  try {
    console.log('[DEBUG] showWeaponCategorySelectionForEdit - sessionId:', sessionId);
    console.log('[DEBUG] showWeaponCategorySelectionForEdit - user:', interaction.user.id, 'guild:', interaction.guild.id);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      console.log('[DEBUG] showWeaponCategorySelectionForEdit - Sesión inválida');
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    console.log('[DEBUG] showWeaponCategorySelectionForEdit - Sesión válida encontrada');

    // Cargar categorías disponibles
    const UserCategory = require('../../database/models/UserCategory');
    console.log('[DEBUG] showWeaponCategorySelectionForEdit - Cargando categorías para guild:', interaction.guild.id);

    // Obtener todos los miembros del guild para buscar sus categorías
    const guildMembers = await interaction.guild.members.fetch();
    const userIds = Array.from(guildMembers.keys());

    const categories = await UserCategory.find({ userId: { $in: userIds } }).sort({ displayName: 1 });
    console.log('[DEBUG] showWeaponCategorySelectionForEdit - Categorías encontradas:', categories.length);
    if (categories.length > 0) {
      console.log('[DEBUG] Primera categoría encontrada:', categories[0].displayName, 'ID:', categories[0]._id);
    }

    if (!categories.length) {
      console.log('[DEBUG] showWeaponCategorySelectionForEdit - No hay UserCategories, intentando Weapon model...');

      // Fallback 1: Usar el Weapon model del sistema
      try {
        const Weapon = require('../../database/models/Weapon');
        const weapons = await Weapon.find({ isActive: true }).sort({ category: 1, name: 1 });
        console.log('[DEBUG] Armas del modelo Weapon encontradas:', weapons.length);

        if (weapons.length > 0) {
          // Agrupar armas por categoría y obtener información de categoría
          const weaponsByCategory = {};
          const categoryInfo = {};

          weapons.forEach(weapon => {
            if (!weaponsByCategory[weapon.category]) {
              weaponsByCategory[weapon.category] = [];
              // Guardar información de la categoría (tomar del primer arma de la categoría)
              categoryInfo[weapon.category] = {
                displayName: weapon.categoryDisplayName,
                defaultEmoji: weapon.categoryDefaultEmoji
              };
            }
            weaponsByCategory[weapon.category].push({
              name: weapon.name,
              code: weapon.code || weapon.name,
              quantity: weapon.quantity || 1,
              emoji: weapon.emojiId || '⚔️'
            });
          });

          // Convertir a formato de categorías
          const categoriesArray = [];
          for (const [categoryName, weaponList] of Object.entries(weaponsByCategory)) {
            categoriesArray.push({
              _id: `weapon_${categoryName}`,
              displayName: categoryInfo[categoryName].displayName,
              defaultEmoji: categoryInfo[categoryName].defaultEmoji,
              weapons: weaponList
            });
          }
          categories.push(...categoriesArray);
          console.log('[DEBUG] Categorías creadas desde Weapon model:', categoriesArray.length);
        }
      } catch (weaponError) {
        console.error('[DEBUG] Error cargando desde Weapon model:', weaponError);
      }

      // Fallback 2: Si no hay Weapon model, usar weapons.json
      if (!categories.length) {
        console.log('[DEBUG] Intentando cargar desde weapons.json...');
        try {
          const fs = require('fs');
          const path = require('path');
          const weaponsPath = path.join(__dirname, '../../weapons/weapons.json');

          if (fs.existsSync(weaponsPath)) {
            const weaponsData = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));
            console.log('[DEBUG] Cargando armas del sistema para categorías:', Object.keys(weaponsData).length);

            // Convertir a formato esperado
            categories = [];
            for (const [categoryName, weapons] of Object.entries(weaponsData)) {
              categories.push({
                _id: `system_${categoryName}`,
                name: categoryName,
                weapons: weapons.map(weapon => ({
                  name: weapon.name,
                  code: weapon.code || weapon.name,
                  quantity: weapon.quantity || 1,
                  emoji: weapon.emoji || '⚔️'
                }))
              });
            }
          } else {
            return await interaction.reply({
              content: 'No hay categorías de armas disponibles. Usa `/upload_weapons` para cargar armas primero.',
              ephemeral: true
            });
          }
        } catch (error) {
          console.error('[DEBUG] Error en fallback de armas del sistema:', error);
          return await interaction.reply({
            content: 'No hay categorías de armas disponibles. Usa `/upload_weapons` para cargar armas primero.',
            ephemeral: true
          });
        }
      }
    }

    // Verificar si finalmente tenemos categorías
    if (!categories.length) {
      return await interaction.reply({
        content: 'No hay categorías de armas disponibles. Usa `/upload_weapons` para cargar armas primero.',
        ephemeral: true
      });
    }

    // Crear select menu con las categorías
    const categoryOptions = categories.slice(0, 25).map(category => {
      console.log('[DEBUG] Procesando categoría:', category.displayName, 'weapons:', category.weapons?.length || 0);

      return {
        label: category.displayName,
        value: category._id.toString(),
        description: `${category.weapons?.length || 0} armas disponibles`,
        emoji: category.defaultEmoji || '⚔️'
      };
    });

    console.log('[DEBUG] showWeaponCategorySelectionForEdit - Opciones creadas:', categoryOptions.length);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`category_select_for_group_${sessionId}`)
      .setPlaceholder('Selecciona una categoría de armas...')
      .addOptions(categoryOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setTitle('📋 Seleccionar Categoría')
      .setDescription('Elige la categoría de armas que quieres añadir al grupo:')
      .setColor('#0099FF');

    console.log('[DEBUG] showWeaponCategorySelectionForEdit - Enviando respuesta...');
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    console.log('[DEBUG] showWeaponCategorySelectionForEdit - Respuesta enviada exitosamente');

  } catch (error) {
    console.error('Error en showWeaponCategorySelectionForEdit:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);

    try {
      const errorEmbed = createErrorEmbed('Error', `No se pudo mostrar las categorías: ${error.message}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (replyError) {
      console.error('Error enviando error embed:', replyError);
    }
  }
}// Manejar selección de categoría para grupos
async function handleCategorySelectForGroup(interaction) {
  try {
    const sessionId = interaction.customId.replace('category_select_for_group_', '');
    const categoryId = interaction.values[0];

    console.log('[DEBUG] handleCategorySelectForGroup - sessionId:', sessionId, 'categoryId:', categoryId);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    // Cargar las armas de la categoría
    let category = null;

    if (categoryId.startsWith('weapon_') || categoryId.startsWith('system_')) {
      // Es una categoría del sistema, cargar desde el modelo Weapon o weapons.json
      console.log('[DEBUG] Cargando categoría del sistema:', categoryId);

      try {
        if (categoryId.startsWith('weapon_')) {
          // Cargar desde modelo Weapon
          const Weapon = require('../../database/models/Weapon');
          const categoryName = categoryId.replace('weapon_', '');
          const weapons = await Weapon.find({ category: categoryName, isActive: true }).sort({ name: 1 });

          if (weapons.length > 0) {
            // Usar la información real de la primera arma para la categoría
            const firstWeapon = weapons[0];
            category = {
              _id: categoryId,
              displayName: firstWeapon.categoryDisplayName,
              defaultEmoji: firstWeapon.categoryDefaultEmoji,
              weapons: weapons.map(weapon => ({
                name: weapon.name,
                code: weapon.code || weapon.name,
                quantity: weapon.quantity || 1,
                emoji: weapon.emojiId || '⚔️'
              }))
            };
          }
        } else if (categoryId.startsWith('system_')) {
          // Cargar desde weapons.json
          const fs = require('fs');
          const path = require('path');
          const weaponsPath = path.join(__dirname, '../../weapons/weapons.json');

          if (fs.existsSync(weaponsPath)) {
            const weaponsData = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));
            const categoryName = categoryId.replace('system_', '');
            const weapons = weaponsData[categoryName];

            if (weapons) {
              category = {
                _id: categoryId,
                displayName: categoryName,
                weapons: weapons.map(weapon => ({
                  name: weapon.name,
                  code: weapon.code || weapon.name,
                  quantity: weapon.quantity || 1,
                  emoji: weapon.emoji || '⚔️'
                }))
              };
            }
          }
        }
      } catch (error) {
        console.error('[DEBUG] Error cargando categoría del sistema:', error);
      }
    } else {
      // Es una UserCategory normal
      try {
        const UserCategory = require('../../database/models/UserCategory');
        category = await UserCategory.findById(categoryId);
      } catch (error) {
        console.error('[DEBUG] Error cargando UserCategory:', error);
        category = null;
      }
    }

    if (!category || !category.weapons?.length) {
      return await interaction.reply({
        content: 'No se encontraron armas en esta categoría.',
        ephemeral: true
      });
    }

    // Crear select menu con las armas
    const weaponOptions = category.weapons.slice(0, 25).map((weapon, index) => ({
      label: weapon.name,
      value: index.toString(),
      description: weapon.code ? `Código: ${weapon.code}` : 'Sin código',
      emoji: weapon.emoji || weapon.emojiId || '⚔️'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`weapon_select_for_group_${sessionId}_${categoryId}`)
      .setPlaceholder('Selecciona un arma para configurar...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(weaponOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setTitle(`🗡️ Armas de ${category.displayName}`)
      .setDescription('Selecciona las armas que quieres añadir al grupo:')
      .setColor('#0099FF');

    await interaction.update({ embeds: [embed], components: [row] });

  } catch (error) {
    console.error('Error en handleCategorySelectForGroup:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudieron cargar las armas.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

// Manejar selección de armas específicas para grupos
async function handleWeaponSelectForGroup(interaction) {
  try {
    const customIdParts = interaction.customId.replace('weapon_select_for_group_', '').split('_');
    const categoryId = customIdParts.pop();
    const sessionId = customIdParts.join('_');
    const selectedWeaponIndexes = interaction.values.map(v => parseInt(v));

    console.log('[DEBUG] handleWeaponSelectForGroup - sessionId:', sessionId, 'categoryId:', categoryId, 'weapons:', selectedWeaponIndexes);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    // Cargar la categoría y las armas seleccionadas usando el mismo sistema de fallback
    let category = null;
    let weapons = [];

    // Si categoryId es un ObjectId válido, intentar UserCategory
    if (categoryId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        const UserCategory = require('../../database/models/UserCategory');
        category = await UserCategory.findOne({
          _id: categoryId,
          userId: interaction.user.id
        });
        if (category && category.weapons?.length) {
          weapons = category.weapons;
          console.log('[DEBUG] Categoría cargada desde UserCategory:', category.displayName);
        }
      } catch (error) {
        console.error('[DEBUG] Error cargando desde UserCategory:', error);
      }
    }

    // Fallback: Si no encontró en UserCategory, buscar en Weapon model
    if (!weapons.length) {
      try {
        const Weapon = require('../../database/models/Weapon');
        const categoryName = categoryId.replace('weapon_', '');
        const weaponsFromModel = await Weapon.find({
          category: categoryName,
          isActive: true
        }).sort({ name: 1 });

        if (weaponsFromModel.length > 0) {
          weapons = weaponsFromModel.map(weapon => ({
            name: weapon.name,
            code: weapon.code || weapon.name,
            emojiId: weapon.emojiId || '⚔️'
          }));

          // Crear categoría temporal
          category = {
            displayName: weaponsFromModel[0].categoryDisplayName || categoryName,
            weapons: weapons
          };
          console.log('[DEBUG] Categoría cargada desde Weapon model:', categoryName, 'armas:', weapons.length);
        }
      } catch (error) {
        console.error('[DEBUG] Error cargando desde Weapon model:', error);
      }
    }

    // Fallback final: weapons.json
    if (!weapons.length) {
      try {
        const fs = require('fs');
        const path = require('path');
        const weaponsPath = path.join(__dirname, '../../weapons/weapons.json');

        if (fs.existsSync(weaponsPath)) {
          const weaponsData = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));
          const categoryName = categoryId.replace('system_', '');

          if (weaponsData[categoryName]) {
            weapons = weaponsData[categoryName];
            category = {
              displayName: categoryName,
              weapons: weapons
            };
            console.log('[DEBUG] Categoría cargada desde weapons.json:', categoryName);
          }
        }
      } catch (error) {
        console.error('[DEBUG] Error cargando desde weapons.json:', error);
      }
    }

    if (!weapons.length) {
      return await interaction.reply({
        content: 'No se encontró la categoría de armas o no tiene armas disponibles.',
        ephemeral: true
      });
    }

    // Ahora es selección individual (selectedWeaponIndexes solo tiene 1 elemento)
    const selectedWeaponIndex = selectedWeaponIndexes[0];
    const selectedWeapon = weapons[selectedWeaponIndex];

    if (!selectedWeapon) {
      return await interaction.reply({
        content: 'No se pudo obtener el arma seleccionada.',
        ephemeral: true
      });
    }

    // Obtener el índice del grupo que se está editando
    const session = validSession.session;
    const groupIndex = session.currentGroupIndex;

    if (groupIndex === undefined || !session.data.weapons || !session.data.weapons[groupIndex]) {
      return await interaction.reply({
        content: 'No se encontró el grupo de armas que se está editando.',
        ephemeral: true
      });
    }

    // Guardar información temporal del arma seleccionada para el modal
    session.tempWeaponData = {
      weapon: selectedWeapon,
      categoryName: category.displayName,
      groupIndex: groupIndex
    };

    // Marcar que hubo cambios
    session.hasChanges = true;

    // Mostrar modal para configurar el arma
    const modal = new ModalBuilder()
      .setCustomId(`weapon_config_modal_${sessionId}`)
      .setTitle(`Configurar: ${selectedWeapon.name}`);

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel('Cantidad')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ej: 1')
      .setValue('1')
      .setRequired(true);

    const linkInput = new TextInputBuilder()
      .setCustomId('link')
      .setLabel('Enlace (opcional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://ejemplo.com')
      .setRequired(false);

    const privateInput = new TextInputBuilder()
      .setCustomId('private')
      .setLabel('Enviar al privado? (sí/no)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('no')
      .setValue('no')
      .setRequired(false);

    const quantityRow = new ActionRowBuilder().addComponents(quantityInput);
    const linkRow = new ActionRowBuilder().addComponents(linkInput);
    const privateRow = new ActionRowBuilder().addComponents(privateInput);

    modal.addComponents(quantityRow, linkRow, privateRow);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Error en handleWeaponSelectForGroup:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudieron añadir las armas al grupo.');
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}

/**
 * Maneja el modal de configuración de arma individual
 */
async function handleWeaponConfigModal(interaction) {
  try {
    const sessionId = interaction.customId.replace('weapon_config_modal_', '');
    console.log('[DEBUG] handleWeaponConfigModal - sessionId:', sessionId);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const session = validSession.session;
    const tempData = session.tempWeaponData;

    if (!tempData) {
      return await interaction.reply({
        content: 'No se encontraron los datos temporales del arma.',
        ephemeral: true
      });
    }

    // Obtener valores del modal
    const quantity = parseInt(interaction.fields.getTextInputValue('quantity')) || 1;
    const link = interaction.fields.getTextInputValue('link') || '';
    const privateValue = interaction.fields.getTextInputValue('private').toLowerCase();
    const isPrivate = privateValue === 'sí' || privateValue === 'si' || privateValue === 'yes' || privateValue === 'y';

    // Validar cantidad
    if (quantity < 1 || quantity > 99) {
      return await interaction.reply({
        content: 'La cantidad debe ser un número entre 1 y 99.',
        ephemeral: true
      });
    }

    const weaponGroup = session.data.weapons[tempData.groupIndex];

    // Buscar o crear la categoría en el grupo
    let targetCategory = weaponGroup.categories.find(cat => cat.name === tempData.categoryName);
    if (!targetCategory) {
      targetCategory = {
        name: tempData.categoryName,
        weapons: []
      };
      weaponGroup.categories.push(targetCategory);
    }

    // Verificar si el arma ya existe
    const existingWeapon = targetCategory.weapons.find(w => w.name === tempData.weapon.name);
    if (existingWeapon) {
      return await interaction.reply({
        content: `El arma "${tempData.weapon.name}" ya existe en este grupo. Usa la función de editar para modificarla.`,
        ephemeral: true
      });
    }

    // Añadir el arma con la configuración
    targetCategory.weapons.push({
      name: tempData.weapon.name,
      code: tempData.weapon.code || '',
      quantity: quantity,
      link: link,
      private: isPrivate
    });

    // Limpiar datos temporales
    delete session.tempWeaponData;
    session.hasChanges = true;

    // Mostrar confirmación y volver al editor
    const embed = new EmbedBuilder()
      .setTitle('✅ Arma Añadida')
      .setDescription(`**${tempData.weapon.name}** ha sido añadida al grupo **${session.data.weapons[tempData.groupIndex]?.name || session.data.weapons[tempData.groupIndex]?.displayName || `Grupo ${tempData.groupIndex + 1}`}**:\n\n` +
        `• **Cantidad:** ${quantity}\n` +
        `• **Enlace:** ${link || 'Ninguno'}\n` +
        `• **Privado:** ${isPrivate ? 'Sí' : 'No'}`)
      .setColor('#00FF00');

    const backButton = new ButtonBuilder()
      .setCustomId(`group_edit_finish_${sessionId}`)
      .setLabel('Volver al Editor')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('◀️');

    const addMoreButton = new ButtonBuilder()
      .setCustomId(`group_add_weapon_${sessionId}_${tempData.groupIndex}`)
      .setLabel('Añadir Más Armas')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('➕');

    const row = new ActionRowBuilder().addComponents(backButton, addMoreButton);

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

  } catch (error) {
    console.error('Error en handleWeaponConfigModal:', error);
    await interaction.reply({
      content: 'Ocurrió un error al procesar la configuración del arma.',
      ephemeral: true
    });
  }
}

// Manejar eliminación de armas específicas de grupos
async function handleRemoveWeaponsSelect(interaction) {
  try {
    const customIdParts = interaction.customId.replace('remove_weapons_select_', '').split('_');
    const groupIndex = parseInt(customIdParts.pop());
    const sessionId = customIdParts.join('_');
    const selectedPositions = interaction.values; // Array de "catIndex_weaponIndex"

    console.log('[DEBUG] handleRemoveWeaponsSelect - sessionId:', sessionId, 'groupIndex:', groupIndex, 'selections:', selectedPositions);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const session = validSession.session;
    if (!session.data.weapons || !session.data.weapons[groupIndex]) {
      return await interaction.reply({
        content: 'No se encontró el grupo de armas especificado.',
        ephemeral: true
      });
    }

    const weaponGroup = session.data.weapons[groupIndex];
    const weaponsToRemove = [];

    // Recopilar información de las armas a eliminar
    selectedPositions.forEach(position => {
      const [catIndex, weaponIndex] = position.split('_').map(i => parseInt(i));
      if (weaponGroup.categories[catIndex] && weaponGroup.categories[catIndex].weapons[weaponIndex]) {
        const weapon = weaponGroup.categories[catIndex].weapons[weaponIndex];
        const category = weaponGroup.categories[catIndex];
        weaponsToRemove.push({
          weapon,
          category: category.name,
          catIndex,
          weaponIndex
        });
      }
    });

    if (!weaponsToRemove.length) {
      return await interaction.reply({
        content: 'No se pudieron encontrar las armas seleccionadas.',
        ephemeral: true
      });
    }

    // Eliminar las armas (en orden inverso para mantener índices válidos)
    const sortedRemovals = weaponsToRemove.sort((a, b) => {
      if (a.catIndex !== b.catIndex) return b.catIndex - a.catIndex;
      return b.weaponIndex - a.weaponIndex;
    });

    let removedCount = 0;
    sortedRemovals.forEach(({ catIndex, weaponIndex }) => {
      if (weaponGroup.categories[catIndex] && weaponGroup.categories[catIndex].weapons[weaponIndex]) {
        weaponGroup.categories[catIndex].weapons.splice(weaponIndex, 1);
        removedCount++;
      }
    });

    // Limpiar categorías vacías
    weaponGroup.categories = weaponGroup.categories.filter(cat => cat.weapons && cat.weapons.length > 0);

    // Marcar que hay cambios para poder guardar
    session.hasChanges = true;

    // Mostrar confirmación
    const embed = new EmbedBuilder()
      .setTitle('✅ Armas Eliminadas')
      .setDescription(`Se eliminaron ${removedCount} armas del grupo **${session.data.weapons[groupIndex]?.name || session.data.weapons[groupIndex]?.displayName || `Grupo ${groupIndex + 1}`}**:\n\n${weaponsToRemove.map(w => `• ${w.weapon.name} (${w.category})`).join('\n')}`)
      .setColor('#FF4444');

    const backButton = new ButtonBuilder()
      .setCustomId(`group_edit_finish_${sessionId}`)
      .setLabel('Volver al Editor')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('◀️');

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.update({ embeds: [embed], components: [row] });

  } catch (error) {
    console.error('Error en handleRemoveWeaponsSelect:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudieron eliminar las armas del grupo.');
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}

// Manejar selección directa de armas para grupos (sin categorías intermedias)
async function handleDirectWeaponSelect(interaction) {
  try {
    const customIdParts = interaction.customId.replace('direct_weapon_select_', '').split('_');
    const groupIndex = parseInt(customIdParts.pop());
    const sessionId = customIdParts.join('_');
    const selectedWeaponData = interaction.values[0]; // Solo un elemento ahora

    console.log('[DEBUG] handleDirectWeaponSelect - sessionId:', sessionId, 'groupIndex:', groupIndex, 'weapon:', selectedWeaponData);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const session = validSession.session;
    if (!session.data.weapons || !session.data.weapons[groupIndex]) {
      return await interaction.reply({
        content: 'No se encontró el grupo de armas que se está editando.',
        ephemeral: true
      });
    }

    // Parsear la selección: "categoryId_weaponName"
    const [categoryId, weaponName] = selectedWeaponData.split('_');

    // Buscar el arma usando el mismo sistema de fallback que las otras funciones
    let selectedWeapon = null;
    let categoryName = null;

    // Si categoryId es un ObjectId válido, buscar en UserCategory
    if (categoryId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        const UserCategory = require('../../database/models/UserCategory');
        const category = await UserCategory.findOne({
          _id: categoryId,
          userId: interaction.user.id
        });

        if (category && category.weapons?.length) {
          const weapon = category.weapons.find(w => w.name === weaponName);
          if (weapon) {
            selectedWeapon = weapon;
            categoryName = category.displayName;
          }
        }
      } catch (error) {
        console.error('[DEBUG] Error cargando desde UserCategory:', error);
      }
    }

    // Fallback: Buscar en Weapon model
    if (!selectedWeapon) {
      try {
        const Weapon = require('../../database/models/Weapon');
        const weapon = await Weapon.findOne({
          name: weaponName,
          isActive: true
        });

        if (weapon) {
          selectedWeapon = {
            name: weapon.name,
            code: weapon.code || weapon.name,
            emojiId: weapon.emojiId || '⚔️'
          };
          categoryName = weapon.categoryDisplayName || weapon.category;
        }
      } catch (error) {
        console.error('[DEBUG] Error cargando desde Weapon model:', error);
      }
    }

    // Fallback final: weapons.json
    if (!selectedWeapon) {
      try {
        const fs = require('fs');
        const path = require('path');
        const weaponsPath = path.join(__dirname, '../../weapons/weapons.json');

        if (fs.existsSync(weaponsPath)) {
          const weaponsData = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));

          for (const [catName, weapons] of Object.entries(weaponsData)) {
            const weapon = weapons.find(w => w.name === weaponName);
            if (weapon) {
              selectedWeapon = weapon;
              categoryName = catName;
              break;
            }
          }
        }
      } catch (error) {
        console.error('[DEBUG] Error cargando desde weapons.json:', error);
      }
    }

    if (!selectedWeapon) {
      return await interaction.reply({
        content: 'No se encontró el arma seleccionada.',
        ephemeral: true
      });
    }

    // Guardar información temporal del arma seleccionada para el modal
    session.tempWeaponData = {
      weapon: selectedWeapon,
      categoryName: categoryName,
      groupIndex: groupIndex
    };

    // Marcar que hubo cambios
    session.hasChanges = true;

    // Mostrar modal para configurar el arma (reutilizamos el mismo modal)
    const modal = new ModalBuilder()
      .setCustomId(`weapon_config_modal_${sessionId}`)
      .setTitle(`Configurar: ${selectedWeapon.name}`);

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel('Cantidad')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ej: 1')
      .setValue('1')
      .setRequired(true);

    const linkInput = new TextInputBuilder()
      .setCustomId('link')
      .setLabel('Enlace (opcional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://ejemplo.com')
      .setRequired(false);

    const privateInput = new TextInputBuilder()
      .setCustomId('private')
      .setLabel('Enviar al privado? (sí/no)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('no')
      .setValue('no')
      .setRequired(false);

    const quantityRow = new ActionRowBuilder().addComponents(quantityInput);
    const linkRow = new ActionRowBuilder().addComponents(linkInput);
    const privateRow = new ActionRowBuilder().addComponents(privateInput);

    modal.addComponents(quantityRow, linkRow, privateRow);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Error en handleDirectWeaponSelect:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudieron añadir las armas al grupo.');
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}

// Exportar las sesiones y funciones para compatibilidad
module.exports.templateEditSessions = templateEditSessions;
module.exports.handleGroupButton = handleGroupButton;
module.exports.showWeaponCategorySelectionForEdit = showWeaponCategorySelectionForEdit;
module.exports.handleCategorySelectForGroup = handleCategorySelectForGroup;
module.exports.handleWeaponSelectForGroup = handleWeaponSelectForGroup;
module.exports.handleWeaponConfigModal = handleWeaponConfigModal;
module.exports.handleRemoveWeaponsSelect = handleRemoveWeaponsSelect;
module.exports.handleDirectWeaponSelect = handleDirectWeaponSelect;
module.exports.showWeaponSelectionForGroupEmoji = showWeaponSelectionForGroupEmoji;
module.exports.handleGroupEmojiSelect = handleGroupEmojiSelect;
