const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getTemplatesByServer, getTemplateByName, updateTemplate, createTemplate, deleteTemplate, getTemplateNames } = require('../../services/templateService');
const { isServerPremium, getOrCreateServer } = require('../../services/serverService');
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, createPremiumEmbed, safeReply } = require('../../utils/errorEmbeds');

// Store temporal para manejar el estado del proceso de edición
const templateEditSessions = new Map();

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

  // Manejar envío del modal completo
  async handleAllEditSubmit(interaction, sessionId) {
    try {
      const session = templateEditSessions.get(sessionId);
      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
      const image = interaction.fields.getTextInputValue('image');
      const time = interaction.fields.getTextInputValue('time');
      const color = interaction.fields.getTextInputValue('color');

      // Validar color hex
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        return await interaction.reply({ content: 'Color inválido. Usa formato hex como #FF5733', ephemeral: true });
      }

      // Validar URL de imagen si se proporciona
      if (image && !isValidUrl(image)) {
        return await interaction.reply({ content: 'URL de imagen inválida.', ephemeral: true });
      }

      // Actualizar datos de la sesión
      session.data.title = title;
      session.data.description = description;
      session.data.image = image || null;
      session.data.time = time;
      session.data.color = color;

      const successEmbed = createSuccessEmbed("Actualizado", "Información del template actualizada correctamente.");
      await interaction.reply({ embeds: [successEmbed], ephemeral: true });

      // Mostrar vista general actualizada después de un breve delay
      setTimeout(async () => {
        await this.showEditOverview(interaction, sessionId);
      }, 1500);

    } catch (error) {
      console.error('[ERROR] Error en handleAllEditSubmit:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al actualizar la información del template.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
        `**${index + 1}.** ${template.title} - *${template.time}*`
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

    // Mostrar el modal de información básica
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

    const timeInput = new TextInputBuilder()
      .setCustomId('template_time')
      .setLabel('Duración (máximo 1h o 60m)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('60m')
      .setRequired(true);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('template_description')
      .setLabel('Descripción')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Descripción del evento...')
      .setRequired(true)
      .setMaxLength(1000);

    const colorInput = new TextInputBuilder()
      .setCustomId('template_color')
      .setLabel('Color (código hex, ej: #FF0000)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('#00FFFF')
      .setValue('#00FFFF')
      .setRequired(true);

    const imageInput = new TextInputBuilder()
      .setCustomId('template_image')
      .setLabel('URL de la imagen')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://ejemplo.com/imagen.png')
      .setValue('https://media.discordapp.net/attachments/1289065983071223864/1419911950954926201/hNAKGAl.jpeg?ex=68d61e8d&is=68d4cd0d&hm=e68da2ac32a28aa08f3797b7560657a78c0b438bb419be74492bb62703f48b91&=&format=webp&width=1230&height=694')
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
    const secondActionRow = new ActionRowBuilder().addComponents(timeInput);
    const thirdActionRow = new ActionRowBuilder().addComponents(descriptionInput);
    const fourthActionRow = new ActionRowBuilder().addComponents(colorInput);
    const fifthActionRow = new ActionRowBuilder().addComponents(imageInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow, fifthActionRow);
    await interaction.showModal(modal);
  },

  // Modal completo para editar todos los campos principales
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
        data: {
          title: template.title,
          time: template.time,
          description: template.description,
          color: template.color,
          image: template.image,
          url: template.url || '',
          roles: template.roles || [],
          weapons: Array.isArray(template.weapons) ? template.weapons :
            template.weapons ? Object.values(template.weapons).map(weaponGroup => ({
              categories: weaponGroup.data ? [{
                name: weaponGroup.category || 'General',
                weapons: weaponGroup.data
              }] : []
            })) : [],
          notifyAll: template.notifyAll,
          reminder: template.reminder || '5m'
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

      const embed = new EmbedBuilder()
        .setTitle('📝 Editor de Templates')
        .setDescription(`**${template.title}**\n\n¿Qué deseas editar?`)
        .setColor(parseInt(template.color.replace('#', ''), 16))
        .addFields([
          {
            name: '📋 Información Básica',
            value: `Título: \`${template.title}\`\nTiempo: \`${template.time}\`\nColor: \`${template.color}\``,
            inline: true
          },
          {
            name: '⚙️ Configuración',
            value: `Recordatorio: \`${template.reminder || '5m'}\`\nNotificar todos: \`${template.notifyAll ? 'Sí' : 'No'}\``,
            inline: true
          },
          {
            name: '🎭 Roles a Notificar',
            value: template.roles && template.roles.length > 0
              ? template.roles.map(roleId => `<@&${roleId}>`).join(', ')
              : 'Sin roles a notificar',
            inline: true
          },
          {
            name: '⚔️ Grupos de Armas',
            value: template.weapons && template.weapons.length > 0
              ? template.weapons.map((weaponGroup, index) => {
                const totalWeapons = weaponGroup.categories.reduce((total, cat) => total + (cat.weapons?.length || 0), 0);
                const categoryNames = weaponGroup.categories.map(cat => cat.name).join(', ');
                return `• **Grupo ${index + 1}** (${totalWeapons} armas) - ${categoryNames}`;
              }).join('\n')
              : 'Sin grupos configurados',
            inline: false
          }
        ]);

      if (template.image) {
        embed.setThumbnail(template.image);
      }

      // Botón único para todas las opciones de edición
      const singleEditRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`template_edit_all_${sessionId}`)
            .setLabel('✏️ Editar Template')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️')
        );

      await interaction.reply({
        embeds: [embed],
        components: [singleEditRow],
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
        "⚠️ Confirmar Eliminación de Template",
        `¿Estás seguro de que quieres eliminar el template **"${template.title}"**?\n\n⚠️ **Esta acción no se puede deshacer**`,
        [
          {
            name: "📋 Información del Template",
            value: [
              `**📝 Título:** ${template.title}`,
              `**⏰ Duración:** ${template.time}`,
              `**📄 Descripción:** ${template.description.length > 80 ? template.description.substring(0, 80) + '...' : template.description}`,
              `**👥 Roles configurados:** ${template.roles?.length || 0}`,
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
        time: originalTemplate.time,
        description: originalTemplate.description,
        color: originalTemplate.color,
        image: originalTemplate.image,
        url: originalTemplate.url || '',
        roles: originalTemplate.roles || [],
        weapons: originalTemplate.weapons || {},
        notifyAll: originalTemplate.notifyAll,
        reminder: originalTemplate.reminder || '5m'
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
              `**Duración:** ${newTemplateData.time}`,
              `**Roles:** ${newTemplateData.roles.length} configurados`,
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
        await this.handleEditModalSubmit(interaction);
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
          const sessionId = interaction.customId.replace('template_edit_weapon_group_select_', '');
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

      // Manejar selects de sesiones temporales de grupo (group_remove_weapons_, etc.)
      if (interaction.customId.startsWith('group_remove_weapons_')) {
        const tempSessionId = interaction.customId.replace('group_remove_weapons_', '');
        await this.handleRemoveWeaponsFromGroup(interaction, tempSessionId);
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
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Error al procesar el menú.', ephemeral: true });
      }
    }
  },

  // =============== CREATE HANDLERS ===============
  async handleBasicInfoModal(interaction) {
    try {
      // Extraer datos del modal
      const title = interaction.fields.getTextInputValue('template_title');
      const time = interaction.fields.getTextInputValue('template_time');
      const description = interaction.fields.getTextInputValue('template_description');
      const color = interaction.fields.getTextInputValue('template_color');
      const image = interaction.fields.getTextInputValue('template_image');

      // Crear sesión usando el sistema existente
      const { createSession } = require('../../lib/template/template-sessions');
      // Simplificamos el sessionId para usar solo el timestamp - más fácil de extraer consistentemente
      // Usamos un formato simple de solo timestamp para evitar problemas con la extracción
      const sessionId = `${Date.now()}`;
      console.log('🔄 Creando nueva sesión con id:', sessionId);
      console.log('[DEBUG] El tipo de sessionId es:', typeof sessionId);
      createSession(sessionId, {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        step: 'additional_config',
        data: {
          title,
          time,
          description,
          color,
          image,
          reminder: '5m',
          roles: [],
          weapons: {},
          notifyAll: false
        }
      });

      // Mostrar interfaz intermedia con botón para continuar al siguiente paso
      const embed = createSuccessEmbed(
        "Información Básica Guardada",
        "Los datos básicos del template han sido guardados correctamente.",
        [
          {
            name: "📋 Datos Guardados",
            value: `**Título:** ${title}\n**Tiempo:** ${time}\n**Color:** ${color}`,
            inline: false
          },
          {
            name: "📋 Siguiente Paso",
            value: "Configura las opciones adicionales del template",
            inline: false
          }
        ]
      );

      const continueButton = new ButtonBuilder()
        .setCustomId(`template_continue_config_${sessionId}`)
        .setLabel('Continuar Configuración')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️');

      console.log('🔄 Creando botón con customId:', `template_continue_config_${sessionId}`);

      const actionRow = new ActionRowBuilder().addComponents(continueButton);

      await interaction.reply({
        embeds: [embed],
        components: [actionRow],
        ephemeral: true
      });

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

        // IMPORTANTE: Primero manejar el botón específico de continuar config
        if (interaction.customId.includes('template_continue_config_')) {
          // Mostrar modal de configuración adicional
          console.log('🔄 [DEBUG] Detectado template_continue_config_, llamando a handleContinueConfigButton');
          await this.handleContinueConfigButton(interaction);
        } else if (interaction.customId.includes('_roles_')) {
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
        } else if (interaction.customId.includes('finish_group')) {
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

  async handleContinueConfigButton(interaction) {
    try {
      console.log('🔄 handleContinueConfigButton iniciando con customId:', interaction.customId);

      // Usar la función extractSessionId para mantener consistencia
      const { extractSessionId } = require('../../lib/template/template-create-navigation');
      const sessionId = extractSessionId(interaction.customId);
      console.log('🔄 SessionId extraído con extractSessionId:', sessionId);

      // Verificar si la sesión existe usando el sistema original
      const { getSession } = require('../../lib/template/template-sessions');
      const session = getSession(sessionId);

      if (!session) {
        console.error('❌ Sesión no encontrada para sessionId:', sessionId);
        console.log('🔍 Sesiones disponibles:', Array.from(require('../../lib/template/template-sessions').getTemplateCreationSessions().keys()));
        const errorEmbed = createErrorEmbed(
          "Sesión Expirada",
          "La sesión ha expirado. Por favor, inicia el proceso nuevamente con `/template create`."
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      console.log('✅ Sesión válida encontrada');

      // Crear el modal directamente aquí para evitar problemas de importación
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

      const modal = new ModalBuilder()
        .setCustomId(`template_additional_config_${sessionId}`)
        .setTitle('Template - Configuración Adicional');

      const data = session.data || {};

      // No incluimos el campo de imagen ya que se obtuvo del primer modal
      // La imagen ya está almacenada en session.data.image

      const reminderInput = new TextInputBuilder()
        .setCustomId('reminder')
        .setLabel('Tiempo de recordatorio')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(20)
        .setPlaceholder('5m, 10m, 15m, 30m')
        .setValue(data.reminder || '5m');

      const notifyAllInput = new TextInputBuilder()
        .setCustomId('notifyAll')
        .setLabel('Notificar a todos?')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(5)
        .setPlaceholder('true o false')
        .setValue(data.notifyAll ? 'true' : 'false');

      modal.addComponents(
        new ActionRowBuilder().addComponents(reminderInput),
        new ActionRowBuilder().addComponents(notifyAllInput)
      );

      console.log('🔄 Mostrando modal de paso 2...');
      await interaction.showModal(modal);
      console.log('✅ Modal de paso 2 mostrado exitosamente');

    } catch (error) {
      console.error('[ERROR] Error en handleContinueConfigButton:', error); const errorEmbed = createErrorEmbed(
        "Error al Continuar",
        "Ocurrió un error al mostrar la configuración adicional."
      );

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  async handleAdditionalConfigModal(interaction) {
    try {
      // Usar la función extractSessionId para mantener consistencia
      const { extractSessionId } = require('../../lib/template/template-create-navigation');
      const sessionId = extractSessionId(interaction.customId);
      console.log('🔄 Procesando modal adicional para sesión:', sessionId);

      // Verificar si la sesión existe usando el sistema original
      const { getSession } = require('../../lib/template/template-sessions');
      const session = getSession(sessionId);

      if (!session) {
        console.error('❌ Sesión no encontrada para sessionId:', sessionId);
        console.log('🔍 Sesiones disponibles:', Array.from(require('../../lib/template/template-sessions').getTemplateCreationSessions().keys()));
        const errorEmbed = createErrorEmbed(
          "Sesión Expirada",
          "La sesión ha expirado. Inicia el proceso nuevamente con `/template create`."
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      // Extraer datos del modal (ahora sin el campo image)
      const reminder = interaction.fields.getTextInputValue('reminder') || '5m';
      const notifyAllValue = interaction.fields.getTextInputValue('notifyAll') || 'false';
      const notifyAll = notifyAllValue.toLowerCase() === 'true';

      // Actualizar sesión con nuevos datos (imagen ya está guardada del primer modal)
      session.data.reminder = reminder;
      session.data.notifyAll = notifyAll;

      console.log('✅ Datos adicionales guardados:', { reminder, notifyAll, image: session.data.image });

      try {
        // Continuar al siguiente paso (selección de roles)
        const { showRoleSelection } = require('../../lib/template/template-create-handlers');
        console.log('🔄 Transicionando a selección de roles para la sesión:', sessionId);
        await showRoleSelection(interaction, sessionId);
        console.log('✅ Transición exitosa a selección de roles');
      } catch (transitionError) {
        console.error('❌ Error al transicionar a selección de roles:', transitionError);
        // Si ocurre un error y aún no se ha respondido a la interacción, mostrar mensaje de error
        if (!interaction.replied && !interaction.deferred) {
          const errorEmbed = createErrorEmbed(
            "Error al Continuar",
            "Ocurrió un error al avanzar al siguiente paso. Por favor, inicia el proceso nuevamente con `/template create`."
          );
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      }

    } catch (error) {
      console.error('[ERROR] Error en handleAdditionalConfigModal:', error);
      const errorEmbed = createErrorEmbed(
        "Error al Procesar",
        "Ocurrió un error al procesar la configuración adicional."
      );
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
          "✅ Template Eliminado Exitosamente",
          `El template **"${deletedTemplate.title}"** ha sido eliminado correctamente del servidor.`,
          [
            {
              name: "📋 Template Eliminado",
              value: [
                `**📝 Título:** ${deletedTemplate.title}`,
                `**⏰ Duración:** ${deletedTemplate.time}`,
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

  // Modal para editar información básica (título, tiempo, color)
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
      .setValue(template.title)
      .setRequired(true)
      .setMaxLength(100);

    const timeInput = new TextInputBuilder()
      .setCustomId('time')
      .setLabel('Duración (ej: 30m, 1h, 2h30m)')
      .setStyle(TextInputStyle.Short)
      .setValue(template.time)
      .setRequired(true)
      .setMaxLength(20);

    const colorInput = new TextInputBuilder()
      .setCustomId('color')
      .setLabel('Color (hex ej: #FF5733)')
      .setStyle(TextInputStyle.Short)
      .setValue(template.color)
      .setRequired(true)
      .setMaxLength(7);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(timeInput),
      new ActionRowBuilder().addComponents(colorInput)
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
      .setValue(template.description)
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
      .setLabel('Notificar a Todos (true/false)')
      .setStyle(TextInputStyle.Short)
      .setValue(template.notifyAll ? 'true' : 'false')
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
        case 'all':
          await this.handleAllEditSubmit(interaction, sessionId);
          break;
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
      const errorEmbed = createErrorEmbed("Error", "Error al procesar el modal de edición.");
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Procesar edición de información básica
  async handleBasicEditSubmit(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);

    const title = interaction.fields.getTextInputValue('title');
    const time = interaction.fields.getTextInputValue('time');
    const color = interaction.fields.getTextInputValue('color');

    // Validar color hex
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return await interaction.reply({
        content: 'Color inválido. Debe ser un código hex válido (ej: #FF5733).',
        ephemeral: true
      });
    }

    // Actualizar datos de la sesión
    session.data.title = title;
    session.data.time = time;
    session.data.color = color;
    session.hasChanges = true;

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Información Básica Actualizada')
      .setDescription([
        `**Título:** ${title}`,
        `**Tiempo:** ${time}`,
        `**Color:** ${color}`
      ].join('\n'))
      .setColor(parseInt(color.replace('#', ''), 16));

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
      .setColor(parseInt(session.data.color.replace('#', ''), 16));

    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  },

  // Procesar edición de configuración
  async handleConfigEditSubmit(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);

    const reminder = interaction.fields.getTextInputValue('reminder');
    const notifyAllStr = interaction.fields.getTextInputValue('notifyAll').toLowerCase();

    const notifyAll = notifyAllStr === 'true' || notifyAllStr === 'sí' || notifyAllStr === 'si';

    session.data.reminder = reminder || '5m';
    session.data.notifyAll = notifyAll;
    session.hasChanges = true;

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Configuración Actualizada')
      .setDescription([
        `**Recordatorio:** ${session.data.reminder}`,
        `**Notificar a Todos:** ${notifyAll ? 'Sí' : 'No'}`
      ].join('\n'))
      .setColor(parseInt(session.data.color.replace('#', ''), 16));

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
      .setColor(parseInt(session.data.color.replace('#', ''), 16));

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
        const editorWeapons = (weaponConfig?.data || []).map(w => ({
          id: w.id,
          name: w.name,
          quantity: w.units,
          image: w.image || '',
          emoji: w.emoji,
          url: w.url || '',
          sendBuildToPrivate: !!w.sendBuildToPrivate
        }));

        // Intentar preservar nombres de categorías existentes si están disponibles
        let categoryName = 'General';
        if (existingGroup && Array.isArray(existingGroup.categories) && existingGroup.categories.length > 0) {
          // Usar el primer nombre de categoría existente
          categoryName = existingGroup.categories[0].name || 'General';
        }

        return {
          categories: [
            {
              name: categoryName,
              weapons: editorWeapons
            }
          ]
        };
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

      console.log(`[DEBUG] Datos sincronizados exitosamente desde creación a edición para sesión ${sessionId}`);
      return true;
    } catch (error) {
      console.error('[ERROR] Error al sincronizar datos desde creación a edición:', error);
      return false;
    }
  },

  // Mostrar editor de roles con multi-select directo
  async showEditRoles(interaction, sessionId) {
    try {
      const session = getValidSession(sessionId, interaction);

      if (!session) {
        return await interaction.reply({
          content: 'Sesión de edición expirada o inválida. Reinicia la edición del template.',
          ephemeral: true
        });
      }

      const template = session.data;

      const titleText = template.notifyAll ? 'Roles a Notificar' : 'Roles de Ping';
      const descriptionText = template.notifyAll
        ? 'Selecciona los roles que serán notificados cuando se cree un raid'
        : 'Selecciona los roles que serán etiquetados cuando se cree un raid';

      const embed = new EmbedBuilder()
        .setTitle(`🎭 ${titleText}`)
        .setDescription(descriptionText)
        .setColor(parseInt(template.color.replace('#', ''), 16))
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

      const embed = new EmbedBuilder()
        .setTitle('⚔️ Editor de Grupos de Armas')
        .setDescription('Gestiona los grupos de armas de tu template')
        .setColor(parseInt(template.color.replace('#', ''), 16));

      // Mostrar grupos existentes
      if (template.weapons && template.weapons.length > 0) {
        const weaponsList = template.weapons.map((weaponGroup, index) => {
          const categoryNames = weaponGroup.categories.map(cat => cat.name).join(', ');
          const totalWeapons = weaponGroup.categories.reduce((total, cat) => total + (cat.weapons?.length || 0), 0);

          return `**Grupo ${index + 1}**\n• ${totalWeapons} armas configuradas\n• Categorías: ${categoryNames}`;
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

          return {
            label: `Grupo ${index + 1}`,
            value: index.toString(),
            description: `${totalWeapons} armas - ${categoryNames.length > 50 ? categoryNames.substring(0, 47) + '...' : categoryNames}`,
            emoji: '⚔️'
          };
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
              .setLabel('➕ Añadir Nuevo Grupo')
              .setStyle(ButtonStyle.Success)
              .setEmoji('➕'),
            new ButtonBuilder()
              .setCustomId(`template_edit_weapons_delete_${sessionId}`)
              .setLabel('🗑️ Eliminar Grupo')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️'),
            new ButtonBuilder()
              .setCustomId(`template_edit_back_${sessionId}`)
              .setLabel('⬅️ Volver al Editor')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⬅️')
          );

        if (interaction.deferred) {
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
              .setLabel('➕ Añadir Primer Grupo')
              .setStyle(ButtonStyle.Success)
              .setEmoji('➕'),
            new ButtonBuilder()
              .setCustomId(`template_edit_back_${sessionId}`)
              .setLabel('⬅️ Volver al Editor')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⬅️')
          );

        if (interaction.deferred) {
          await interaction.editReply({ embeds: [embed], components: [buttonRow] });
        } else {
          await interaction.reply({ embeds: [embed], components: [buttonRow], ephemeral: true });
        }
      }

    } catch (error) {
      console.error('[ERROR] Error en showEditWeapons:', error);
      const errorEmbed = createErrorEmbed("Error", "Error al mostrar la selección de armas.");
      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else if (!interaction.replied) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  // Manejar selección de grupo de armas para editar
  async handleEditWeaponGroupSelect(interaction, sessionId) {
    try {
      const groupIndex = parseInt(interaction.values[0]);
      const session = templateEditSessions.get(sessionId);
      if (!session) {
        const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado. Por favor, inicia el comando nuevamente.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }

      const weaponGroup = session.data.weapons[groupIndex];
      if (!weaponGroup) {
        const errorEmbed = createErrorEmbed('Grupo no encontrado', 'El grupo de armas seleccionado no existe.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }

      console.log('[DEBUG] handleEditWeaponGroupSelect: weaponGroup structure:', JSON.stringify(weaponGroup, null, 2));

      // Crear una sesión temporal de creación con un ID más corto
      const shortId = Date.now().toString(36);
      const tempSessionId = `edit_${groupIndex}_${shortId}`;
      const { getTemplateCreationSessions } = require('../../lib/template/template-sessions');
      const templateCreationSessions = getTemplateCreationSessions();

      // Normalizar armas existentes a la forma esperada por los handlers de creación
      const normalizedWeapons = [];
      weaponGroup.categories.forEach(category => {
        (category.weapons || []).forEach(w => {
          normalizedWeapons.push({
            name: w.name,
            emojiId: w.emoji || w.emojiId || '⚔️',
            image: w.image || '',
            url: w.url || '',
            quantity: w.quantity || w.units || 1,
            sendBuildToPrivate: !!w.sendBuildToPrivate
          });
        });
      });

      // Sembrar tempGroupConfig y currentGroup para que Add/Remove funcionen sin romper
      templateCreationSessions.set(tempSessionId, {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        step: 'category_selection',
        data: { weapons: {} },
        tempGroupConfig: {
          displayName: `Grupo ${groupIndex + 1}`,
          weaponKey: `group_${groupIndex + 1}`,
          defaultEmoji: '⚔️',
          buildUrl: '',
          weapons: normalizedWeapons
        },
        currentGroup: {
          categories: weaponGroup.categories.map(cat => ({
            name: cat.name,
            weapons: (cat.weapons || []).map(w => ({
              name: w.name,
              emojiId: w.emoji || w.emojiId || '⚔️',
              image: w.image || '',
              url: w.url || '',
              quantity: w.quantity || w.units || 1,
              sendBuildToPrivate: !!w.sendBuildToPrivate
            }))
          }))
        },
        originalSessionId: sessionId,
        editingGroupIndex: groupIndex,
        editingExistingGroup: true
      });

      console.log('[DEBUG] handleEditWeaponGroupSelect: Sesión temporal creada:', tempSessionId);
      console.log('[DEBUG] handleEditWeaponGroupSelect: Datos de sesión:', templateCreationSessions.get(tempSessionId));

      // Mostrar la vista de edición del grupo existente
      await this.showGroupEditInterface(interaction, tempSessionId, weaponGroup, groupIndex);

    } catch (error) {
      console.error('Error al manejar selección de grupo de armas:', error);
      const errorEmbed = createErrorEmbed('Error', 'Hubo un error al procesar la selección del grupo de armas.');
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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

      // Crear una sesión temporal de creación usando el sistema funcional
      const shortId = Date.now().toString(36);
      const tempSessionId = `new_${shortId}`;
      const { getTemplateCreationSessions } = require('../../lib/template/template-sessions');
      const templateCreationSessions = getTemplateCreationSessions();

      // Crear sesión temporal con la estructura correcta del sistema funcional
      templateCreationSessions.set(tempSessionId, {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        step: 'weapon_categories',
        data: { 
          weapons: {},
          title: session.data.title,
          description: session.data.description
        },
        originalSessionId: sessionId,
        isNewGroup: true,
        editingExistingGroup: false
      });

      console.log('[DEBUG] handleAddNewWeaponGroup: Sesión temporal creada:', tempSessionId);

      // Usar el sistema funcional de selección de categorías de armas
      await interaction.deferUpdate();
      const { showWeaponCategorySelection } = require('../../lib/template/template-create-handlers');
      await showWeaponCategorySelection(interaction, tempSessionId);

    } catch (error) {
      console.error('Error al añadir nuevo grupo de armas:', error);
      const errorEmbed = createErrorEmbed('Error', 'Error al procesar la acción de edición.');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.editReply({ embeds: [errorEmbed] });
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
        const groupName = group.categories.map(cat => cat.name).join(', ');
        selectMenu.addOptions({
          label: `Grupo ${index + 1}`,
          description: groupName.length > 100 ? groupName.substring(0, 97) + '...' : groupName,
          value: index.toString()
        });
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

      // Actualizar la sesión
      templateEditSessions.set(sessionId, session);

      // Mostrar confirmación y volver a la vista de armas
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Grupo Eliminado')
        .setDescription(`El grupo **"${groupName}"** ha sido eliminado correctamente.`)
        .setColor(0x57f287);

      await interaction.reply({ embeds: [successEmbed], ephemeral: true });

      // Volver a mostrar la vista de armas después de un breve delay
      setTimeout(async () => {
        await this.showEditWeapons(interaction, sessionId);
      }, 1500);

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

      const { getTemplateCreationSessions } = require('../../lib/template/template-sessions');
      const templateCreationSessions = getTemplateCreationSessions();

      // Parsing más específico del customId
      if (customId.includes('group_edit_add_weapons_')) {
        const tempSessionId = customId.replace('group_edit_add_weapons_', '');
        const session = templateCreationSessions.get(tempSessionId);
        if (!session) {
          return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
        }

        // Añadir más armas al grupo
        const { showWeaponCategorySelection } = require('../../lib/template/template-create-handlers');
        await showWeaponCategorySelection(interaction, tempSessionId);

      } else if (customId.includes('group_edit_remove_weapons_')) {
        const tempSessionId = customId.replace('group_edit_remove_weapons_', '');
        const session = templateCreationSessions.get(tempSessionId);
        if (!session) {
          return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
        }

        // Mostrar interfaz para quitar armas
        await this.showRemoveWeaponsInterface(interaction, tempSessionId, session);

      } else if (customId.includes('group_edit_finish_')) {
        // Guardar cambios y volver al editor
        const { handleFinishGroup } = require('../../lib/template/template-create-handlers');
        await handleFinishGroup(interaction);

      } else if (customId.includes('group_edit_back_to_edit_')) {
        const tempSessionId = customId.replace('group_edit_back_to_edit_', '');
        const session = templateCreationSessions.get(tempSessionId);
        if (!session) {
          return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
        }

        // Volver a la interfaz de edición del grupo
        const weaponGroup = {
          categories: session.currentGroup?.categories || []
        };
        await this.showGroupEditInterface(interaction, tempSessionId, weaponGroup, session.editingGroupIndex || 0);

      } else if (customId.includes('group_edit_back_')) {
        const tempSessionId = customId.replace('group_edit_back_', '');
        const session = templateCreationSessions.get(tempSessionId);
        if (!session) {
          return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
        }

        // Volver al editor principal
        const originalSessionId = session.originalSessionId;
        if (originalSessionId) {
          await this.showEditWeapons(interaction, originalSessionId);
        } else {
          await interaction.reply({ content: 'No se pudo volver al editor anterior.', ephemeral: true });
        }

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
        .setTitle(`⚔️ Editar Grupo ${groupIndex + 1}`)
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
            .setCustomId(`group_edit_add_weapons_${tempSessionId}`)
            .setLabel('➕ Añadir Armas')
            .setStyle(ButtonStyle.Success)
            .setEmoji('➕'),
          new ButtonBuilder()
            .setCustomId(`group_edit_remove_weapons_${tempSessionId}`)
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
      .setTitle(`🎯 ${template.title}`)
      .setDescription(template.description)
      .setColor(parseInt(template.color.replace('#', ''), 16))
      .addFields([
        {
          name: '⏱️ Duración',
          value: template.time,
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
    try {
      let weaponsInfo = '';
      if (Array.isArray(template.weapons)) {
        // Formato de editor: [{ categories: [{ name, weapons: [...] }] }]
        weaponsInfo = template.weapons.map((group, idx) => {
          const total = (group.categories || []).reduce((acc, c) => acc + ((c.weapons || []).length), 0);
          const cats = (group.categories || []).map(c => c.name).join(', ') || '—';
          return `• Grupo ${idx + 1}: ${total} armas (${cats})`;
        }).join('\n');
      } else if (template.weapons && typeof template.weapons === 'object') {
        // Formato de creación: { key: { displayName, data: [...] } }
        weaponsInfo = Object.values(template.weapons).map(wc => {
          const count = (wc.data || []).length;
          return `• ${wc.displayName || 'Grupo'}: ${count} armas`;
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

      // Actualizar el template en la base de datos
      await templateService.updateTemplate(session.templateId, session.data);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Template Actualizado')
        .setDescription(`El template **${session.data.title}** ha sido actualizado exitosamente.`)
        .setColor(parseInt(session.data.color.replace('#', ''), 16))
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
        .setColor(parseInt(session.data.color.replace('#', ''), 16));

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
      const session = getValidSession(sessionId, interaction);

      if (!session) {
        return await interaction.reply({
          content: 'Sesión de edición expirada o inválida. Reinicia la edición del template.',
          ephemeral: true
        });
      }

      session.data.roles = [];
      session.hasChanges = true;

      const titleText = session.data.notifyAll ? 'Roles a Notificar' : 'Roles de Ping';

      const successEmbed = new EmbedBuilder()
        .setTitle(`✅ ${titleText} Limpiados`)
        .setDescription('Se eliminaron todos los roles del template.')
        .setColor(parseInt(session.data.color.replace('#', ''), 16));

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
        .setColor(parseInt(session.data.color.replace('#', ''), 16))
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
        .setColor(parseInt(session.data.color.replace('#', ''), 16));

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
        .setColor(parseInt(session.data.color.replace('#', ''), 16));

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

// Función auxiliar para validar y obtener sesión de manera robusta
function getValidSession(sessionId, interaction) {
  console.log(`[DEBUG] getValidSession - Validando sesión: ${sessionId}`);
  console.log(`[DEBUG] getValidSession - Sesiones disponibles: [${Array.from(templateEditSessions.keys()).join(', ')}]`);

  const session = templateEditSessions.get(sessionId);

  if (!session) {
    console.log(`[ERROR] getValidSession - Sesión no encontrada para ID: ${sessionId}`);
    return null;
  }

  // Validar que la sesión pertenezca al usuario correcto
  if (session.userId && session.userId !== interaction.user.id) {
    console.log(`[ERROR] getValidSession - Sesión no pertenece al usuario. SessionUser: ${session.userId}, InteractionUser: ${interaction.user.id}`);
    return null;
  }

  // Validar que la sesión pertenezca al servidor correcto
  if (session.guildId && session.guildId !== interaction.guild.id) {
    console.log(`[ERROR] getValidSession - Sesión no pertenece al servidor. SessionGuild: ${session.guildId}, InteractionGuild: ${interaction.guild.id}`);
    return null;
  }

  console.log(`[DEBUG] getValidSession - Sesión válida encontrada para: ${sessionId}`);
  return session;
}

// Exportar las sesiones y funciones para compatibilidad
module.exports.templateEditSessions = templateEditSessions;
