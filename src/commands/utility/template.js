const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { getTemplatesByServer, getTemplateByName, updateTemplate, createTemplate, deleteTemplate, getTemplateNames } = require('../../services/templateService');
const { AttachmentBuilder } = require('discord.js');
const { getOrCreateServer } = require('../../services/serverService');
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, safeReply } = require('../../utils/errorEmbeds');
const { checkPremiumAccess } = require('../../middleware/roleCheck');
const { safeDeferUpdate } = require('../../utils/interaction');
const { normalizeGroupToData, computeGroupMaxPlayers, getItemLabel } = require('../../utils/templateShape');

// Store temporal para manejar el estado del proceso de edición
const templateEditSessions = new Map();

// Tiempo de vida de sesión en milisegundos (12 horas)
const SESSION_TIMEOUT = 12 * 60 * 60 * 1000;

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
 * Función helper para obtener un grupo de armas de manera segura
 * Maneja tanto estructura de objeto (MongoDB) como array (legacy)
 */
function getWeaponGroupFromSession(session, groupIndex) {
  if (!session || !session.data || !session.data.weapons) {
    return null;
  }
  
  // Si es array (legacy)
  if (Array.isArray(session.data.weapons)) {
    return session.data.weapons[groupIndex] || null;
  }
  
  // Si es objeto (MongoDB - como 000002.json)
  if (typeof session.data.weapons === 'object') {
    const entries = Object.entries(session.data.weapons);
    const entry = entries[groupIndex];
    return entry ? entry[1] : null; // entry[0] es la clave, entry[1] es el grupo
  }
  
  return null;
}

/**
 * Función para limpiar y preparar datos para MongoDB
 * Elimina campos problemáticos y asegura estructura correcta
 */
function cleanForMongoDB(data) {
  if (!data) return data;
  
  // Crear copia profunda para evitar modificar el original
  const cleaned = JSON.parse(JSON.stringify(data));
  
  // Eliminar campos problemáticos
  if (cleaned._id) delete cleaned._id;
  if (cleaned.__v) delete cleaned.__v;
  
  // Limpiar armas
  if (cleaned.weapons) {
    if (Array.isArray(cleaned.weapons)) {
      // Legacy array structure - convertir a objeto
      const weaponsObj = {};
      cleaned.weapons.forEach((group, index) => {
        const key = group.displayName || group.name || `group_${index}`;
        weaponsObj[key] = {
          displayName: group.displayName || group.name || key,
          defaultEmoji: group.defaultEmoji || '⚔️',
          data: group.data || group.weapons || []
        };
        
        // Limpiar cada arma en el grupo
        if (weaponsObj[key].data && Array.isArray(weaponsObj[key].data)) {
          weaponsObj[key].data = weaponsObj[key].data.map(weapon => {
            const cleanWeapon = {
              name: weapon.name || '',
              units: weapon.units || weapon.quantity || 1,
              url: weapon.url || weapon.link || '',
              emoji: weapon.emoji || weapon.emojiId || '⚔️'
            };
            
            // Solo añadir campos opcionales si existen
            if (weapon.image) cleanWeapon.image = weapon.image;
            if (weapon.private !== undefined) cleanWeapon.private = weapon.private;
            if (weapon.sendBuildToPrivate !== undefined) cleanWeapon.sendBuildToPrivate = weapon.sendBuildToPrivate;
            if (weapon.label) cleanWeapon.label = weapon.label;
            
            return cleanWeapon;
          });
        }
      });
      cleaned.weapons = weaponsObj;
    } else if (typeof cleaned.weapons === 'object') {
      // MongoDB object structure - limpiar cada grupo
      Object.keys(cleaned.weapons).forEach(key => {
        const group = cleaned.weapons[key];
        if (group.data && Array.isArray(group.data)) {
          group.data = group.data.map(weapon => {
            const cleanWeapon = {
              name: weapon.name || '',
              units: weapon.units || weapon.quantity || 1,
              url: weapon.url || weapon.link || '',
              emoji: weapon.emoji || weapon.emojiId || '⚔️'
            };
            
            // Solo añadir campos opcionales si existen
            if (weapon.image) cleanWeapon.image = weapon.image;
            if (weapon.private !== undefined) cleanWeapon.private = weapon.private;
            if (weapon.sendBuildToPrivate !== undefined) cleanWeapon.sendBuildToPrivate = weapon.sendBuildToPrivate;
            if (weapon.label) cleanWeapon.label = weapon.label;
            
            return cleanWeapon;
          });
        }
      });
    }
  }
  
  return cleaned;
}

/**
 * Función mejorada para obtener y validar un grupo de armas
 * Incluye manejo de errores detallado y logging
 */
async function getAndValidateWeaponGroup(session, groupIndex, interaction, operation = 'operación') {
  console.log(`[DEBUG] getAndValidateWeaponGroup - Validando grupo ${groupIndex} para ${operation}`);
  
  if (!session || !session.data || !session.data.weapons) {
    console.log(`[ERROR] getAndValidateWeaponGroup - No hay datos de armas en la sesión`);
    return {
      success: false,
      error: 'No hay datos de armas en la sesión.',
      suggestion: 'Reinicia la edición del template con /template edit.'
    };
  }
  
  // Obtener información sobre los grupos disponibles
  let totalGroups = 0;
  let groupNames = [];
  let weaponGroup = null;
  
  if (Array.isArray(session.data.weapons)) {
    // Legacy array structure
    totalGroups = session.data.weapons.length;
    groupNames = session.data.weapons.map((g, i) => `${i}: ${g.displayName || g.name || `Grupo ${i}`}`);
    weaponGroup = session.data.weapons[groupIndex];
    console.log(`[DEBUG] getAndValidateWeaponGroup - Estructura array: ${totalGroups} grupos`);
  } else if (typeof session.data.weapons === 'object') {
    // MongoDB object structure (000002.json)
    const entries = Object.entries(session.data.weapons);
    totalGroups = entries.length;
    groupNames = entries.map(([key, group], i) => `${i}: ${group.displayName || group.name || key}`);
    
    if (groupIndex >= 0 && groupIndex < entries.length) {
      weaponGroup = entries[groupIndex][1]; // entries[groupIndex] = [key, groupData]
      console.log(`[DEBUG] getAndValidateWeaponGroup - Estructura objeto: ${totalGroups} grupos`);
    }
  }
  
  // Validar índice
  if (groupIndex < 0 || groupIndex >= totalGroups) {
    console.log(`[ERROR] getAndValidateWeaponGroup - Índice ${groupIndex} fuera de rango (0-${totalGroups - 1})`);
    return {
      success: false,
      error: `Grupo de armas no encontrado. Índice ${groupIndex} está fuera de rango (0-${totalGroups - 1}).`,
      suggestion: `Grupos disponibles: ${groupNames.join(', ')}`
    };
  }
  
  // Validar que se pudo obtener el grupo
  if (!weaponGroup) {
    console.log(`[ERROR] getAndValidateWeaponGroup - No se pudo obtener el grupo en índice ${groupIndex}`);
    return {
      success: false,
      error: 'No se pudo obtener el grupo de armas.',
      suggestion: 'El grupo podría estar corrupto. Reinicia la edición.'
    };
  }
  
  // Validar estructura del grupo
  const hasValidStructure = weaponGroup.data || weaponGroup.weapons || weaponGroup.categories;
  if (!hasValidStructure) {
    console.log(`[ERROR] getAndValidateWeaponGroup - Grupo sin estructura válida`);
    return {
      success: false,
      error: 'El grupo de armas no tiene una estructura válida.',
      suggestion: 'El grupo podría estar corrupto. Contacta al soporte.'
    };
  }
  
  console.log(`[DEBUG] getAndValidateWeaponGroup - Grupo validado exitosamente: ${weaponGroup.displayName || weaponGroup.name || `Grupo ${groupIndex}`}`);
  
  return {
    success: true,
    group: weaponGroup,
    totalGroups: totalGroups,
    groupName: weaponGroup.displayName || weaponGroup.name || `Grupo ${groupIndex}`
  };
}
function validateWeaponGroupExists(session, groupIndex, interaction) {
  if (!session || !session.data || !session.data.weapons) {
    return {
      valid: false,
      error: 'No hay datos de armas en la sesión.',
      suggestion: 'Reinicia la edición del template con /template edit.'
    };
  }
  
  let totalGroups = 0;
  let groupNames = [];
  
  if (Array.isArray(session.data.weapons)) {
    // Legacy array structure
    totalGroups = session.data.weapons.length;
    groupNames = session.data.weapons.map((g, i) => `${i}: ${g.displayName || g.name || `Grupo ${i}`}`);
  } else if (typeof session.data.weapons === 'object') {
    // MongoDB object structure (000002.json)
    const entries = Object.entries(session.data.weapons);
    totalGroups = entries.length;
    groupNames = entries.map(([key, group], i) => `${i}: ${group.displayName || group.name || key}`);
  }
  
  if (groupIndex < 0 || groupIndex >= totalGroups) {
    return {
      valid: false,
      error: `Grupo de armas no encontrado. Índice ${groupIndex} está fuera de rango (0-${totalGroups - 1}).`,
      suggestion: `Grupos disponibles: ${groupNames.join(', ')}`
    };
  }
  
  const weaponGroup = getWeaponGroupFromSession(session, groupIndex);
  if (!weaponGroup) {
    return {
      valid: false,
      error: 'No se pudo obtener el grupo de armas.',
      suggestion: 'El grupo podría estar corrupto. Reinicia la edición.'
    };
  }
  
  return {
    valid: true,
    group: weaponGroup,
    totalGroups: totalGroups
  };
}
function updateWeaponInGroup(weaponGroup, weaponIndex, updatedData) {
  if (!weaponGroup || weaponIndex < 0) return false;
  
  // Estructura con array 'data' (MongoDB - 000002.json)
  if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
    if (weaponIndex < weaponGroup.data.length) {
      weaponGroup.data[weaponIndex] = { ...weaponGroup.data[weaponIndex], ...updatedData };
      return true;
    }
  }
  
  // Estructura con array 'weapons' (legacy)
  if (weaponGroup.weapons && Array.isArray(weaponGroup.weapons)) {
    if (weaponIndex < weaponGroup.weapons.length) {
      weaponGroup.weapons[weaponIndex] = { ...weaponGroup.weapons[weaponIndex], ...updatedData };
      return true;
    }
  }
  
  // Estructura con categorías (legacy)
  if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
    let currentIndex = 0;
    for (const category of weaponGroup.categories) {
      if (category.weapons && Array.isArray(category.weapons)) {
        if (weaponIndex >= currentIndex && weaponIndex < currentIndex + category.weapons.length) {
          const localIndex = weaponIndex - currentIndex;
          category.weapons[localIndex] = { ...category.weapons[localIndex], ...updatedData };
          return true;
        }
        currentIndex += category.weapons.length;
      }
    }
  }
  
  return false;
}

/**
 * Función helper para obtener un arma específica del grupo
 */
function getWeaponFromGroup(weaponGroup, weaponIndex) {
  if (!weaponGroup || weaponIndex < 0) return null;
  
  // Estructura con array 'data' (MongoDB - 000002.json)
  if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
    return weaponGroup.data[weaponIndex] || null;
  }
  
  // Estructura con array 'weapons' (legacy)
  if (weaponGroup.weapons && Array.isArray(weaponGroup.weapons)) {
    return weaponGroup.weapons[weaponIndex] || null;
  }
  
  // Estructura con categorías (legacy)
  if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
    let currentIndex = 0;
    for (const category of weaponGroup.categories) {
      if (category.weapons && Array.isArray(category.weapons)) {
        if (weaponIndex >= currentIndex && weaponIndex < currentIndex + category.weapons.length) {
          const localIndex = weaponIndex - currentIndex;
          return category.weapons[localIndex];
        }
        currentIndex += category.weapons.length;
      }
    }
  }
  
  return null;
}
function getWeaponGroupIndex(session, groupKeyOrIndex) {
  if (!session || !session.data || !session.data.weapons) {
    return -1;
  }
  
  // Si es array, devolver el índice directamente
  if (Array.isArray(session.data.weapons)) {
    return typeof groupKeyOrIndex === 'number' ? groupKeyOrIndex : -1;
  }
  
  // Si es objeto, buscar por clave o convertir índice
  if (typeof session.data.weapons === 'object') {
    const entries = Object.entries(session.data.weapons);
    
    // Si es número, devolver el índice
    if (typeof groupKeyOrIndex === 'number') {
      return groupKeyOrIndex >= 0 && groupKeyOrIndex < entries.length ? groupKeyOrIndex : -1;
    }
    
    // Si es string (clave), buscar el índice
    if (typeof groupKeyOrIndex === 'string') {
      return entries.findIndex(([key]) => key === groupKeyOrIndex);
    }
  }
  
  return -1;
}
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
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('export')
        .setDescription('Exporta un template a un archivo JSON descargable')
        .addStringOption(option =>
          option
            .setName('template')
            .setDescription('Selecciona el template a exportar (desde Mongo)')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('import')
        .setDescription('Importa un template desde un archivo JSON adjunto')
        .addAttachmentOption(option =>
          option
            .setName('json')
            .setDescription('Archivo JSON con la estructura completa del template')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('template_name')
            .setDescription('Nombre del template destino donde se importarán los datos')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('rename')
        .setDescription('Renombra el título de un template existente')
        .addStringOption(option =>
          option
            .setName('template')
            .setDescription('Selecciona el template existente (desde Mongo)')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('new_template_name')
            .setDescription('Nuevo nombre para el template (obligatorio)')
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
        case 'export':
          await this.executeExport(interaction);
          break;
        case 'import':
          await this.executeImport(interaction);
          break;
        case 'rename':
          await this.executeRename(interaction);
          break;
        default:
          await interaction.reply({
            content: 'Subcomando no reconocido.',
            flags: MessageFlags.Ephemeral
          });
      }
    } catch (error) {
      console.error(`[ERROR] Error ejecutando template ${subcommand}:`, error);
      const errorMessage = 'Hubo un error al ejecutar este comando.';

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      } else if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      }
    }
  },

  // Nuevos handlers para modales de acciones individuales
  async handleModifyUnitsModalSubmit(interaction) {
    try {
      const parts = interaction.customId.split('_'); // modify_units_modal_sessionId_groupIndex_weaponIndex
      console.log('[DEBUG] handleModifyUnitsModalSubmit - parts:', parts);
      
      // El sessionId puede contener guiones bajos, así que necesitamos reconstruirlo
      const actionParts = 3; // modify_units_modal tiene 3 partes
      const lastTwoParts = parts.slice(-2); // Los últimos 2 son groupIndex y weaponIndex
      const groupIndex = parseInt(lastTwoParts[0]);
      const weaponIndex = parseInt(lastTwoParts[1]);
      const sessionId = parts.slice(actionParts, -2).join('_'); // Todo lo que está entre la acción y los últimos 2 números

      const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
      if (!validSession) {
        const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      const { session } = validSession;
      const newUnits = parseInt(interaction.fields.getTextInputValue('weapon_units'));

      if (isNaN(newUnits) || newUnits < 1) {
        const errorEmbed = createErrorEmbed('Error de Validación', 'La cantidad debe ser un número mayor a 0.');
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      // Actualizar el arma
      console.log('[DEBUG] handleModifyUnitsModalSubmit - groupIndex:', groupIndex, 'weapons length:', session.data.weapons ? session.data.weapons.length : 'undefined');
      
      const weaponGroup = session.data.weapons && session.data.weapons[groupIndex];
      
      if (!weaponGroup) {
        console.log('[ERROR] handleModifyUnitsModalSubmit - weaponGroup not found. Available groups:', session.data.weapons);
        const errorEmbed = createErrorEmbed('Error', 'No se pudo encontrar el grupo de armas. Por favor, reinicia la edición del template.');
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
      
      let weapon = null;

      if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
        weapon = weaponGroup.data[weaponIndex];
      } else if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
        let currentIndex = 0;
        for (const category of weaponGroup.categories) {
          if (category.weapons && Array.isArray(category.weapons)) {
            for (let i = 0; i < category.weapons.length; i++) {
              if (currentIndex === weaponIndex) {
                weapon = category.weapons[i];
                break;
              }
              currentIndex++;
            }
            if (weapon) break;
          }
        }
      } else if (weaponGroup.weapons && Array.isArray(weaponGroup.weapons)) {
        weapon = weaponGroup.weapons[weaponIndex];
      }

      if (weapon) {
        weapon.units = newUnits;
        weapon.quantity = newUnits;
        session.hasChanges = true;

        const successEmbed = createSuccessEmbed('Unidades Actualizadas', `La cantidad de **${weapon.name}** ha sido actualizada a **${newUnits}**.`);
        const backButton = new ButtonBuilder()
          .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
          .setLabel('🔙 Volver al Grupo')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(backButton);

        await interaction.reply({
          embeds: [successEmbed],
          components: [row],
          ephemeral: true
        });
      } else {
        await interaction.reply({ content: 'Arma no encontrada.', ephemeral: true });
      }

    } catch (error) {
      console.error('Error en handleModifyUnitsModalSubmit:', error);
      const errorEmbed = createErrorEmbed('Error', 'No se pudo actualizar las unidades.');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  async handleAddUrlModalSubmit(interaction) {
    try {
      const parts = interaction.customId.split('_'); // add_url_modal_sessionId_groupIndex_weaponIndex
      console.log('[DEBUG] handleAddUrlModalSubmit - parts:', parts);
      
      // El sessionId puede contener guiones bajos, así que necesitamos reconstruirlo
      const actionParts = 3; // add_url_modal tiene 3 partes
      const lastTwoParts = parts.slice(-2); // Los últimos 2 son groupIndex y weaponIndex
      const groupIndex = parseInt(lastTwoParts[0]);
      const weaponIndex = parseInt(lastTwoParts[1]);
      const sessionId = parts.slice(actionParts, -2).join('_'); // Todo lo que está entre la acción y los últimos 2 números

      const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
      if (!validSession) {
        const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      const { session } = validSession;
      const newUrl = interaction.fields.getTextInputValue('weapon_url').trim();

      // Actualizar el arma
      console.log('[DEBUG] handleAddUrlModalSubmit - groupIndex:', groupIndex, 'weapons length:', session.data.weapons ? session.data.weapons.length : 'undefined');
      
      const weaponGroup = session.data.weapons && session.data.weapons[groupIndex];
      
      if (!weaponGroup) {
        console.log('[ERROR] handleAddUrlModalSubmit - weaponGroup not found. Available groups:', session.data.weapons);
        const errorEmbed = createErrorEmbed('Error', 'No se pudo encontrar el grupo de armas. Por favor, reinicia la edición del template.');
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
      
      let weapon = null;

      if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
        weapon = weaponGroup.data[weaponIndex];
      } else if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
        let currentIndex = 0;
        for (const category of weaponGroup.categories) {
          if (category.weapons && Array.isArray(category.weapons)) {
            for (let i = 0; i < category.weapons.length; i++) {
              if (currentIndex === weaponIndex) {
                weapon = category.weapons[i];
                break;
              }
              currentIndex++;
            }
            if (weapon) break;
          }
        }
      } else if (weaponGroup.weapons && Array.isArray(weaponGroup.weapons)) {
        weapon = weaponGroup.weapons[weaponIndex];
      }

      if (weapon) {
        weapon.url = newUrl;
        weapon.link = newUrl;
        session.hasChanges = true;

        const successEmbed = createSuccessEmbed('URL Actualizada', `La URL de **${weapon.name}** ha sido ${newUrl ? 'actualizada' : 'eliminada'}.`);
        const backButton = new ButtonBuilder()
          .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
          .setLabel('🔙 Volver al Grupo')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(backButton);

        await interaction.reply({
          embeds: [successEmbed],
          components: [row],
          ephemeral: true
        });
      } else {
        await interaction.reply({ content: 'Arma no encontrada.', ephemeral: true });
      }

    } catch (error) {
      console.error('Error en handleAddUrlModalSubmit:', error);
      const errorEmbed = createErrorEmbed('Error', 'No se pudo actualizar la URL.');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  // Manejar selección de arma para modificar
  async handleModifyWeaponSelect(interaction) {
    try {
      console.log('[DEBUG] handleModifyWeaponSelect - customId:', interaction.customId);
      console.log('[DEBUG] handleModifyWeaponSelect - values:', interaction.values);

      // Extraer sessionId y groupIndex del customId
      const match = interaction.customId.match(/modify_weapon_select_(.+)_(\d+)$/);
      if (!match) {
        throw new Error(`Formato de customId no válido: ${interaction.customId}`);
      }

      const sessionId = match[1];
      const groupIndex = parseInt(match[2]);
      
      // El valor seleccionado contiene el índice original del arma
      const selectedValue = interaction.values[0];
      const weaponIndex = parseInt(selectedValue);

      console.log('[DEBUG] handleModifyWeaponSelect - sessionId:', sessionId, 'groupIndex:', groupIndex, 'weaponIndex:', weaponIndex);

      const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
      if (!validSession) {
        return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
      }

      const { session } = validSession;
      
      // Validar que el grupo existe antes de operar
      const validation = await getAndValidateWeaponGroup(session, groupIndex, interaction, 'seleccionar arma para modificar');
      if (!validation.success) {
        const errorEmbed = createErrorEmbed('Grupo no encontrado', validation.error);
        if (validation.suggestion) {
          errorEmbed.addFields([{ name: 'Sugerencia', value: validation.suggestion, inline: false }]);
        }
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      const weaponGroup = validation.group;
      console.log(`[DEBUG] handleModifyWeaponSelect - Grupo validado: ${validation.groupName}`);

      console.log('[DEBUG] handleModifyWeaponSelect - weaponGroup structure:', {
        hasData: !!weaponGroup.data,
        hasWeapons: !!weaponGroup.weapons,
        hasCategories: !!weaponGroup.categories,
        dataLength: weaponGroup.data ? weaponGroup.data.length : 0,
        categoriesLength: weaponGroup.categories ? weaponGroup.categories.length : 0
      });

      // Obtener todas las armas del grupo usando la misma lógica que handleModifyWeaponInGroup
      let weaponFound = false;
      let targetWeapon = null;
      
      if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
        // Estructura con array 'data' (como en 000001.json)
        console.log('[DEBUG] handleModifyWeaponSelect - Using data array structure');
        targetWeapon = weaponGroup.data[weaponIndex];
        weaponFound = !!targetWeapon;
      } else if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
        // Estructura alternativa con categorías
        console.log('[DEBUG] handleModifyWeaponSelect - Using categories structure');
        let currentIndex = 0;
        for (const category of weaponGroup.categories) {
          if (category.weapons && Array.isArray(category.weapons)) {
            for (const weapon of category.weapons) {
              if (currentIndex === weaponIndex) {
                targetWeapon = weapon;
                weaponFound = true;
                break;
              }
              currentIndex++;
            }
            if (weaponFound) break;
          }
        }
      } else if (weaponGroup.weapons && Array.isArray(weaponGroup.weapons)) {
        // Estructura con array 'weapons'
        console.log('[DEBUG] handleModifyWeaponSelect - Using weapons array structure');
        targetWeapon = weaponGroup.weapons[weaponIndex];
        weaponFound = !!targetWeapon;
      }

      console.log('[DEBUG] handleModifyWeaponSelect - weaponFound:', weaponFound, 'targetWeapon:', targetWeapon);

      if (!weaponFound || !targetWeapon) {
        return await interaction.reply({ content: 'Arma no encontrada.', ephemeral: true });
      }

      // Función auxiliar para formatear emojis
      const formatEmoji = (emojiId, fallback = '⚔️') => {
        if (!emojiId) return fallback;
        
        // Si ya es un emoji Unicode estándar, devolverlo tal como está
        if (emojiId.length <= 4 || /^[\u{1F000}-\u{1F9FF}]|^[\u{2600}-\u{26FF}]|^[\u{2700}-\u{27BF}]/u.test(emojiId)) {
          return emojiId;
        }
        
        // Si es un ID numérico, formatearlo como emoji personalizado
        if (/^\d+$/.test(emojiId)) {
          return `<:emoji:${emojiId}>`;
        }
        
        // Si ya está formateado como emoji personalizado, devolverlo tal como está
        if (emojiId.startsWith('<:') && emojiId.endsWith('>')) {
          return emojiId;
        }
        
        // Si es un emoji animado
        if (emojiId.startsWith('<a:') && emojiId.endsWith('>')) {
          return emojiId;
        }
        
        return fallback;
      };

      // En lugar de mostrar el modal, mostrar un embed con botones de acción
      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle(`🔧 Modificar Arma`)
        .setDescription(`**${formatEmoji(weaponGroup.emojiId || weaponGroup.emoji)} Grupo:** ${weaponGroup.name || weaponGroup.displayName || `Grupo ${groupIndex + 1}`}`)
        .addFields([
          {
            name: '🎯 Arma Seleccionada',
            value: `${formatEmoji(targetWeapon.emojiId || targetWeapon.emoji)} **${targetWeapon.name || 'Sin nombre'}**`,
            inline: false
          },
          {
            name: '📊 Cantidad Actual',
            value: String(targetWeapon.units || targetWeapon.quantity || 1),
            inline: true
          },
          {
            name: '🔗 URL Actual',
            value: targetWeapon.url || targetWeapon.link || 'Sin URL',
            inline: true
          },
          {
            name: '🔒 Envío Privado',
            value: String(targetWeapon.sendBuildToPrivate || targetWeapon.private || false),
            inline: true
          }
        ])
        .setFooter({ text: 'Selecciona la acción que deseas realizar' });

      // Crear botones de acción (solo los requeridos)
      const deleteButton = new ButtonBuilder()
        .setCustomId(`delete_weapon_${sessionId}_${groupIndex}_${weaponIndex}`)
        .setLabel('🗑️ Eliminar')
        .setStyle(ButtonStyle.Danger);

      const modifyUnitsButton = new ButtonBuilder()
        .setCustomId(`modify_units_${sessionId}_${groupIndex}_${weaponIndex}`)
        .setLabel('📊 Modificar Unidades')
        .setStyle(ButtonStyle.Primary);

      const modifyFullButton = new ButtonBuilder()
        .setCustomId(`modify_weapon_full_${sessionId}_${groupIndex}_${weaponIndex}`)
        .setLabel('🔧 Modificar Completo')
        .setStyle(ButtonStyle.Primary);

      const addUrlButton = new ButtonBuilder()
        .setCustomId(`add_url_${sessionId}_${groupIndex}_${weaponIndex}`)
        .setLabel('🔗 Añadir/Editar URL')
        .setStyle(ButtonStyle.Secondary);

      const backButton = new ButtonBuilder()
        .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
        .setLabel('🔙 Volver al Grupo')
        .setStyle(ButtonStyle.Secondary);

      // Abrir directamente el modal de modificación completa
      await handleModifyWeaponFull(interaction, sessionId, groupIndex, weaponIndex, targetWeapon);
      console.log('[DEBUG] handleModifyWeaponSelect - Modal de modificación completa abierto exitosamente');

    } catch (error) {
      console.error('Error en handleModifyWeaponSelect:', error);
      
      // Solo responder si la interacción no ha sido respondida
      if (!interaction.replied && !interaction.deferred) {
        try {
          const errorEmbed = createErrorEmbed('Error', 'No se pudo procesar la selección de arma.');
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } catch (replyError) {
          console.error('Error al responder con mensaje de error:', replyError);
        }
      }
    }
  },

  // Manejar selección de arma para modificar - SIMPLIFICADO
  async handleModifyWeaponSelect(interaction) {
    try {
      console.log('[DEBUG] handleModifyWeaponSelect - customId:', interaction.customId);
      console.log('[DEBUG] handleModifyWeaponSelect - values:', interaction.values);

      // Extraer sessionId y groupIndex del customId
      const match = interaction.customId.match(/modify_weapon_select_(.+)_(\d+)$/);
      if (!match) {
        throw new Error(`Formato de customId no válido: ${interaction.customId}`);
      }

      const sessionId = match[1];
      const groupIndex = parseInt(match[2]);
      
      // El valor seleccionado contiene el índice original del arma
      const selectedValue = interaction.values[0];
      const weaponIndex = parseInt(selectedValue);

      console.log('[DEBUG] handleModifyWeaponSelect - sessionId:', sessionId, 'groupIndex:', groupIndex, 'weaponIndex:', weaponIndex);

      const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
      if (!validSession) {
        return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
      }

      const { session } = validSession;
      
      // Validar que el grupo existe antes de operar
      const validation = await getAndValidateWeaponGroup(session, groupIndex, interaction, 'seleccionar arma para modificar');
      if (!validation.success) {
        const errorEmbed = createErrorEmbed('Grupo no encontrado', validation.error);
        if (validation.suggestion) {
          errorEmbed.addFields([{ name: 'Sugerencia', value: validation.suggestion, inline: false }]);
        }
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      const weaponGroup = validation.group;
      console.log(`[DEBUG] handleModifyWeaponSelect - Grupo validado: ${validation.groupName}`);

      // Obtener todas las armas del grupo usando la misma lógica que handleModifyWeaponInGroup
      let weaponFound = false;
      let targetWeapon = null;
      
      if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
        // Estructura con array 'data' (como en 000001.json)
        console.log('[DEBUG] handleModifyWeaponSelect - Using data array structure');
        targetWeapon = weaponGroup.data[weaponIndex];
        weaponFound = !!targetWeapon;
      } else if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
        // Estructura alternativa con categorías
        console.log('[DEBUG] handleModifyWeaponSelect - Using categories structure');
        let currentIndex = 0;
        for (const category of weaponGroup.categories) {
          if (category.weapons && Array.isArray(category.weapons)) {
            for (let i = 0; i < category.weapons.length; i++) {
              if (currentIndex === weaponIndex) {
                targetWeapon = category.weapons[i];
                weaponFound = true;
                break;
              }
              currentIndex++;
            }
            if (weaponFound) break;
          }
        }
      } else if (weaponGroup.weapons && Array.isArray(weaponGroup.weapons)) {
        // Estructura con array 'weapons'
        console.log('[DEBUG] handleModifyWeaponSelect - Using weapons array structure');
        targetWeapon = weaponGroup.weapons[weaponIndex];
        weaponFound = !!targetWeapon;
      }

      console.log('[DEBUG] handleModifyWeaponSelect - weaponFound:', weaponFound, 'targetWeapon:', targetWeapon);

      if (!weaponFound || !targetWeapon) {
        return await interaction.reply({ content: 'Arma no encontrada.', ephemeral: true });
      }

      // Abrir directamente el modal completo de modificación
      await handleModifyWeaponFull(interaction, sessionId, groupIndex, weaponIndex, targetWeapon);

    } catch (error) {
      console.error('Error en handleModifyWeaponSelect:', error);
      
      // Solo responder si la interacción no ha sido respondida
      if (!interaction.replied && !interaction.deferred) {
        try {
          const errorEmbed = createErrorEmbed('Error', 'No se pudo procesar la selección de arma.');
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } catch (replyError) {
          console.error('Error al responder con mensaje de error:', replyError);
        }
      }
    }
  },

  // =============== TEMPLATE LIST ===============
  async executeList(interaction) {
    try {

      // VALIDACION: Verificar permisos de usuario
      const hasAccess = await checkPremiumAccess(interaction);
      if (!hasAccess) {
        const errorEmbed = createErrorEmbed(
          "🔒 Sin Permisos",
          "No tienes permisos para usar este comando. Necesitas tener un rol autorizado o ser administrador."
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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

    // VALIDACION: Verificar permisos de usuario
      const hasAccess = await checkPremiumAccess(interaction);
      if (!hasAccess) {
        const errorEmbed = createErrorEmbed(
          "🔒 Sin Permisos",
          "No tienes permisos para usar este comando. Necesitas tener un rol autorizado o ser administrador."
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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

      // VALIDACION: Verificar permisos de usuario
      const hasAccess = await checkPremiumAccess(interaction);
      if (!hasAccess) {
        const errorEmbed = createErrorEmbed(
          "🔒 Sin Permisos",
          "No tienes permisos para usar este comando. Necesitas tener un rol autorizado o ser administrador."
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
          weapons: template.weapons // Mantener la estructura original sin conversión
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
        .setDescription(`**${template.title || 'Sin título'}**\n\n¿Qué deseas editar?`)
        .setColor(0x00FFFF)
        .addFields([
          {
            name: '📋 Información Básica',
            value: `Título: \`${template.title || 'Sin título'}\``,
            inline: true
          },
          {
            name: '📝 Descripción',
            value: (typeof template.description === 'string' && template.description.length > 0)
              ? (template.description.length > 150
                ? template.description.substring(0, 150) + '...'
                : template.description)
              : 'Sin descripción',
            inline: false
          },
          {
            name: '⚔️ Grupos de Armas',
            value: template.weapons && (Array.isArray(template.weapons) ? template.weapons.length > 0 : Object.keys(template.weapons).length > 0)
              ? (Array.isArray(template.weapons) 
                  ? template.weapons.map((weaponGroup, index) => {
                      // Estructura legacy con categories
                      const totalWeapons = weaponGroup.categories?.reduce((total, cat) => total + (cat.weapons?.length || 0), 0) || 0;
                      const categoryNames = weaponGroup.categories?.map(cat => cat.name).join(', ') || '';
                      const groupName = weaponGroup.name || weaponGroup.displayName || `Grupo ${index + 1}`;
                      const emojiRendered = renderEmoji(weaponGroup.defaultEmoji);
                      return `• ${emojiRendered} ${groupName} (${totalWeapons} armas) - ${categoryNames}`;
                    }).join('\n')
                  : Object.entries(template.weapons).map(([groupKey, weaponGroup], index) => {
                      // Estructura nueva con data
                      const totalWeapons = weaponGroup.data?.length || 0;
                      const groupName = weaponGroup.displayName || groupKey;
                      const emojiRendered = renderEmoji(weaponGroup.defaultEmoji);
                      return `• ${emojiRendered} ${groupName} (${totalWeapons} armas)`;
                    }).join('\n')
                )
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

      // Manejar botones de modificación de armas individuales
      if (customId.startsWith('delete_weapon_') || 
          customId.startsWith('modify_units_') || 
          customId.startsWith('modify_weapon_full_') ||
          customId.startsWith('add_url_') ||
          customId.startsWith('confirm_delete_weapon_') ||
          customId.startsWith('cancel_delete_weapon_')) {
        return await handleWeaponActionButton(interaction, customId);
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
        // case 'preview':
        // Eliminado: la vista previa ya no es necesaria
        // break;
        case 'save':
          await templateModule.saveTemplateChanges(interaction, sessionId);
          break;
        case 'cancel':
          // Cancelar edición - eliminar sesión y mostrar mensaje
          templateEditSessions.delete(sessionId);
          const cancelEmbed = createInfoEmbed('Edición Cancelada', 'La edición del template ha sido cancelada.');
          await interaction.reply({ embeds: [cancelEmbed], ephemeral: true });
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

      // VALIDACION: Verificar permisos de usuario
      const hasAccess = await checkPremiumAccess(interaction);
      if (!hasAccess) {
        const errorEmbed = createErrorEmbed(
          "🔒 Sin Permisos",
          "No tienes permisos para usar este comando. Necesitas tener un rol autorizado o ser administrador."
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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

      // VALIDACION: Verificar permisos de usuario
      const hasAccess = await checkPremiumAccess(interaction);
      if (!hasAccess) {
        const errorEmbed = createErrorEmbed(
          "🔒 Sin Permisos",
          "No tienes permisos para usar este comando. Necesitas tener un rol autorizado o ser administrador."
        );
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
      if (['edit', 'delete', 'clone', 'export', 'rename'].includes(subcommand)) {
        const templates = await getTemplatesByServer(interaction.guild.id);
        const focusedValue = interaction.options.getFocused();
        const filtered = templates.filter(template =>
          template.title.toLowerCase().includes(focusedValue.toLowerCase())
        );

        if (!interaction.responded && !interaction.deferred && !interaction.replied) {
          await interaction.respond(
            filtered.slice(0, 25).map(template => ({
              name: template.title,
              value: template.title,
            }))
          );
        }
      }
    } catch (error) {
      console.error(`[ERROR] Error en autocomplete template ${subcommand}:`, error);
      try {
        if (!interaction.responded && !interaction.deferred && !interaction.replied) {
          await interaction.respond([]);
        }
      } catch { /* ignore duplicate ack */ }
    }
  },

  async executeRename(interaction) {
    try {
      const guildId = interaction.guild.id;
      const currentName = interaction.options.getString('template');
      const newTitle = interaction.options.getString('new_template_name');

      // Buscar el template actual
      const currentTemplate = await getTemplateByName(currentName, guildId);
      if (!currentTemplate) {
        const errorEmbed = createErrorEmbed(
          'Template No Encontrado',
          `No existe un template con nombre "${currentName}" en este servidor.`
        );
        return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }

      // Verificar que el nuevo nombre no esté en uso
      const conflict = await getTemplateByName(newTitle, guildId);
      if (conflict) {
        const errorEmbed = createErrorEmbed(
          'Título Ya en Uso',
          `El título "${newTitle}" ya está en uso. Elige otro nombre.`
        );
        return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }

      // Actualizar el template con el nuevo título
      const updatedTemplate = await updateTemplate(currentTemplate._id, { title: newTitle });

      const successEmbed = createSuccessEmbed(
        'Template Renombrado',
        `El template "${currentName}" ha sido renombrado exitosamente a "${newTitle}".`,
        [
          { name: 'Nombre Anterior', value: currentName, inline: true },
          { name: 'Nombre Nuevo', value: newTitle, inline: true }
        ]
      );

      return await safeReply(interaction, { embeds: [successEmbed], ephemeral: true });

    } catch (error) {
      console.error('[ERROR] Error en executeRename:', error);
      const errorEmbed = createErrorEmbed(
        'Error del Sistema',
        'Hubo un error al renombrar el template.'
      );
      return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
    }
  },

async executeExport(interaction) {
    try {
      const guildId = interaction.guild.id;
      const templateName = interaction.options.getString('template');

      // Buscar el template en la base de datos
      const template = await getTemplateByName(templateName, guildId);
      if (!template) {
        const errorEmbed = createErrorEmbed(
          'Template No Encontrado',
          `No existe un template con nombre "${templateName}" en este servidor.`
        );
        return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }

      // Preparar los datos para exportar
      const exportData = {
        title: template.title,
        description: template.description || '',
        image: template.image || '',
        color: template.color || '',
        url: template.url || '',
        roles: template.roles || [],
        weapons: template.weapons || {},
        notifyAll: template.notifyAll || false,
        reminder: template.reminder || '5m'
      };

      // Crear el archivo JSON
      const jsonContent = JSON.stringify(exportData, null, 2);
      const buffer = Buffer.from(jsonContent, 'utf8');
      const fileName = `${template.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      
      const { AttachmentBuilder } = require('discord.js');
      const attachment = new AttachmentBuilder(buffer, { name: fileName });

      const successEmbed = createSuccessEmbed(
        'Template Exportado',
        `El template "${template.title}" ha sido exportado exitosamente.`,
        [
          { name: 'Archivo', value: fileName, inline: true },
          { name: 'Tamaño', value: `${Math.round(buffer.length / 1024 * 100) / 100} KB`, inline: true }
        ]
      );

      return await safeReply(interaction, { 
        embeds: [successEmbed], 
        files: [attachment], 
        ephemeral: true 
      });

    } catch (error) {
      console.error('[ERROR] Error en executeExport:', error);
      const errorEmbed = createErrorEmbed(
        'Error de Exportación',
        'Hubo un error al exportar el template.'
      );
      return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
    }
  },

async executeImport(interaction) {
    try {
      const guildId = interaction.guild.id;
      const attachment = interaction.options.getAttachment('json');
      const templateName = interaction.options.getString('template_name');

      // Validar el archivo
      if (!attachment.name.endsWith('.json')) {
        const errorEmbed = createErrorEmbed(
          'Formato de Archivo Inválido',
          'El archivo debe ser de tipo JSON (.json)'
        );
        return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }

      // Validar tamaño del archivo (máximo 8MB)
      if (attachment.size > 8 * 1024 * 1024) {
        const errorEmbed = createErrorEmbed(
          'Archivo Muy Grande',
          'El archivo es demasiado grande. Máximo permitido: 8MB'
        );
        return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }

      // Verificar si ya existe un template con ese nombre
      const existingTemplate = await getTemplateByName(templateName, guildId);
      if (existingTemplate) {
        const errorEmbed = createErrorEmbed(
          'Template Ya Existe',
          `Ya existe un template con el nombre "${templateName}". Usa otro nombre.`
        );
        return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }

      // Descargar y parsear el archivo JSON
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`Error al descargar archivo: ${response.status}`);
      }

      const jsonContent = await response.text();
      let importData;

      try {
        importData = JSON.parse(jsonContent);
      } catch (parseError) {
        const errorEmbed = createErrorEmbed(
          'JSON Inválido',
          'El archivo no contiene un JSON válido.'
        );
        return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }

      // Preparar los datos del template
      const templateData = {
        title: templateName,
        description: importData.description || '',
        image: importData.image || '',
        color: importData.color || '',
        url: importData.url || '',
        roles: importData.roles || [],
        weapons: importData.weapons || {},
        notifyAll: importData.notifyAll || false,
        reminder: importData.reminder || '5m'
      };

      // Crear el template en la base de datos
      const createdTemplate = await createTemplate(templateData, guildId);

      const successEmbed = createSuccessEmbed(
        'Template Importado',
        `El template "${templateName}" ha sido importado exitosamente.`,
        [
          { name: 'Archivo Original', value: attachment.name, inline: true },
          { name: 'Nuevo Template', value: templateName, inline: true }
        ]
      );

      return await safeReply(interaction, { embeds: [successEmbed], ephemeral: true });

    } catch (error) {
      console.error('[ERROR] Error en executeImport:', error);
      const errorEmbed = createErrorEmbed(
        'Error de Importación',
        'Hubo un error al importar el template.'
      );
      return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
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
      else if (interaction.customId.startsWith('modify_weapon_modal_')) {
        await this.handleModifyWeaponModalSubmit(interaction);
        return;
      }
      // Nuevos modales de acciones individuales de armas
      else if (interaction.customId.startsWith('modify_units_modal_')) {
        await this.handleModifyUnitsModalSubmit(interaction);
        return;
      }
else if (interaction.customId.startsWith('modify_weapon_full_modal_')) {
        // Asegurar que el handler exista en el módulo
        if (typeof this.handleModifyWeaponFullModalSubmit === 'function') {
          await this.handleModifyWeaponFullModalSubmit(interaction);
        } else if (typeof templateModule?.handleModifyWeaponFullModalSubmit === 'function') {
          await templateModule.handleModifyWeaponFullModalSubmit(interaction);
        } else if (typeof handleModifyWeaponFullModalSubmit === 'function') {
          await handleModifyWeaponFullModalSubmit(interaction);
        } else {
          console.error('Handler handleModifyWeaponFullModalSubmit no está definido');
          const errorEmbed = createErrorEmbed('Error', 'No se pudo procesar el modal de modificación completa.');
          return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        return;
      }
      else if (interaction.customId.startsWith('add_url_modal_')) {
        await this.handleAddUrlModalSubmit(interaction);
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
      else if (interaction.customId.startsWith('add_weapon_link_')) {
        await handleAddWeaponLinkModal(interaction);
        return;
      }
      else if (interaction.customId.startsWith('update_weapon_quantities_')) {
        await handleUpdateWeaponQuantitiesModal(interaction);
        return;
      }
      else if (interaction.customId.startsWith('edit_max_players_modal_')) {
        await this.handleEditMaxPlayersModalSubmit(interaction);
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
      if (interaction.customId.startsWith('modify_weapon_select_')) {
        console.log('[DEBUG] Modify weapon select detectado - customId:', interaction.customId);
        console.log('[DEBUG] Values seleccionados:', interaction.values);
        await this.handleModifyWeaponSelect(interaction);
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
        } else if (interaction.customId.includes('update_quantity_select_')) {
          await handleUpdateQuantitySelect(interaction);
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

          await safeDeferUpdate(interaction);

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
        } else if (interaction.customId.includes('modify_add_link_')) {
          // Manejar añadir enlace de arma
          await handleModifyAddLink(interaction);
        } else if (interaction.customId.includes('modify_update_quantities_')) {
          // Manejar actualizar cantidades
          await handleModifyUpdateQuantities(interaction);
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

      await safeDeferUpdate(interaction);

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
        console.log('[DEBUG] back_to_group - parts:', parts);
        
        // El sessionId puede contener guiones bajos, así que necesitamos reconstruirlo
        const lastPart = parts[parts.length - 1]; // El último es groupIndex
        const groupIndex = parseInt(lastPart);
        const sessionId = parts.slice(0, -1).join('_'); // Todo excepto el último es sessionId
        
        console.log('[DEBUG] back_to_group - sessionId:', sessionId, 'groupIndex:', groupIndex);

        const session = templateEditSessions.get(sessionId);
        if (session) {
          const weaponGroup = Array.isArray(session.data.weapons)
            ? session.data.weapons[groupIndex]
            : Object.entries(session.data.weapons)[groupIndex]?.[1];
          if (weaponGroup) {
            await this.showGroupEditInterface(interaction, sessionId, weaponGroup, groupIndex);
          } else {
            const errorEmbed = createErrorEmbed('Error', 'No se pudo encontrar el grupo de armas.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          }
        } else {
          const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado. Por favor, reinicia la edición.');
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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

          await safeDeferUpdate(interaction);

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

    // Refrescar inmediatamente el Editor con los nuevos datos
    await this.showEditOverview(interaction, sessionId);
  },

  // Procesar edición de descripción
  async handleDescriptionEditSubmit(interaction, sessionId) {
    const session = templateEditSessions.get(sessionId);

    const description = interaction.fields.getTextInputValue('description');

    session.data.description = description;
    session.hasChanges = true;

    // Refrescar inmediatamente el Editor con los nuevos datos
    await this.showEditOverview(interaction, sessionId);
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

      // CORRECCIÓN: Convertir al formato correcto de MongoDB
      // NO usar 'categories', usar directamente 'data' como en el formato original
      const convertCreationGroupToEditorGroup = (weaponConfig, existingGroup) => {
        console.log('[DEBUG] convertCreationGroupToEditorGroup: weaponConfig received:', JSON.stringify(weaponConfig, null, 2));

        const editorWeapons = (weaponConfig?.data || []).map(w => ({
          id: w.id,
          name: w.name,
          units: w.units, // Mantener 'units' como en el formato original
          image: w.image || '',
          emoji: w.emoji, // Usar 'emoji' directamente
          url: w.url || '',
          sendBuildToPrivate: w.sendBuildToPrivate !== false // Default true
        }));

        console.log('[DEBUG] convertCreationGroupToEditorGroup: editorWeapons created:', JSON.stringify(editorWeapons, null, 2));

        // FORMATO CORRECTO: Mantener la estructura original de MongoDB
        const result = {
          displayName: weaponConfig?.displayName || 'Nuevo Grupo',
          defaultEmoji: weaponConfig?.defaultEmoji || '⚔️',
          max_players: weaponConfig?.max_players,
          data: editorWeapons // Usar 'data' en lugar de 'categories'
        };

        console.log('[DEBUG] convertCreationGroupToEditorGroup: final result (CORRECT FORMAT):', JSON.stringify(result, null, 2));
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
          editSession.data.weapons = {};
        }
        
        // Si weapons está en formato array, convertir a objeto
        if (Array.isArray(editSession.data.weapons)) {
          const obj = {};
          editSession.data.weapons.forEach((g, idx) => {
            const base = (g.displayName || g.name || `grupo_${idx + 1}`).toString().trim().toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            let key = base || `grupo_${idx + 1}`;
            let c = 1;
            while (obj[key]) { key = `${base}_${c++}`; }
            obj[key] = g;
          });
          editSession.data.weapons = obj;
        }
        
        // Convertir al formato de editor y añadir como objeto
        const editorGroup = convertCreationGroupToEditorGroup(updatedData.newWeaponGroup);
        const baseKey = (editorGroup.displayName || 'nuevo_grupo').toString().trim().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        let newKey = baseKey || `grupo_${Date.now()}`;
        let i = 1;
        while (editSession.data.weapons[newKey]) { newKey = `${baseKey}_${i++}`; }
        
        editSession.data.weapons[newKey] = editorGroup;
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

          // CORRECCIÓN: Usar el formato correcto de MongoDB con 'data'
          // Añadir las nuevas armas al array 'data' del grupo existente
          if (existing.data && Array.isArray(existing.data)) {
            existing.data = [...existing.data, ...newWeapons];
          } else {
            // Si no hay data, crear el array
            existing.data = newWeapons;
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

      // CORRECCIÓN: Mantener el formato correcto de MongoDB
      // El formato correcto es: { displayName, defaultEmoji, data: [...] }
      // NO debe usar 'categories'

      let allWeapons = [];

      // Si el grupo tiene la estructura incorrecta con 'categories', convertirla
      if (group.categories && Array.isArray(group.categories)) {
        group.categories.forEach(category => {
          if (category.weapons && Array.isArray(category.weapons)) {
            category.weapons.forEach(weapon => {
              allWeapons.push({
                id: weapon.id || Date.now() + Math.random(),
                name: weapon.name,
                units: weapon.quantity || weapon.units || 1,
                image: weapon.image || '',
                emoji: weapon.emojiId || weapon.emoji, // Usar emojiId como emoji
                url: weapon.url || '',
                sendBuildToPrivate: weapon.sendBuildToPrivate !== false // Default true
              });
            });
          }
        });
      } 
      // Si el grupo ya tiene la estructura correcta con 'data', usarla
      else if (group.data && Array.isArray(group.data)) {
        allWeapons = group.data.map(weapon => ({
          id: weapon.id || Date.now() + Math.random(),
          name: weapon.name,
          units: weapon.units || 1,
          image: weapon.image || '',
          emoji: weapon.emoji,
          url: weapon.url || '',
          sendBuildToPrivate: weapon.sendBuildToPrivate !== false // Default true
        }));
      }

      // FORMATO CORRECTO DE MONGODB - SIN 'categories'
      dbFormat[groupKey] = {
        displayName: group.name || group.displayName || 'Nuevo Grupo',
        defaultEmoji: group.defaultEmoji || '⚔️',
        max_players: group.max_players,
        data: allWeapons
      };
    });

    console.log('[DEBUG] convertEditorToDbFormat: Converted to correct MongoDB format:', JSON.stringify(dbFormat, null, 2));
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
        // Fallback mejorado: usar formato correcto para emoji personalizado
        return `<:weapon:${id}>`;
      };

      const embed = new EmbedBuilder()
        .setTitle('⚔️ Editor de Grupos de Armas')
        .setDescription('Gestiona los grupos de armas de tu template')
        .setColor(parseInt((template.color || '#0099ff').replace('#', ''), 16));

      // Mostrar grupos existentes
      if (template.weapons && (Array.isArray(template.weapons) ? template.weapons.length > 0 : Object.keys(template.weapons).length > 0)) {
        let weaponsList;
        let selectOptions;
        
        if (Array.isArray(template.weapons)) {
          // Estructura de array (legacy)
          weaponsList = template.weapons.map((weaponGroup, index) => {
            const categoryNames = weaponGroup.categories?.map(cat => cat.name).join(', ') || '';
            const totalWeapons = weaponGroup.categories?.reduce((total, cat) => total + (cat.weapons?.length || 0), 0) || 0;
            const groupName = weaponGroup.name || weaponGroup.displayName || `Grupo ${index + 1}`;
            const groupEmoji = renderEmoji(weaponGroup.defaultEmoji);

            return `${groupEmoji} **${groupName}**\n• ${totalWeapons} armas configuradas\n• Categorías: ${categoryNames || 'Ninguna'}`;
          }).join('\n\n');

          selectOptions = template.weapons.map((weaponGroup, index) => {
            const categoryNames = weaponGroup.categories?.map(cat => cat.name).join(', ') || '';
            const totalWeapons = weaponGroup.categories?.reduce((total, cat) => total + (cat.weapons?.length || 0), 0) || 0;
            const groupName = weaponGroup.name || weaponGroup.displayName || `Grupo ${index + 1}`;
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
        } else {
          // Estructura de objeto con claves (nueva estructura)
          const weaponGroups = Object.entries(template.weapons);
          weaponsList = weaponGroups.map(([groupKey, weaponGroup], index) => {
            const totalWeapons = weaponGroup.data?.length || 0;
            const groupName = weaponGroup.displayName || groupKey;
            const groupEmoji = renderEmoji(weaponGroup.defaultEmoji);

            return `${groupEmoji} **${groupName}**\n• ${totalWeapons} armas configuradas`;
          }).join('\n\n');

          selectOptions = weaponGroups.map(([groupKey, weaponGroup], index) => {
            const totalWeapons = weaponGroup.data?.length || 0;
            const groupName = weaponGroup.displayName || groupKey;
            const groupEmoji = weaponGroup.defaultEmoji || '⚔️';
            const option = {
              label: groupName,
              value: index.toString(),
              description: `${totalWeapons} armas`,
            };
            try {
              if (/^\d{15,20}$/.test(String(groupEmoji))) option.emoji = { id: String(groupEmoji) };
              else option.emoji = { name: String(groupEmoji) };
            } catch { option.emoji = { name: '⚔️' }; }
            return option;
          });
        }

        embed.addFields([
          {
            name: 'Grupos Actuales',
            value: weaponsList,
            inline: false
          }
        ]);

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
      
      console.log('[DEBUG] handleEditWeaponGroupSelect - groupIndex:', groupIndex);
      console.log('[DEBUG] handleEditWeaponGroupSelect - session.data.weapons type:', typeof session.data.weapons);
      console.log('[DEBUG] handleEditWeaponGroupSelect - session.data.weapons isArray:', Array.isArray(session.data.weapons));
      
      let weaponGroup;
      
      if (Array.isArray(session.data.weapons)) {
        // Estructura de array (legacy)
        weaponGroup = session.data.weapons[groupIndex];
        console.log('[DEBUG] handleEditWeaponGroupSelect - weapons disponibles (array):', session.data.weapons.length);
        console.log('[DEBUG] handleEditWeaponGroupSelect - weaponGroup encontrado (array):', !!weaponGroup);
      } else if (session.data.weapons && typeof session.data.weapons === 'object') {
        // Estructura de objeto (nueva)
        const weaponGroups = Object.entries(session.data.weapons);
        const groupEntry = weaponGroups[groupIndex];
        if (groupEntry) {
          const [groupKey, groupData] = groupEntry;
          weaponGroup = groupData;
          console.log('[DEBUG] handleEditWeaponGroupSelect - weapons disponibles (object):', weaponGroups.length);
          console.log('[DEBUG] handleEditWeaponGroupSelect - groupKey:', groupKey);
          console.log('[DEBUG] handleEditWeaponGroupSelect - weaponGroup encontrado (object):', !!weaponGroup);
        }
      }
      
      console.log('[DEBUG] handleEditWeaponGroupSelect - weaponGroup content:', weaponGroup);

      if (!weaponGroup) {
        const weaponsLength = Array.isArray(session.data.weapons) 
          ? session.data.weapons.length 
          : (session.data.weapons ? Object.keys(session.data.weapons).length : 0);
          
        console.log('[ERROR] Grupo no encontrado - groupIndex:', groupIndex, 'weapons length:', weaponsLength);
        const errorEmbed = createErrorEmbed('Grupo no encontrado', `El grupo seleccionado no existe. Grupos disponibles: ${weaponsLength}`);

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
      // Helper para mostrar emojis correctamente
      const renderEmoji = (emojiLike, client, guild) => {
        if (!emojiLike) return '⚔️';
        // Si es unicode (contiene caracteres no dígitos o es corto), devolver tal cual
        if (typeof emojiLike === 'string' && (emojiLike.length <= 3 || /[^\d]/.test(emojiLike))) {
          return emojiLike;
        }
        // Si es un ID numérico, buscar el emoji
        const id = String(emojiLike);
        // Buscar en el cache global del cliente
        let emoji = client?.emojis?.cache?.get(id);
        if (emoji) return emoji.toString();
        // Buscar en el cache del guild si está disponible
        if (guild && guild.emojis && guild.emojis.cache) {
          emoji = guild.emojis.cache.get(id);
          if (emoji) return emoji.toString();
        }
        // Fallback: formato directo de Discord
        return `<:weapon:${id}>`;
      };

      const totalWeapons = (weaponGroup && Array.isArray(weaponGroup.data))
        ? weaponGroup.data.length
        : (weaponGroup && Array.isArray(weaponGroup.categories))
          ? weaponGroup.categories.reduce((total, cat) => total + (cat.weapons?.length || 0), 0)
          : 0;
      const categoryNames = (weaponGroup && Array.isArray(weaponGroup.categories))
        ? weaponGroup.categories.map(cat => cat.name).join(', ')
        : 'Sin categorías';

      const weaponsList = [];
      if (weaponGroup && Array.isArray(weaponGroup.data) && weaponGroup.data.length > 0) {
        weaponGroup.data.forEach(weapon => {
          weaponsList.push(`• ${renderEmoji(weapon.emoji, interaction.client, interaction.guild)} ${weapon.name} (x${weapon.units || 1})`);
        });
      } else if (weaponGroup && Array.isArray(weaponGroup.categories) && weaponGroup.categories.length > 0) {
        weaponGroup.categories.forEach(category => {
          if (category.weapons && category.weapons.length > 0) {
            weaponsList.push(`**${category.name}:**`);
            category.weapons.forEach(weapon => {
              weaponsList.push(`• ${weapon.name} (x${weapon.quantity || weapon.units || 1})`);
            });
          }
        });
      }

      const groupName = weaponGroup.name || weaponGroup.displayName || `Grupo ${groupIndex + 1}`;
      const embed = createInfoEmbed(
        `${renderEmoji(weaponGroup.defaultEmoji, interaction.client, interaction.guild)} ${groupName} - Editor de Armas`,
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

      const modifyWeaponBtn = new ButtonBuilder()
        .setCustomId(`group_modify_weapon_${sessionId}_${groupIndex}`)
        .setLabel('🔧 Modificar Arma')
        .setStyle(ButtonStyle.Secondary)
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
      const row2 = new ActionRowBuilder().addComponents(modifyWeaponBtn, deleteGroupBtn, backButton);

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
          templateId: session.templateId,
          title: session.data.title,
          description: session.data.description,
          image: session.data.image,
          weapons: {}
        },
        tempGroupConfig: null
      };

      createSession(tempSessionId, tempSessionData);

      // Diferir la interacción si es un botón
      if (interaction.isButton()) {
        await safeDeferUpdate(interaction);
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

      const weaponsData = session.data.weapons;
      const weaponGroups = Array.isArray(weaponsData) ? weaponsData : Object.values(weaponsData);
      if (!weaponGroups || weaponGroups.length === 0) {
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

      weaponGroups.forEach((group, index) => {
        const totalWeapons = Array.isArray(group.data)
          ? group.data.length
          : (Array.isArray(group.categories)
              ? group.categories.reduce((sum, cat) => sum + (cat.weapons?.length || 0), 0)
              : 0);
        const labelName = group.displayName || group.name || `Grupo ${index + 1}`;
        const emoji = group.defaultEmoji || '⚔️';
        const option = {
          label: labelName,
          description: `${totalWeapons} armas`,
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

      const weaponsData = session.data.weapons;
      const weaponEntries = Array.isArray(weaponsData) ? weaponsData.map((g, i) => [i, g]) : Object.entries(weaponsData);
      if (!weaponEntries[groupIndex]) {
        const errorEmbed = createErrorEmbed('Grupo no encontrado', 'El grupo seleccionado no existe.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }

      // Eliminar el grupo (soporta objeto y array)
      let deletedGroup;
      if (Array.isArray(weaponsData)) {
        deletedGroup = weaponsData.splice(groupIndex, 1)[0];
      } else {
        const [deletedKey, deletedVal] = weaponEntries[groupIndex];
        deletedGroup = deletedVal;
        delete weaponsData[deletedKey];
      }
      const groupName = deletedGroup.displayName || deletedGroup.name || 'Grupo';

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

      } else if (customId.includes('group_edit_back_to_edit_')) {
        // Volver al editor principal desde una sesión de grupo
        const tempSessionId = customId.replace('group_edit_back_to_edit_', '');
        console.log('[DEBUG] handleGroupEditButton - back to edit tempSessionId:', tempSessionId);

        const validSession = getValidSession(tempSessionId, interaction.user.id, interaction.guild.id);
        if (!validSession) {
          return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
        }

        // Volver a la interface principal de edición
        return await this.showEditWeapons(interaction, tempSessionId);

      } else if (customId.includes('group_edit_back_')) {
        // Volver al editor principal desde una sesión de grupo
        const tempSessionId = customId.replace('group_edit_back_', '');
        console.log('[DEBUG] handleGroupEditButton - back tempSessionId:', tempSessionId);

        const validSession = getValidSession(tempSessionId, interaction.user.id, interaction.guild.id);
        if (!validSession) {
          return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
        }

        // Volver a la interface principal de edición
        return await this.showEditWeapons(interaction, tempSessionId);

      } else if (customId.includes('group_edit_max_players_')) {
        const mpParts = customId.replace('group_edit_max_players_', '').split('_');
        const mpGroupIndex = parseInt(mpParts.pop());
        const mpSessionId = mpParts.join('_');
        return await this.handleEditMaxPlayersGroup(interaction, mpSessionId, mpGroupIndex);

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

  // Mostrar modal para editar max_players de un grupo
  async handleEditMaxPlayersGroup(interaction, sessionId, groupIndex) {
    try {
      const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
      if (!validSession) {
        return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
      }

      const { session } = validSession;
      const weaponGroup = getWeaponGroupFromSession(session, groupIndex);
      if (!weaponGroup) {
        const errorEmbed = createErrorEmbed('Error', 'Grupo de armas no encontrado.');
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      const groupName = weaponGroup.displayName || weaponGroup.name || `Grupo ${groupIndex + 1}`;
      const currentMaxPlayers = weaponGroup.max_players !== undefined ? String(weaponGroup.max_players) : '';

      const modal = new ModalBuilder()
        .setCustomId(`edit_max_players_modal_${sessionId}_${groupIndex}`)
        .setTitle(`Max Players: ${groupName.substring(0, 35)}`);

      const maxPlayersInput = new TextInputBuilder()
        .setCustomId('max_players_value')
        .setLabel('Límite máximo de jugadores')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ej: 7')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(4);

      if (currentMaxPlayers) {
        maxPlayersInput.setValue(currentMaxPlayers);
      }

      modal.addComponents(new ActionRowBuilder().addComponents(maxPlayersInput));
      await interaction.showModal(modal);

    } catch (error) {
      console.error('[ERROR] Error en handleEditMaxPlayersGroup:', error);
      const errorEmbed = createErrorEmbed('Error', 'No se pudo abrir el formulario de edición.');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  // Manejar envío del modal de max_players
  async handleEditMaxPlayersModalSubmit(interaction) {
    try {
      // Format: edit_max_players_modal_${sessionId}_${groupIndex}
      const withoutPrefix = interaction.customId.replace('edit_max_players_modal_', '');
      const lastUnder = withoutPrefix.lastIndexOf('_');
      const groupIndex = parseInt(withoutPrefix.substring(lastUnder + 1));
      const sessionId = withoutPrefix.substring(0, lastUnder);

      const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
      if (!validSession) {
        const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      const { session, sessionId: actualSessionId } = validSession;
      const rawValue = interaction.fields.getTextInputValue('max_players_value').trim();
      const newMaxPlayers = parseInt(rawValue, 10);

      if (isNaN(newMaxPlayers) || newMaxPlayers < 1) {
        const errorEmbed = createErrorEmbed('Error de Validación', 'El límite máximo debe ser un número mayor a 0.');
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      const weaponGroup = getWeaponGroupFromSession(session, groupIndex);
      if (!weaponGroup) {
        const errorEmbed = createErrorEmbed('Error', 'Grupo de armas no encontrado.');
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      const oldMaxPlayers = weaponGroup.max_players;
      weaponGroup.max_players = newMaxPlayers;
      session.hasChanges = true;

      const groupName = weaponGroup.displayName || weaponGroup.name || `Grupo ${groupIndex + 1}`;

      // Advertir si la suma de armas supera el nuevo límite
      const totalWeaponUnits = Array.isArray(weaponGroup.data)
        ? weaponGroup.data.reduce((acc, w) => acc + (parseInt(w.units) || 0), 0)
        : 0;
      const warningText = totalWeaponUnits > newMaxPlayers
        ? `\n\n⚠️ **Aviso:** la suma de cupos de armas (${totalWeaponUnits}) supera el nuevo límite. El grupo seguirá limitado a **${newMaxPlayers}** jugadores; las armas actúan como sub-límites internos.`
        : '';

      const successEmbed = createSuccessEmbed(
        'Max Players Actualizado',
        `El límite máximo del grupo **${groupName}** ha sido actualizado a **${newMaxPlayers}**.${warningText}`,
        [
          { name: 'Grupo', value: groupName, inline: true },
          { name: 'Antes', value: oldMaxPlayers !== undefined ? String(oldMaxPlayers) : 'Auto', inline: true },
          { name: 'Ahora', value: String(newMaxPlayers), inline: true }
        ]
      );

      const backButton = new ButtonBuilder()
        .setCustomId(`back_to_group_${actualSessionId}_${groupIndex}`)
        .setLabel('🔙 Volver al Grupo')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(backButton);
      await interaction.reply({ embeds: [successEmbed], components: [row], ephemeral: true });

    } catch (error) {
      console.error('[ERROR] Error en handleEditMaxPlayersModalSubmit:', error);
      const errorEmbed = createErrorEmbed('Error', 'No se pudo actualizar el límite máximo.');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },

  // Mostrar interfaz de edición para un grupo específico
  async showGroupEditInterface(interaction, tempSessionId, weaponGroup, groupIndex) {
    try {
      // Helper para mostrar emojis correctamente
      const renderEmoji = (emojiLike, client, guild) => {
        if (!emojiLike) return '⚔️';
        // Si es unicode (contiene caracteres no dígitos o es corto), devolver tal cual
        if (typeof emojiLike === 'string' && (emojiLike.length <= 3 || /[^\d]/.test(emojiLike))) {
          return emojiLike;
        }
        // Si es un ID numérico, buscar el emoji
        const id = String(emojiLike);
        // Buscar en el cache global del cliente
        let emoji = client?.emojis?.cache?.get(id);
        if (emoji) return emoji.toString();
        // Buscar en el cache del guild si está disponible
        if (guild && guild.emojis && guild.emojis.cache) {
          emoji = guild.emojis.cache.get(id);
          if (emoji) return emoji.toString();
        }
        // Fallback: formato directo de Discord
        return `<:weapon:${id}>`;
      };

      const totalWeapons = (weaponGroup && Array.isArray(weaponGroup.data))
        ? weaponGroup.data.length
        : (weaponGroup && Array.isArray(weaponGroup.categories))
          ? weaponGroup.categories.reduce((total, cat) => total + (cat.weapons?.length || 0), 0)
          : 0;
      const categoryNames = (weaponGroup && Array.isArray(weaponGroup.categories))
        ? weaponGroup.categories.map(cat => cat.name).join(', ')
        : 'Sin categorías';

      const groupName = weaponGroup.displayName || weaponGroup.name || `Grupo ${groupIndex + 1}`;
      const maxPlayersDisplay = weaponGroup.max_players !== undefined ? String(weaponGroup.max_players) : 'Auto (suma de armas)';
      const embed = new EmbedBuilder()
        .setTitle(`${renderEmoji(weaponGroup.defaultEmoji, interaction.client, interaction.guild)} Editar ${groupName}`)
        .setDescription('Administra las armas de este grupo. Puedes añadir más armas, eliminar existentes o modificar cantidades.')
        .setColor(0x00FFFF)
        .addFields([
          {
            name: 'Contenido Actual',
            value: `**${totalWeapons}** armas configuradas\n**Límite máximo:** ${maxPlayersDisplay}\n**Categorías:** ${categoryNames}`,
            inline: false
          }
        ]);

      // Mostrar lista detallada de armas si hay pocas
      if (totalWeapons <= 10 && totalWeapons > 0) {
        const weaponsList = [];
        if (weaponGroup && Array.isArray(weaponGroup.data)) {
          weaponGroup.data.forEach(weapon => {
            weaponsList.push(`• ${renderEmoji(weapon.emoji, interaction.client, interaction.guild)} ${weapon.name} (x${weapon.units || 1})`);
          });
        } else if (weaponGroup && Array.isArray(weaponGroup.categories)) {
          weaponGroup.categories.forEach(category => {
            if (category.weapons && category.weapons.length > 0) {
              weaponsList.push(`**${category.name}:**`);
              category.weapons.forEach(weapon => {
                weaponsList.push(`• ${weapon.name} (x${weapon.quantity || weapon.units || 1})`);
              });
            }
          });
        }

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
            .setLabel('Añadir Armas')
            .setStyle(ButtonStyle.Success)
            .setEmoji('➕'),
          new ButtonBuilder()
            .setCustomId(`group_edit_remove_weapons_${tempSessionId}_${groupIndex}`)
            .setLabel('Quitar Armas')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
          new ButtonBuilder()
            .setCustomId(`group_modify_weapon_${tempSessionId}_${groupIndex}`)
            .setLabel('🔧 Modificar Arma')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(totalWeapons === 0)
        );

      const buttonRow2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`group_edit_max_players_${tempSessionId}_${groupIndex}`)
            .setLabel('Max Players')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),
          new ButtonBuilder()
            .setCustomId(`group_edit_finish_${tempSessionId}`)
            .setLabel('Guardar Cambios')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅')
        );

      const backButtonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`group_edit_back_${tempSessionId}`)
            .setLabel('Volver al Editor')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
        );

      // Preferimos actualizar el mensaje original si la interacción proviene de un componente
      if ((interaction.isButton?.() || interaction.isStringSelectMenu?.()) && !interaction.deferred && !interaction.replied) {
        await interaction.update({
          embeds: [embed],
          components: [buttonRow, buttonRow2, backButtonRow]
        });
      } else if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          embeds: [embed],
          components: [buttonRow, buttonRow2, backButtonRow]
        });
      } else {
        await interaction.reply({
          embeds: [embed],
          components: [buttonRow, buttonRow2, backButtonRow],
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

  // Mostrar vista previa del template editado (ELIMINADO)
  // async showEditPreview(interaction, sessionId) { }

  // Función para manejar el select menu de actualización de cantidades
  handleUpdateQuantitySelect: async function(interaction) {
  try {
    const customIdParts = interaction.customId.replace('update_quantity_select_', '').split('_');
    const groupIndex = parseInt(customIdParts.pop());
    const sessionId = customIdParts.join('_');
    const selectedIndexes = interaction.values.map(v => parseInt(v));

    console.log('[DEBUG] handleUpdateQuantitySelect - sessionId:', sessionId, 'groupIndex:', groupIndex, 'selections:', selectedIndexes);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const { session } = validSession;
    const weaponsData = session.tempWeaponQuantityData;

    if (!weaponsData || selectedIndexes.length === 0) {
      return await interaction.reply({ content: 'No se encontraron armas seleccionadas.', ephemeral: true });
    }

    // Crear modal para actualizar cantidades
    const modal = new ModalBuilder()
      .setCustomId(`update_weapon_quantities_${sessionId}_${groupIndex}`)
      .setTitle('📊 Actualizar Cantidades');

    // Añadir inputs para cada arma seleccionada (máximo 5 por limitaciones de Discord)
    const selectedWeapons = selectedIndexes.slice(0, 5).map(index => weaponsData[index]);
    
    selectedWeapons.forEach((weaponData, index) => {
      const input = new TextInputBuilder()
        .setCustomId(`quantity_${index}`)
        .setLabel(`${weaponData.displayName}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Cantidad actual: ${weaponData.currentQuantity}`)
        .setValue(weaponData.currentQuantity.toString())
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);
    });

    // Almacenar las armas seleccionadas en la sesión
    session.tempSelectedWeaponsForQuantity = selectedWeapons;

    await interaction.showModal(modal);

  } catch (error) {
      console.error('Error en handleUpdateQuantitySelect:', error);
      const errorEmbed = createErrorEmbed('Error', 'No se pudo procesar la selección de armas.');
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Función para manejar el modal de añadir enlace de arma
  handleAddWeaponLinkModal: async function(interaction) {
  try {
    const customId = interaction.customId;
    const parts = customId.replace('add_weapon_link_', '').split('_');
    const groupIndex = parseInt(parts.pop());
    const sessionId = parts.join('_');

    const weaponLink = interaction.fields.getTextInputValue('weapon_link');
    const quantityStr = interaction.fields.getTextInputValue('weapon_quantity') || '1';
    const privateStr = interaction.fields.getTextInputValue('weapon_private') || 'no';

    const quantity = parseInt(quantityStr) || 1;
    const isPrivate = privateStr.toLowerCase().includes('sí') || privateStr.toLowerCase().includes('si') || privateStr.toLowerCase().includes('yes');

    console.log('[DEBUG] handleAddWeaponLinkModal - sessionId:', sessionId, 'groupIndex:', groupIndex);
    console.log('[DEBUG] weaponLink:', weaponLink, 'quantity:', quantity, 'isPrivate:', isPrivate);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const { session } = validSession;
    
    console.log('[DEBUG] handleConfirmDeleteWeapon - session.data:', session.data);
    console.log('[DEBUG] handleConfirmDeleteWeapon - groupIndex:', groupIndex, 'weapons type:', typeof session.data.weapons);
    
    const weaponGroup = getWeaponGroupFromSession(session, groupIndex);

    if (!weaponGroup) {
      console.log('[ERROR] handleConfirmDeleteWeapon - weaponGroup not found. Available groups:', session.data.weapons);
      const errorEmbed = createErrorEmbed('Error', 'No se pudo encontrar el grupo de armas. Por favor, reinicia la edición del template.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Eliminar el arma según la estructura de datos
    const newWeapon = {
      id: Date.now().toString(),
      name: 'Arma personalizada',
      code: weaponLink,
      quantity: quantity,
      units: quantity,
      emoji: '🔗',
      emojiId: null,
      image: null,
      url: weaponLink,
      sendBuildToPrivate: isPrivate
    };

    // Añadir el arma al grupo
    if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
      // Estructura con categorías - añadir a la primera categoría o crear una nueva
      if (weaponGroup.categories.length === 0) {
        weaponGroup.categories.push({
          name: 'Enlaces personalizados',
          weapons: [newWeapon]
        });
      } else {
        weaponGroup.categories[0].weapons.push(newWeapon);
      }
    } else if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
      // Estructura sin categorías
      weaponGroup.data.push(newWeapon);
    } else {
      // Crear estructura básica
      weaponGroup.data = [newWeapon];
    }

    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Enlace Añadido')
      .setDescription(`Se añadió el enlace personalizado al grupo **${weaponGroup.name || weaponGroup.displayName || `Grupo ${groupIndex + 1}`}**`)
      .addFields([
        { name: 'Enlace', value: weaponLink, inline: false },
        { name: 'Cantidad', value: quantity.toString(), inline: true },
        { name: 'Envío privado', value: isPrivate ? 'Sí' : 'No', inline: true }
      ]);

    const backBtn = new ButtonBuilder()
      .setCustomId(`group_edit_${sessionId}_${groupIndex}`)
      .setLabel('← Volver al Grupo')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(backBtn);

    await interaction.reply({
      embeds: [successEmbed],
      components: [row],
      ephemeral: true
    });

  } catch (error) {
      console.error('Error en handleAddWeaponLinkModal:', error);
      const errorEmbed = createErrorEmbed('Error', 'No se pudo añadir el enlace de arma.');
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Función para manejar el modal de actualizar cantidades
  handleUpdateWeaponQuantitiesModal: async function(interaction) {
  try {
    const customId = interaction.customId;
    const parts = customId.replace('update_weapon_quantities_', '').split('_');
    const groupIndex = parseInt(parts.pop());
    const sessionId = parts.join('_');

    console.log('[DEBUG] handleUpdateWeaponQuantitiesModal - sessionId:', sessionId, 'groupIndex:', groupIndex);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const { session } = validSession;
    const selectedWeapons = session.tempSelectedWeaponsForQuantity;

    if (!selectedWeapons) {
      return await interaction.reply({ content: 'No se encontraron armas seleccionadas.', ephemeral: true });
    }

    // Validar que el grupo existe antes de operar
    const validation = await getAndValidateWeaponGroup(session, groupIndex, interaction, 'añadir armas');
    if (!validation.success) {
      const errorEmbed = createErrorEmbed('Grupo no encontrado', validation.error);
      if (validation.suggestion) {
        errorEmbed.addFields([{ name: 'Sugerencia', value: validation.suggestion, inline: false }]);
      }
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponGroup = validation.group;
    console.log(`[DEBUG] Añadiendo armas al grupo: ${validation.groupName}`);

    let updatedCount = 0;
    const updates = [];

    // Procesar cada arma seleccionada
    selectedWeapons.forEach((weaponData, index) => {
      try {
        const newQuantityStr = interaction.fields.getTextInputValue(`quantity_${index}`);
        const newQuantity = parseInt(newQuantityStr) || 1;

        if (newQuantity !== weaponData.currentQuantity) {
          // Actualizar la cantidad en la estructura de datos
          if (weaponData.categoryIndex !== null) {
            // Estructura con categorías
            const weapon = weaponGroup.categories[weaponData.categoryIndex].weapons[weaponData.weaponIndex];
            weapon.quantity = newQuantity;
            weapon.units = newQuantity;
          } else {
            // Estructura sin categorías
            const weapon = weaponGroup.data[weaponData.weaponIndex];
            weapon.quantity = newQuantity;
            weapon.units = newQuantity;
          }

          updates.push(`• ${weaponData.displayName}: ${weaponData.currentQuantity} → ${newQuantity}`);
          updatedCount++;
        }
      } catch (fieldError) {
        console.error(`Error procesando campo ${index}:`, fieldError);
      }
    });

    // Limpiar datos temporales
    delete session.tempSelectedWeaponsForQuantity;
    delete session.tempWeaponQuantityData;

    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Cantidades Actualizadas')
      .setDescription(`Se actualizaron **${updatedCount}** arma(s) en el grupo **${weaponGroup.name || weaponGroup.displayName || `Grupo ${groupIndex + 1}`}**`)
      .addFields([
        {
          name: 'Cambios realizados',
          value: updates.length > 0 ? updates.join('\n') : 'No se realizaron cambios',
          inline: false
        }
      ]);

    const backBtn = new ButtonBuilder()
      .setCustomId(`group_edit_${sessionId}_${groupIndex}`)
      .setLabel('← Volver al Grupo')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(backBtn);

    await interaction.reply({
      embeds: [successEmbed],
      components: [row],
      ephemeral: true
    });

  } catch (error) {
      console.error('Error en handleUpdateWeaponQuantitiesModal:', error);
      const errorEmbed = createErrorEmbed('Error', 'No se pudieron actualizar las cantidades.');
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
};

// Función para manejar añadir enlace de arma
async function handleModifyAddLink(interaction) {
      try {
        const customId = interaction.customId;
        const parts = customId.replace('modify_add_link_', '').split('_');
        const groupIndex = parseInt(parts.pop());
        const sessionId = parts.join('_');

    console.log('[DEBUG] handleModifyAddLink - sessionId:', sessionId, 'groupIndex:', groupIndex);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    // Crear modal para añadir enlace de arma
    const modal = new ModalBuilder()
      .setCustomId(`add_weapon_link_${sessionId}_${groupIndex}`)
      .setTitle('🔗 Añadir Enlace de Arma');

    const weaponLinkInput = new TextInputBuilder()
      .setCustomId('weapon_link')
      .setLabel('Enlace del Arma')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://example.com/weapon-link')
      .setRequired(true);

    const quantityInput = new TextInputBuilder()
      .setCustomId('weapon_quantity')
      .setLabel('Cantidad')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1')
      .setValue('1')
      .setRequired(false);

    const privateInput = new TextInputBuilder()
      .setCustomId('weapon_private')
      .setLabel('¿Envío privado? (sí/no)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('no')
      .setValue('no')
      .setRequired(false);

    const linkRow = new ActionRowBuilder().addComponents(weaponLinkInput);
    const quantityRow = new ActionRowBuilder().addComponents(quantityInput);
    const privateRow = new ActionRowBuilder().addComponents(privateInput);

    modal.addComponents(linkRow, quantityRow, privateRow);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Error en handleModifyAddLink:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo mostrar el formulario para añadir enlace.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

// Función para manejar actualizar cantidades
async function handleModifyUpdateQuantities(interaction) {
  try {
    const customId = interaction.customId;
    const parts = customId.replace('modify_update_quantities_', '').split('_');
    const groupIndex = parseInt(parts.pop());
    const sessionId = parts.join('_');

    console.log('[DEBUG] handleModifyUpdateQuantities - sessionId:', sessionId, 'groupIndex:', groupIndex);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const { session } = validSession;
    const weaponGroup = getWeaponGroupFromSession(session, groupIndex);

    if (!weaponGroup) {
      return await interaction.reply({ content: 'Grupo de armas no encontrado.', ephemeral: true });
    }

    // Recopilar todas las armas del grupo
    let allWeapons = [];
    
    if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
      // Estructura con categorías
      weaponGroup.categories.forEach((category, catIndex) => {
        if (category.weapons && Array.isArray(category.weapons)) {
          category.weapons.forEach((weapon, weaponIndex) => {
            allWeapons.push({
              weapon,
              categoryIndex: catIndex,
              weaponIndex,
              displayName: `${weapon.name} (${category.name})`,
              currentQuantity: weapon.quantity || weapon.units || 1
            });
          });
        }
      });
    } else if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
      // Estructura sin categorías
      weaponGroup.data.forEach((weapon, weaponIndex) => {
        allWeapons.push({
          weapon,
          categoryIndex: null,
          weaponIndex,
          displayName: weapon.name,
          currentQuantity: weapon.quantity || weapon.units || 1
        });
      });
    }

    if (allWeapons.length === 0) {
      return await interaction.reply({ content: 'No hay armas en este grupo para modificar.', ephemeral: true });
    }

    // Crear select menu para elegir armas
    const options = allWeapons.slice(0, 25).map((item, index) => ({
      label: item.displayName,
      value: `${index}`,
      description: `Cantidad actual: ${item.currentQuantity}`,
      emoji: item.weapon.emoji || '🗡️'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`update_quantity_select_${sessionId}_${groupIndex}`)
      .setPlaceholder('Selecciona las armas para actualizar cantidades')
      .addOptions(options)
      .setMaxValues(Math.min(options.length, 10));

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('📊 Actualizar Cantidades')
      .setDescription(`**Grupo:** ${weaponGroup.name || weaponGroup.displayName || `Grupo ${groupIndex + 1}`}\n\nSelecciona las armas cuyas cantidades deseas modificar:`);

    const backBtn = new ButtonBuilder()
      .setCustomId(`modify_weapon_${sessionId}_${groupIndex}`)
      .setLabel('← Volver')
      .setStyle(ButtonStyle.Secondary);

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);
    const buttonRow = new ActionRowBuilder().addComponents(backBtn);

    // Almacenar las armas en la sesión para uso posterior
    session.tempWeaponQuantityData = allWeapons;

    await interaction.reply({
      embeds: [embed],
      components: [selectRow, buttonRow],
      ephemeral: true
    });

  } catch (error) {
    console.error('Error en handleModifyUpdateQuantities:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo mostrar las opciones para actualizar cantidades.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

// Función para manejar actualizar cantidades
async function handleModifyUpdateQuantities(interaction) {
  try {
    const customId = interaction.customId;
    const parts = customId.replace('modify_update_quantities_', '').split('_');
    const groupIndex = parseInt(parts.pop());
    const sessionId = parts.join('_');

    console.log('[DEBUG] handleModifyUpdateQuantities - sessionId:', sessionId, 'groupIndex:', groupIndex);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const { session } = validSession;
    const weaponGroup = getWeaponGroupFromSession(session, groupIndex);

    if (!weaponGroup) {
      return await interaction.reply({ content: 'Grupo de armas no encontrado.', ephemeral: true });
    }

    // Recopilar todas las armas del grupo
    let allWeapons = [];
    
    if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
      // Estructura con categorías
      weaponGroup.categories.forEach((category, catIndex) => {
        if (category.weapons && Array.isArray(category.weapons)) {
          category.weapons.forEach((weapon, weaponIndex) => {
            allWeapons.push({
              weapon,
              categoryIndex: catIndex,
              weaponIndex,
              displayName: `${weapon.name} (${category.name})`,
              currentQuantity: weapon.quantity || weapon.units || 1
            });
          });
        }
      });
    } else if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
      // Estructura sin categorías
      weaponGroup.data.forEach((weapon, weaponIndex) => {
        allWeapons.push({
          weapon,
          categoryIndex: null,
          weaponIndex,
          displayName: weapon.name,
          currentQuantity: weapon.quantity || weapon.units || 1
        });
      });
    }

    if (allWeapons.length === 0) {
      return await interaction.reply({ content: 'No hay armas en este grupo para modificar.', ephemeral: true });
    }

    // Crear select menu para elegir armas
    const options = allWeapons.slice(0, 25).map((item, index) => ({
      label: item.displayName,
      value: `${index}`,
      description: `Cantidad actual: ${item.currentQuantity}`,
      emoji: item.weapon.emoji || '🗡️'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`update_quantity_select_${sessionId}_${groupIndex}`)
      .setPlaceholder('Selecciona las armas para actualizar cantidades')
      .addOptions(options)
      .setMaxValues(Math.min(options.length, 10));

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('📊 Actualizar Cantidades')
      .setDescription(`**Grupo:** ${weaponGroup.name || weaponGroup.displayName || `Grupo ${groupIndex + 1}`}\n\nSelecciona las armas cuyas cantidades deseas modificar:`);

    const backBtn = new ButtonBuilder()
      .setCustomId(`modify_weapon_${sessionId}_${groupIndex}`)
      .setLabel('← Volver')
      .setStyle(ButtonStyle.Secondary);

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);
    const buttonRow = new ActionRowBuilder().addComponents(backBtn);

    // Almacenar las armas en la sesión para uso posterior
    session.tempWeaponQuantityData = allWeapons;

    await interaction.reply({
      embeds: [embed],
      components: [selectRow, buttonRow],
      ephemeral: true
    });

  } catch (error) {
    console.error('Error en handleModifyUpdateQuantities:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo mostrar las opciones para actualizar cantidades.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

const templateModule = {
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
      // Extraer sessionId y groupIndex correctamente
      const match = customId.match(/group_add_weapon_(.+)_(\d+)$/);
      if (match) {
        sessionId = match[1];
        groupIndex = parseInt(match[2]);
      } else {
        throw new Error(`Formato de customId group_add_weapon no válido: ${customId}`);
      }
    } else if (customId.includes('group_edit_weapon_')) {
      // Format: group_edit_weapon_sessionId_groupIndex
      action = 'edit_weapon';
      const match = customId.match(/group_edit_weapon_(.+)_(\d+)$/);
      if (match) {
        sessionId = match[1];
        groupIndex = parseInt(match[2]);
      } else {
        throw new Error(`Formato de customId group_edit_weapon no válido: ${customId}`);
      }
    } else if (customId.includes('group_remove_weapon_')) {
      // Format: group_remove_weapon_sessionId_groupIndex
      action = 'remove_weapon';
      const match = customId.match(/group_remove_weapon_(.+)_(\d+)$/);
      if (match) {
        sessionId = match[1];
        groupIndex = parseInt(match[2]);
      } else {
        throw new Error(`Formato de customId group_remove_weapon no válido: ${customId}`);
      }
    } else if (customId.includes('group_modify_weapon_')) {
      // Format: group_modify_weapon_sessionId_groupIndex
      action = 'modify_weapon';
      const match = customId.match(/group_modify_weapon_(.+)_(\d+)$/);
      if (match) {
        sessionId = match[1];
        groupIndex = parseInt(match[2]);
      } else {
        throw new Error(`Formato de customId group_modify_weapon no válido: ${customId}`);
      }
    } else if (customId.includes('group_delete_')) {
      // Format: group_delete_sessionId_groupIndex
      action = 'delete';
      const match = customId.match(/group_delete_(.+)_(\d+)$/);
      if (match) {
        sessionId = match[1];
        groupIndex = parseInt(match[2]);
      } else {
        throw new Error(`Formato de customId group_delete no válido: ${customId}`);
      }
    } else if (customId.startsWith('group_edit_') && customId.match(/group_edit_(.+)_(\d+)$/)) {
      // Format: group_edit_sessionId_groupIndex (botón "Volver" desde modify weapon select)
      action = 'show_group_interface';
      const match = customId.match(/group_edit_(.+)_(\d+)$/);
      if (match) {
        sessionId = match[1];
        groupIndex = parseInt(match[2]);
      } else {
        throw new Error(`Formato de customId group_edit no válido: ${customId}`);
      }
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
      case 'modify_weapon':
        return await handleModifyWeaponInGroup(interaction, actualSessionId, groupIndex);
      case 'delete':
        return await handleDeleteGroup(interaction, actualSessionId, groupIndex);
      case 'show_group_interface':
        // Necesitamos obtener el weaponGroup para pasarlo a showGroupEditInterface
      const weaponGroup = getWeaponGroupFromSession(session, groupIndex);
      if (!weaponGroup) {
        const errorEmbed = createErrorEmbed('Error', 'Grupo de armas no encontrado.');
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
      return await showGroupEditInterface(interaction, actualSessionId, weaponGroup, groupIndex);
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
      await safeDeferUpdate(interaction);
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

    const targetGroup = Array.isArray(session.data.weapons)
        ? session.data.weapons[groupIndex]
        : Object.entries(session.data.weapons)[groupIndex]?.[1];
      const groupLabel = targetGroup?.name || targetGroup?.displayName || `Grupo ${groupIndex + 1}`;

      const embed = createInfoEmbed(
      '🚮 Confirmar Eliminación',
      `¿Estás seguro de que deseas eliminar el grupo **${groupLabel}** completo?\n\nEsta acción no se puede deshacer.`
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
// Referencia al módulo principal

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
    if (!weaponGroup.data) {
      weaponGroup.data = [];
    }

    // Añadir el arma directamente al array data
    const newWeapon = {
      name: weaponName,
      units: weaponQuantity,
      emoji: weaponEmoji,
      image: '',
      url: '',
      sendBuildToPrivate: false
    };

    weaponGroup.data.push(newWeapon);

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
        content: 'No hay armas disponibles para seleccionar emoji. Usa el CLI para cargar armas primero.',
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
      await safeDeferUpdate(interaction);
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
      displayName: tempData.name,
      defaultEmoji: weaponEmoji || '⚔️',
      data: []
    };

    // Añadir al template usando formato de objeto (como en 000002.json)
    if (!session.data.weapons) {
      session.data.weapons = {};
    }

    // Si por compatibilidad llegó en formato array, convertirlo a objeto
    if (Array.isArray(session.data.weapons)) {
      const obj = {};
      session.data.weapons.forEach((g, idx) => {
        const base = (g.displayName || g.name || `grupo_${idx + 1}`).toString().trim().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        let key = base || `grupo_${idx + 1}`;
        let c = 1;
        while (obj[key]) { key = `${base}_${c++}`; }
        obj[key] = g;
      });
      session.data.weapons = obj;
    }

    // Generar clave única para el nuevo grupo basada en el nombre
    const baseKey = tempData.name.toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    let newKey = baseKey || `grupo_${Date.now()}`;
    let i = 1;
    while (session.data.weapons[newKey]) { newKey = `${baseKey}_${i++}`; }

    session.data.weapons[newKey] = newGroup;

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

    // Refrescar inmediatamente el embed de edición para mostrar el nuevo grupo
    return await templateModule.showEditWeapons(interaction, actualSessionId);

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

    // Preservar el ID original si existe
    const originalId = weapon.id;
    const originalEmojiId = weapon.emojiId;

    weapon.name = weaponName;
    weapon.quantity = weaponQuantity;
    weapon.emoji = weaponEmoji;
    // Compatibilidad
    weapon.units = weaponQuantity;
    // Preservar emojiId original si existe, sino usar el nuevo emoji
    weapon.emojiId = originalEmojiId || weaponEmoji;
    // Preservar ID original
    if (originalId) {
      weapon.id = originalId;
    }

    // Marcar que hay cambios para poder guardar
    session.hasChanges = true;

    const successEmbed = createSuccessEmbed('✅ Arma Actualizada', `**${weaponName}** ha sido actualizada exitosamente.\n\n📊 **Detalles:**\n• Cantidad: ${weaponQuantity}\n• Emoji: ${weaponEmoji}\n• Privado: ${isPrivate ? 'Sí' : 'No'}`);

    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
      .setLabel('← Volver al Grupo')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔙');

    const editAnotherButton = new ButtonBuilder()
      .setCustomId(`group_modify_weapon_${sessionId}_${groupIndex}`)
      .setLabel('Modificar Otra Arma')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔧');

    const row = new ActionRowBuilder()
      .addComponents(backButton, editAnotherButton);

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
    console.log('[DEBUG] handleBackToGroup - parts:', parts);
    
    // El sessionId puede contener guiones bajos, así que necesitamos reconstruirlo
    const actionParts = 3; // back_to_group tiene 3 partes
    const lastPart = parts[parts.length - 1]; // El último es groupIndex
    const groupIndex = parseInt(lastPart);
    const sessionId = parts.slice(actionParts, -1).join('_'); // Todo lo que está entre la acción y el último número
    
    console.log('[DEBUG] handleBackToGroup - sessionId:', sessionId, 'groupIndex:', groupIndex);

    const session = templateEditSessions.get(sessionId);
    if (!session) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponGroup = session.data.weapons && session.data.weapons[groupIndex];
    if (!weaponGroup) {
      console.log('[ERROR] handleBackToGroup - weaponGroup not found. Available groups:', session.data.weapons);
      const errorEmbed = createErrorEmbed('Error', 'No se pudo encontrar el grupo de armas. Por favor, reinicia la edición del template.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    await templateModule.showGroupEditInterface(interaction, sessionId, weaponGroup, groupIndex);

  } catch (error) {
    console.error('Error al volver al grupo:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo regresar al grupo.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
};

// Función para guardar cambios del template
templateModule.saveTemplateChanges = async function(interaction, sessionId) {
  try {
    console.log('[DEBUG] saveTemplateChanges - sessionId:', sessionId);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const { session } = validSession;

    if (!session.hasChanges) {
      const embed = new EmbedBuilder()
        .setTitle('ℹ️ Sin cambios')
        .setDescription('No hay cambios pendientes para guardar.')
        .setColor('#FFA500');
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Función para limpiar emojis personalizados y evitar duplicados
    const cleanEmojiData = (data) => {
      if (typeof data === 'string') {
        // Si es un emoji personalizado con formato <:name:id>, extraer solo el ID
        const emojiMatch = data.match(/<:[^:]+:(\d+)>/);
        if (emojiMatch) {
          return emojiMatch[1]; // Retornar solo el ID numérico
        }
        return data; // Si no es emoji personalizado, retornar tal como está
      }
      
      if (Array.isArray(data)) {
        return data.map(item => cleanEmojiData(item));
      }
      
      if (data && typeof data === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(data)) {
          // Filtrar parámetros no permitidos
          if (key === 'id' || key === 'code' || key === 'quantity' || key === 'private') {
            // Omitir estos parámetros completamente
            continue;
          }
          
          // Convertir emojiId a emoji y limpiar duplicados
          if (key === 'emojiId') {
            // Convertir emojiId a emoji para mantener consistencia con el modelo
            cleaned['emoji'] = cleanEmojiData(value);
          } else if (key === 'emoji') {
            cleaned[key] = cleanEmojiData(value);
          } else if (key === 'defaultEmoji') {
            cleaned[key] = cleanEmojiData(value);
          } else if (key === 'url') {
            // Priorizar 'url' sobre 'link' según el modelo de MongoDB
            cleaned[key] = cleanEmojiData(value);
          } else if (key === 'link') {
            // Solo agregar 'link' si no existe el campo 'url'
            if (!data.hasOwnProperty('url')) {
              cleaned['url'] = cleanEmojiData(value); // Convertir 'link' a 'url'
            }
            // Si existe 'url', omitir 'link' para evitar duplicados
          } else {
            cleaned[key] = cleanEmojiData(value);
          }
        }
        return cleaned;
      }
      
      return data;
    };

    // Limpiar los datos antes de guardar
    const cleanedData = cleanEmojiData(session.data);
    
    // Aplicar limpieza final de datos para MongoDB
    const finalData = cleanForMongoDB(cleanedData);

    // Normalizar cada grupo al formato canónico "data" (por si quedó en el
    // formato legacy "categories") y garantizar que tenga max_players definido.
    // Sin esto, un grupo en formato "categories" queda ilegible para el
    // renderizador del raid y desaparece del embed en silencio.
    if (finalData.weapons && typeof finalData.weapons === 'object') {
      for (const key of Object.keys(finalData.weapons)) {
        const group = finalData.weapons[key];
        if (!group || typeof group !== 'object') continue;
        const normalized = normalizeGroupToData(group);
        if (group.max_players !== undefined && group.max_players !== null) {
          normalized.max_players = group.max_players;
        } else {
          normalized.max_players = computeGroupMaxPlayers(normalized);
        }
        finalData.weapons[key] = normalized;
      }
    }
    
    // Actualizar el template en la base de datos
    await updateTemplate(session.templateId, finalData);

    // Limpiar la sesión
    templateEditSessions.delete(sessionId);

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Template Guardado')
      .setDescription(`El template **${finalData.title || session.data.title || 'undefined'}** ha sido guardado exitosamente.`)
      .setColor('#00FF00');

    await interaction.reply({ embeds: [successEmbed], ephemeral: true });

  } catch (error) {
    console.error('[ERROR] Error en saveTemplateChanges:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudieron guardar los cambios del template.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
};

// Mostrar interfaz para eliminar armas de un grupo
async function showRemoveWeaponsInterface(interaction, sessionId, groupIndex, session) {
  try {
    console.log('[DEBUG] showRemoveWeaponsInterface - sessionId:', sessionId, 'groupIndex:', groupIndex);

    if (!session.data.weapons) {
      return await interaction.reply({
        content: 'No se encontró el grupo de armas especificado.',
        ephemeral: true
      });
    }

    const weaponGroup = Array.isArray(session.data.weapons)
      ? session.data.weapons[groupIndex]
      : Object.entries(session.data.weapons)[groupIndex]?.[1];

    if (!weaponGroup) {
      return await interaction.reply({
        content: 'No se encontró el grupo de armas especificado.',
        ephemeral: true
      });
    }
    const allWeapons = [];

    // Recopilar todas las armas del grupo con sus categorías
    if (weaponGroup.categories) {
      weaponGroup.categories.forEach((category, catIndex) => {
        if (category.weapons) {
          category.weapons.forEach((weapon, weaponIndex) => {
            const option = {
              label: `${weapon.name} (${category.name})`,
              value: `${catIndex}_${weaponIndex}`,
              description: `${category.name}`
            };

            // Agregar emoji si existe
            const emojiId = weapon.emoji || weapon.emojiId;
            if (emojiId) {
              if (/^\d{15,20}$/.test(String(emojiId))) {
                option.emoji = { id: String(emojiId) };
              } else if (/^\d+$/.test(String(emojiId))) {
                option.emoji = { id: String(emojiId) };
              } else {
                option.emoji = { name: String(emojiId) };
              }
            }

            allWeapons.push(option);
          });
        }
      });
    }

    // También manejar la estructura weaponGroup.data (formato nuevo)
    if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
      weaponGroup.data.forEach((weapon, weaponIndex) => {
        const option = {
          label: `${getItemLabel(weapon)}`,
          value: `data_${weaponIndex}`, // Usar prefijo 'data_' para distinguir
          description: `Arma del grupo`
        };

        // Agregar emoji si existe
        const emojiId = weapon.emoji || weapon.emojiId;
        if (emojiId) {
          if (/^\d{15,20}$/.test(String(emojiId))) {
            option.emoji = { id: String(emojiId) };
          } else if (/^\d+$/.test(String(emojiId))) {
            option.emoji = { id: String(emojiId) };
          } else {
            option.emoji = { name: String(emojiId) };
          }
        }

        allWeapons.push(option);
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

    const targetGroup = Array.isArray(session.data.weapons)
      ? session.data.weapons[groupIndex]
      : Object.entries(session.data.weapons)[groupIndex]?.[1];

    const embed = new EmbedBuilder()
      .setTitle(`🗑️ Eliminar Armas de ${targetGroup?.name || targetGroup?.displayName || `Grupo ${groupIndex + 1}`}`)
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
              content: 'No hay armas disponibles. Usa el CLI para cargar armas primero.',
              ephemeral: true
            });
          }
        } catch (fallbackError) {
          console.error('[DEBUG] Error cargando armas del sistema:', fallbackError);
          return await interaction.reply({
            content: 'No hay armas disponibles. Usa el CLI para cargar armas primero.',
            ephemeral: true
          });
        }
      }
    }

    // Verificar si finalmente tenemos categorías
    if (!categories || !categories.length) {
      return await interaction.reply({
        content: 'No hay armas disponibles. Usa el CLI para cargar armas primero.',
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

    const targetGroup = Array.isArray(session.data.weapons)
      ? session.data.weapons[groupIndex]
      : Object.entries(session.data.weapons)[groupIndex]?.[1];

    const embed = new EmbedBuilder()
      .setTitle(`➕ Añadir Armas a ${targetGroup?.name || targetGroup?.displayName || `Grupo ${groupIndex + 1}`}`)
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

    // Usar la misma función que template create para cargar categorías
    const { getWeaponCategories } = require('../../services/weaponService');
    const fs = require('fs');
    const path = require('path');

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

    const categories = await getWeaponCategoriesWithFallback();
    console.log('[DEBUG] showWeaponCategorySelectionForEdit - Categorías encontradas:', categories.length);

    // Verificar si tenemos categorías
    if (!categories.length) {
      return await interaction.reply({
        content: 'No hay categorías de armas disponibles. Usa el CLI para cargar armas primero.',
        ephemeral: true
      });
    }

    // Crear select menu con las categorías
    const categoryOptions = categories.slice(0, 25).map(category => {
      console.log('[DEBUG] Procesando categoría:', category.displayName || category.key);

      return {
        label: category.displayName || category.key,
        value: category.key || category._id?.toString(),
        description: `Categoría de armas`,
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

    // Usar la misma función que template create para cargar armas
    const { getAllWeapons } = require('../../services/weaponService');
    const fs = require('fs');
    const path = require('path');

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

        // Extraer armas del formato JSON
        for (const [category, categoryData] of Object.entries(weaponsData.weapons)) {
          if (categoryData.data && Array.isArray(categoryData.data)) {
            categoryData.data.forEach(weapon => {
              if (weapon.name && weapon.emoji) {
                weapons.push({
                  name: weapon.name,
                  category: category,
                  categoryDisplayName: categoryData.displayName,
                  emojiId: weapon.emoji,
                  code: weapon.code || weapon.name
                });
              }
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

    // Cargar todas las armas y filtrar por categoría
    const allWeapons = await getWeaponsWithFallback();
    const categoryWeapons = allWeapons.filter(weapon => weapon.category === categoryId);

    console.log(`[DEBUG] handleCategorySelectForGroup: Found ${categoryWeapons.length} weapons in category ${categoryId}`);

    if (categoryWeapons.length === 0) {
      return await interaction.reply({
        content: 'No se encontraron armas en esta categoría.',
        ephemeral: true
      });
    }

    // Crear la estructura de categoría
    const category = {
      _id: categoryId,
      displayName: categoryWeapons[0].categoryDisplayName || categoryId,
      weapons: categoryWeapons.map(weapon => ({
        name: weapon.name,
        code: weapon.code || weapon.name,
        quantity: 1,
        emoji: weapon.emojiId || '⚔️'
      }))
    };

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

    // Usar la misma función que template create para cargar armas
    const { getAllWeapons } = require('../../services/weaponService');
    const fs = require('fs');
    const path = require('path');

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

        // Extraer armas del formato JSON
        for (const [category, categoryData] of Object.entries(weaponsData.weapons)) {
          if (categoryData.data && Array.isArray(categoryData.data)) {
            categoryData.data.forEach(weapon => {
              if (weapon.name && weapon.emoji) {
                weapons.push({
                  name: weapon.name,
                  category: category,
                  categoryDisplayName: categoryData.displayName,
                  emojiId: weapon.emoji,
                  code: weapon.code || weapon.name
                });
              }
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

    // Cargar todas las armas y filtrar por categoría
    const allWeapons = await getWeaponsWithFallback();
    const categoryWeapons = allWeapons.filter(weapon => weapon.category === categoryId);

    if (categoryWeapons.length === 0) {
      return await interaction.reply({
        content: 'No se encontraron armas en esta categoría.',
        ephemeral: true
      });
    }

    // Obtener las armas seleccionadas
    const selectedWeapons = selectedWeaponIndexes.map(index => categoryWeapons[index]).filter(Boolean);

    if (selectedWeapons.length === 0) {
      return await interaction.reply({
        content: 'No se encontraron las armas seleccionadas.',
        ephemeral: true
      });
    }

    // Ahora es selección individual (selectedWeaponIndexes solo tiene 1 elemento)
    const selectedWeaponIndex = selectedWeaponIndexes[0];
    const selectedWeapon = categoryWeapons[selectedWeaponIndex];

    if (!selectedWeapon) {
      return await interaction.reply({
        content: 'No se pudo obtener el arma seleccionada.',
        ephemeral: true
      });
    }

    // Obtener el índice del grupo que se está editando
    const session = validSession.session;
    const groupIndex = session.currentGroupIndex;

    if (groupIndex === undefined || !session.data.weapons) {
      return await interaction.reply({
        content: 'No se encontró el grupo de armas que se está editando.',
        ephemeral: true
      });
    }

    const currentGroup = Array.isArray(session.data.weapons)
      ? session.data.weapons[groupIndex]
      : Object.entries(session.data.weapons)[groupIndex]?.[1];

    if (!currentGroup) {
      return await interaction.reply({
        content: 'No se encontró el grupo de armas que se está editando.',
        ephemeral: true
      });
    }

    // Guardar información temporal del arma seleccionada para el modal
    session.tempWeaponData = {
      weapon: {
        name: selectedWeapon.name,
        code: selectedWeapon.code || selectedWeapon.name,
        emojiId: selectedWeapon.emojiId || '⚔️'
      },
      categoryName: selectedWeapon.categoryDisplayName || categoryId,
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

    const labelInput = new TextInputBuilder()
      .setCustomId('label')
      .setLabel('Etiqueta (opcional, para builds repetidas)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ej: Daga doble (Build A)')
      .setMaxLength(80)
      .setRequired(false);

    const quantityRow = new ActionRowBuilder().addComponents(quantityInput);
    const linkRow = new ActionRowBuilder().addComponents(linkInput);
    const labelRow = new ActionRowBuilder().addComponents(labelInput);

    modal.addComponents(quantityRow, linkRow, labelRow);

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
    console.log('[DEBUG] handleWeaponConfigModal - interaction.user.id:', interaction.user.id);
    console.log('[DEBUG] handleWeaponConfigModal - interaction.guild.id:', interaction.guild.id);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      console.log('[DEBUG] handleWeaponConfigModal - No valid session found');
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const session = validSession.session;
    const tempData = session.tempWeaponData;
    
    console.log('[DEBUG] handleWeaponConfigModal - tempData:', JSON.stringify(tempData, null, 2));
    console.log('[DEBUG] handleWeaponConfigModal - session.data.weapons length:', session.data.weapons?.length);

    if (!tempData) {
      console.log('[DEBUG] handleWeaponConfigModal - No tempData found');
      return await interaction.reply({
        content: 'No se encontraron los datos temporales del arma.',
        ephemeral: true
      });
    }

    // Obtener valores del modal
    const quantity = parseInt(interaction.fields.getTextInputValue('quantity')) || 1;
    const link = interaction.fields.getTextInputValue('link') || '';
    let label = '';
    try {
      label = interaction.fields.getTextInputValue('label')?.trim() || '';
    } catch { /* modales antiguos sin este campo */ }

    console.log('[DEBUG] handleWeaponConfigModal - quantity:', quantity);
    console.log('[DEBUG] handleWeaponConfigModal - link:', link);
    console.log('[DEBUG] handleWeaponConfigModal - label:', label);
    
    // Lógica automática: privado si hay enlace, no privado si no hay enlace
    const isPrivate = link.trim() !== '';
    console.log('[DEBUG] handleWeaponConfigModal - isPrivate:', isPrivate);

    // Validar cantidad
    if (quantity < 1 || quantity > 99) {
      console.log('[DEBUG] handleWeaponConfigModal - Invalid quantity:', quantity);
      return await interaction.reply({
        content: 'La cantidad debe ser un número entre 1 y 99.',
        ephemeral: true
      });
    }

    const weaponGroup = Array.isArray(session.data.weapons)
      ? session.data.weapons[tempData.groupIndex]
      : Object.entries(session.data.weapons)[tempData.groupIndex]?.[1];
    console.log('[DEBUG] handleWeaponConfigModal - weaponGroup:', JSON.stringify(weaponGroup, null, 2));

    if (!weaponGroup) {
      console.log('[DEBUG] handleWeaponConfigModal - No weaponGroup found at index:', tempData.groupIndex);
      return await interaction.reply({
        content: 'No se encontró el grupo de armas especificado.',
        ephemeral: true
      });
    }

    // Manejar diferentes estructuras de weaponGroup
    if (weaponGroup.categories) {
      // Estructura nueva: { categories: [{ name, weapons: [...] }] }
      console.log('[DEBUG] handleWeaponConfigModal - Using categories structure');
      let targetCategory = weaponGroup.categories.find(cat => cat.name === tempData.categoryName);
      if (!targetCategory) {
        console.log('[DEBUG] handleWeaponConfigModal - Creating new category:', tempData.categoryName);
        targetCategory = {
          name: tempData.categoryName,
          weapons: []
        };
        weaponGroup.categories.push(targetCategory);
      }

      // Si el nombre ya existe en el grupo y no se dio una etiqueta explícita,
      // autogenerar una para que el select del raid nunca muestre dos opciones
      // idénticas (varias builds de la misma arma son válidas).
      const existingCount = targetCategory.weapons.filter(w => w.name === tempData.weapon.name).length;
      const finalLabel = label || (existingCount > 0 ? `${tempData.weapon.name} (${existingCount + 1})` : '');

      // Añadir el arma con la configuración
      const newWeapon = {
        id: Date.now() + Math.random(),
        name: tempData.weapon.name,
        label: finalLabel,
        code: tempData.weapon.code || '',
        quantity: quantity,
        units: quantity, // Compatibilidad
        emoji: tempData.weapon.emojiId || '⚔️',
        emojiId: tempData.weapon.emojiId || '⚔️', // Preservar emojiId
        image: '',
        url: link,
        link: link,
        sendBuildToPrivate: isPrivate,
        private: isPrivate
      };
      console.log('[DEBUG] handleWeaponConfigModal - Adding weapon to category:', JSON.stringify(newWeapon, null, 2));
      targetCategory.weapons.push(newWeapon);

    } else if (weaponGroup.data) {
      // Estructura antigua: { data: [...] }
      console.log('[DEBUG] handleWeaponConfigModal - Using data structure');
      const existingCount = weaponGroup.data.filter(w => w.name === tempData.weapon.name).length;
      const finalLabel = label || (existingCount > 0 ? `${tempData.weapon.name} (${existingCount + 1})` : '');

      // Añadir el arma directamente al array data
      const newWeapon = {
        id: Date.now() + Math.random(),
        name: tempData.weapon.name,
        label: finalLabel,
        code: tempData.weapon.code || '',
        units: quantity, // En estructura antigua se usa 'units' en lugar de 'quantity'
        quantity: quantity, // Compatibilidad
        emoji: tempData.weapon.emojiId || '⚔️',
        emojiId: tempData.weapon.emojiId || '⚔️', // Preservar emojiId
        image: '',
        url: link,
        sendBuildToPrivate: isPrivate
      };
      console.log('[DEBUG] handleWeaponConfigModal - Adding weapon to data:', JSON.stringify(newWeapon, null, 2));
      weaponGroup.data.push(newWeapon);

    } else {
      // Si no tiene ninguna estructura conocida, crear la estructura categories
      console.log('[DEBUG] handleWeaponConfigModal - Creating new categories structure');
      const newWeapon = {
        id: Date.now() + Math.random(),
        name: tempData.weapon.name,
        label: label,
        code: tempData.weapon.code || '',
        quantity: quantity,
        units: quantity, // Compatibilidad
        emoji: tempData.weapon.emojiId || '⚔️',
        emojiId: tempData.weapon.emojiId || '⚔️', // Preservar emojiId
        image: '',
        url: link,
        sendBuildToPrivate: isPrivate
      };

      // Usar estructura correcta con "data" en lugar de "categories"
      if (!weaponGroup.data) {
        weaponGroup.data = [];
      }
      weaponGroup.data.push(newWeapon);

      console.log('[DEBUG] handleWeaponConfigModal - Created new structure with weapon:', JSON.stringify(newWeapon, null, 2));
    }

    // Limpiar datos temporales
    console.log('[DEBUG] handleWeaponConfigModal - Clearing tempWeaponData');
    delete session.tempWeaponData;
    session.hasChanges = true;
    console.log('[DEBUG] handleWeaponConfigModal - Set hasChanges to true');

    // Mostrar confirmación y volver al editor
    const targetGroup = Array.isArray(session.data.weapons)
      ? session.data.weapons[tempData.groupIndex]
      : Object.entries(session.data.weapons)[tempData.groupIndex]?.[1];
    const groupLabel = targetGroup?.name || targetGroup?.displayName || `Grupo ${tempData.groupIndex + 1}`;

    const embed = new EmbedBuilder()
      .setTitle('✅ Arma Añadida')
      .setDescription(`**${tempData.weapon.name}** ha sido añadida al grupo **${groupLabel}**:\n\n` +
        `• **Cantidad:** ${quantity}\n` +
        `• **Enlace:** ${link || 'Ninguno'}`)
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
    console.error('Stack trace:', error.stack);
    console.error('Session data:', JSON.stringify(session?.data, null, 2));
    console.error('Temp data:', JSON.stringify(session?.tempWeaponData, null, 2));
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Ocurrió un error al procesar la configuración del arma. Revisa los logs para más detalles.',
        ephemeral: true
      });
    } else {
      await interaction.followUp({
        content: 'Ocurrió un error al procesar la configuración del arma. Revisa los logs para más detalles.',
        ephemeral: true
      });
    }
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
    
    // Validar que el grupo existe antes de operar
    const validation = await getAndValidateWeaponGroup(session, groupIndex, interaction, 'modificar armas');
    if (!validation.success) {
      const errorEmbed = createErrorEmbed('Grupo no encontrado', validation.error);
      if (validation.suggestion) {
        errorEmbed.addFields([{ name: 'Sugerencia', value: validation.suggestion, inline: false }]);
      }
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponGroup = validation.group;
    console.log(`[DEBUG] Modificando armas en grupo: ${validation.groupName}`);

    if (!weaponGroup) {
      return await interaction.reply({
        content: 'No se encontró el grupo de armas especificado.',
        ephemeral: true
      });
    }
    const weaponsToRemove = [];

    // Recopilar información de las armas a eliminar
    selectedPositions.forEach(position => {
      if (position.startsWith('data_')) {
        // Manejar estructura weaponGroup.data
        const weaponIndex = parseInt(position.replace('data_', ''));
        if (weaponGroup.data && weaponGroup.data[weaponIndex]) {
          const weapon = weaponGroup.data[weaponIndex];
          weaponsToRemove.push({
            weapon,
            category: 'Armas', // Categoría genérica para weaponGroup.data
            isDataStructure: true,
            weaponIndex
          });
        }
      } else {
        // Manejar estructura weaponGroup.categories
        const [catIndex, weaponIndex] = position.split('_').map(i => parseInt(i));
        if (weaponGroup.categories && weaponGroup.categories[catIndex] && weaponGroup.categories[catIndex].weapons[weaponIndex]) {
          const weapon = weaponGroup.categories[catIndex].weapons[weaponIndex];
          const category = weaponGroup.categories[catIndex];
          weaponsToRemove.push({
            weapon,
            category: category.name,
            catIndex,
            weaponIndex
          });
        }
      }
    });

    if (!weaponsToRemove.length) {
      return await interaction.reply({
        content: 'No se pudieron encontrar las armas seleccionadas.',
        ephemeral: true
      });
    }

    // Eliminar las armas (en orden inverso para mantener índices válidos)
    const dataRemovals = weaponsToRemove.filter(item => item.isDataStructure).sort((a, b) => b.weaponIndex - a.weaponIndex);
    const categoryRemovals = weaponsToRemove.filter(item => !item.isDataStructure).sort((a, b) => {
      if (a.catIndex !== b.catIndex) return b.catIndex - a.catIndex;
      return b.weaponIndex - a.weaponIndex;
    });

    let removedCount = 0;
    
    // Eliminar de weaponGroup.data
    dataRemovals.forEach(({ weaponIndex }) => {
      if (weaponGroup.data && weaponGroup.data[weaponIndex]) {
        weaponGroup.data.splice(weaponIndex, 1);
        removedCount++;
      }
    });

    // Eliminar de weaponGroup.categories
    categoryRemovals.forEach(({ catIndex, weaponIndex }) => {
      if (weaponGroup.categories && weaponGroup.categories[catIndex] && weaponGroup.categories[catIndex].weapons[weaponIndex]) {
        weaponGroup.categories[catIndex].weapons.splice(weaponIndex, 1);
        removedCount++;
      }
    });

    // Limpiar categorías vacías (solo si existe la estructura categories)
    if (weaponGroup.categories) {
      weaponGroup.categories = weaponGroup.categories.filter(cat => cat.weapons && cat.weapons.length > 0);
    }

    // Marcar que hay cambios para poder guardar
    session.hasChanges = true;

    // Mostrar confirmación
    const targetGroup = Array.isArray(session.data.weapons)
      ? session.data.weapons[groupIndex]
      : Object.entries(session.data.weapons)[groupIndex]?.[1];
    const groupLabel = targetGroup?.name || targetGroup?.displayName || `Grupo ${groupIndex + 1}`;

    const embed = new EmbedBuilder()
      .setTitle('✅ Armas Eliminadas')
      .setDescription(`Se eliminaron ${removedCount} armas del grupo **${groupLabel}**:\n\n${weaponsToRemove.map(w => `• ${w.weapon.name} (${w.category})`).join('\n')}`)
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
    
    // Validar que el grupo existe antes de operar
    const validation = await getAndValidateWeaponGroup(session, groupIndex, interaction, 'modificar arma');
    if (!validation.success) {
      const errorEmbed = createErrorEmbed('Grupo no encontrado', validation.error);
      if (validation.suggestion) {
        errorEmbed.addFields([{ name: 'Sugerencia', value: validation.suggestion, inline: false }]);
      }
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponGroup = validation.group;
    console.log(`[DEBUG] Modificando arma en grupo: ${validation.groupName}`);

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

// Función para manejar la modificación de armas en un grupo
async function handleModifyWeaponInGroup(interaction, sessionId, groupIndex) {
  try {
    console.log('[DEBUG] handleModifyWeaponInGroup - sessionId:', sessionId, 'groupIndex:', groupIndex);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      return await interaction.reply({ content: 'Sesión expirada. Por favor reinicia la edición.', ephemeral: true });
    }

    const { session } = validSession;
    
    // Validar que el grupo existe antes de operar
    const validation = await getAndValidateWeaponGroup(session, groupIndex, interaction, 'eliminar arma');
    if (!validation.success) {
      const errorEmbed = createErrorEmbed('Grupo no encontrado', validation.error);
      if (validation.suggestion) {
        errorEmbed.addFields([{ name: 'Sugerencia', value: validation.suggestion, inline: false }]);
      }
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponGroup = validation.group;
    console.log(`[DEBUG] Eliminando arma del grupo: ${validation.groupName}`);

    if (!weaponGroup) {
      return await interaction.reply({ content: 'Grupo de armas no encontrado.', ephemeral: true });
    }

    // Debug: Mostrar la estructura completa del weaponGroup
    console.log('[DEBUG] weaponGroup structure:', JSON.stringify(weaponGroup, null, 2));
    console.log('[DEBUG] weaponGroup keys:', Object.keys(weaponGroup));
    console.log('[DEBUG] weaponGroup.data exists:', !!weaponGroup.data);
    console.log('[DEBUG] weaponGroup.weapons exists:', !!weaponGroup.weapons);
    console.log('[DEBUG] weaponGroup.categories exists:', !!weaponGroup.categories);

    // Obtener todas las armas del grupo
    let allWeapons = [];
    
    // Verificar múltiples estructuras posibles
    if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
      console.log('[DEBUG] Using weaponGroup.data structure (direct weapons array)');
      // Estructura directa con armas en el array data
      allWeapons = weaponGroup.data.map((weapon, index) => ({
        ...weapon,
        originalIndex: index
      }));
    } else if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
      console.log('[DEBUG] Using weaponGroup.categories structure');
      // Estructura alternativa con categorías
      weaponGroup.categories.forEach(category => {
        if (category.weapons && Array.isArray(category.weapons)) {
          allWeapons = allWeapons.concat(category.weapons.map((weapon, index) => ({
            ...weapon,
            categoryName: category.name,
            originalIndex: allWeapons.length + index
          })));
        }
      });
    } else if (weaponGroup.weapons && Array.isArray(weaponGroup.weapons)) {
      console.log('[DEBUG] Using weaponGroup.weapons structure');
      // Estructura sin categorías
      allWeapons = weaponGroup.weapons.map((weapon, index) => ({
        ...weapon,
        originalIndex: index
      }));
    } else {
      console.log('[DEBUG] No recognized weapon structure found');
      console.log('[DEBUG] Available properties:', Object.keys(weaponGroup));
    }

    console.log('[DEBUG] Total weapons found:', allWeapons.length);
    console.log('[DEBUG] Weapons:', allWeapons.map(w => ({ name: w.name, quantity: w.quantity })));

    if (allWeapons.length === 0) {
      return await interaction.reply({ 
        content: 'No hay armas en este grupo para modificar.', 
        ephemeral: true 
      });
    }

    // Crear embed
    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('🔧 Seleccionar Arma para Modificar')
      .setDescription(`**Grupo:** ${weaponGroup.name || weaponGroup.displayName || `Grupo ${groupIndex + 1}`}\n\n**📋 Armas disponibles:** ${allWeapons.length}\n\n**Selecciona un arma de la lista para modificar sus propiedades:**`)
      .setFooter({ text: 'Tip: Puedes ver la cantidad y categoría de cada arma en la descripción' });

    // Crear select menu con las armas
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`modify_weapon_select_${sessionId}_${groupIndex}`)
      .setPlaceholder('🎯 Elige el arma que deseas modificar...')
      .addOptions(
        allWeapons.slice(0, 25).map((weapon, index) => ({
          label: `${weapon.name || `Arma ${index + 1}`}`,
          value: (weapon.originalIndex !== undefined ? weapon.originalIndex : index).toString(),
          description: weapon.categoryName ? 
            `📂 ${weapon.categoryName} • Cantidad: ${weapon.units || weapon.quantity || 1}` : 
            `📊 Cantidad: ${weapon.units || weapon.quantity || 1}`,
          emoji: weapon.emojiId || weapon.emoji || '⚔️'
        }))
      );

    const backBtn = new ButtonBuilder()
      .setCustomId(`group_edit_${sessionId}_${groupIndex}`)
      .setLabel('← Volver al Grupo')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔙');

    const components = [
      new ActionRowBuilder().addComponents(selectMenu),
      new ActionRowBuilder().addComponents(backBtn)
    ];

    await interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true
    });

  } catch (error) {
    console.error('Error en handleModifyWeaponInGroup:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo mostrar la selección de armas.');
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

// Manejar modal de modificar arma
templateModule.handleModifyWeaponModalSubmit = async function (interaction) {
  try {
    const parts = interaction.customId.split('_'); // modify_weapon_modal_sessionId_groupIndex_weaponIndex
    const sessionId = parts[3];
    const groupIndex = parseInt(parts[4]);
    const weaponIndex = parseInt(parts[5]);

    console.log('[DEBUG] handleModifyWeaponModalSubmit - sessionId:', sessionId, 'groupIndex:', groupIndex, 'weaponIndex:', weaponIndex);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const { session } = validSession;

    // Validar entrada de datos
    const weaponName = interaction.fields.getTextInputValue('weapon_name')?.trim();
    const weaponQuantityStr = interaction.fields.getTextInputValue('weapon_quantity')?.trim();
    const weaponEmoji = interaction.fields.getTextInputValue('weapon_emoji')?.trim() || '⚔️';
    const weaponLink = interaction.fields.getTextInputValue('weapon_link')?.trim() || '';
    const weaponPrivateStr = interaction.fields.getTextInputValue('weapon_private')?.trim().toLowerCase();

    // Validaciones
    if (!weaponName) {
      const errorEmbed = createErrorEmbed('Error de Validación', 'El nombre del arma es requerido.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponQuantity = parseInt(weaponQuantityStr);
    if (isNaN(weaponQuantity) || weaponQuantity < 1) {
      const errorEmbed = createErrorEmbed('Error de Validación', 'La cantidad debe ser un número mayor a 0.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const isPrivate = weaponPrivateStr === 'true' || weaponPrivateStr === '1';

    // Actualizar el arma usando el helper para obtener el grupo correctamente
    const weaponGroup = getWeaponGroupFromSession(session, groupIndex);
      
    if (!weaponGroup) {
      const errorEmbed = createErrorEmbed('Error', 'No se pudo encontrar el grupo de armas.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    let weapon = null;
    let weaponFound = false;

    // Obtener el arma usando el helper
    weapon = getWeaponFromGroup(weaponGroup, weaponIndex);
    weaponFound = !!weapon;

    console.log('[DEBUG] handleModifyWeaponModalSubmit - weaponFound:', weaponFound, 'weapon:', weapon);

    if (!weaponFound || !weapon) {
      const errorEmbed = createErrorEmbed('Error', 'No se pudo encontrar el arma para actualizar.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Preservar el ID original si existe
    const originalId = weapon.id;

    // Crear objeto con los datos actualizados
    const updatedData = {
      name: weaponName,
      units: weaponQuantity,
      quantity: weaponQuantity, // Compatibilidad
      emojiId: weaponEmoji,
      emoji: weaponEmoji, // Compatibilidad
      url: weaponLink,
      link: weaponLink, // Compatibilidad
      sendBuildToPrivate: isPrivate,
      private: isPrivate // Compatibilidad
    };

    // Preservar ID original
    if (originalId) {
      updatedData.id = originalId;
    }

    // Actualizar el arma usando el helper
    const updated = updateWeaponInGroup(weaponGroup, weaponIndex, updatedData);
    
    if (!updated) {
      const errorEmbed = createErrorEmbed('Error', 'No se pudo actualizar el arma en el grupo.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Marcar que hay cambios para poder guardar
    session.hasChanges = true;

    console.log('[DEBUG] handleModifyWeaponModalSubmit - Weapon updated successfully:', weapon);

    // Limpiar y validar datos antes de guardar
    const cleanedData = cleanForMongoDB(session.data);
    console.log('[DEBUG] handleModifyWeaponModalSubmit - Data cleaned for MongoDB:', JSON.stringify(cleanedData.weapons, null, 2));

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
    console.error('Error al manejar modal de modificar arma:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo actualizar el arma.');
    
    // Solo responder si la interacción no ha sido respondida
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
};

// Nueva función para manejar los botones de acción de armas individuales
const handleWeaponActionButton = async function(interaction, customId) {
  try {
    console.log('[DEBUG] handleWeaponActionButton - customId:', customId);

    // Extraer información del customId
    const parts = customId.split('_');
    let action, sessionId, groupIndex, weaponIndex;
    
    console.log('[DEBUG] handleWeaponActionButton - parts:', parts);
    
    // Manejar diferentes formatos de customId
    if (customId.startsWith('confirm_delete_weapon_') || customId.startsWith('cancel_delete_weapon_')) {
      action = parts[0] + '_' + parts[1] + '_' + parts[2]; // confirm_delete_weapon, cancel_delete_weapon
      // El sessionId puede contener guiones bajos, así que necesitamos reconstruirlo
      const actionParts = 3; // confirm_delete_weapon tiene 3 partes
      const lastTwoParts = parts.slice(-2); // Los últimos 2 son groupIndex y weaponIndex
      groupIndex = parseInt(lastTwoParts[0]);
      weaponIndex = parseInt(lastTwoParts[1]);
      sessionId = parts.slice(actionParts, -2).join('_'); // Todo lo que está entre la acción y los últimos 2 números
    } else if (customId.startsWith('modify_weapon_full_')) {
      action = parts[0] + '_' + parts[1] + '_' + parts[2]; // modify_weapon_full
      // El sessionId puede contener guiones bajos, así que necesitamos reconstruirlo
      const actionParts = 3; // modify_weapon_full tiene 3 partes
      const lastTwoParts = parts.slice(-2); // Los últimos 2 son groupIndex y weaponIndex
      groupIndex = parseInt(lastTwoParts[0]);
      weaponIndex = parseInt(lastTwoParts[1]);
      sessionId = parts.slice(actionParts, -2).join('_'); // Todo lo que está entre la acción y los últimos 2 números
    } else {
      action = parts[0] + '_' + parts[1]; // delete_weapon, modify_units, add_url
      // El sessionId puede contener guiones bajos, así que necesitamos reconstruirlo
      const actionParts = 2; // delete_weapon tiene 2 partes
      const lastTwoParts = parts.slice(-2); // Los últimos 2 son groupIndex y weaponIndex
      groupIndex = parseInt(lastTwoParts[0]);
      weaponIndex = parseInt(lastTwoParts[1]);
      sessionId = parts.slice(actionParts, -2).join('_'); // Todo lo que está entre la acción y los últimos 2 números
    }

    console.log('[DEBUG] handleWeaponActionButton - action:', action, 'sessionId:', sessionId, 'groupIndex:', groupIndex, 'weaponIndex:', weaponIndex);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const { session } = validSession;
    
    console.log('[DEBUG] handleWeaponActionButton - session.data:', session.data);
    console.log('[DEBUG] handleWeaponActionButton - session.data.weapons:', session.data.weapons);
    console.log('[DEBUG] handleWeaponActionButton - groupIndex:', groupIndex, 'weapons length:', session.data.weapons ? session.data.weapons.length : 'undefined');
    
    const weaponGroup = session.data.weapons && session.data.weapons[groupIndex];

    if (!weaponGroup) {
      console.log('[ERROR] handleWeaponActionButton - weaponGroup not found. Available groups:', session.data.weapons);
      const errorEmbed = createErrorEmbed('Error', 'No se pudo encontrar el grupo de armas. Por favor, reinicia la edición del template.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Obtener el arma objetivo usando la misma lógica que handleModifyWeaponSelect
    let targetWeapon = null;
    let weaponFound = false;

    if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
      targetWeapon = weaponGroup.data[weaponIndex];
      weaponFound = !!targetWeapon;
    } else if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
      let currentIndex = 0;
      for (const category of weaponGroup.categories) {
        if (category.weapons && Array.isArray(category.weapons)) {
          for (let i = 0; i < category.weapons.length; i++) {
            if (currentIndex === weaponIndex) {
              targetWeapon = category.weapons[i];
              weaponFound = true;
              break;
            }
            currentIndex++;
          }
          if (weaponFound) break;
        }
      }
    } else if (weaponGroup.weapons && Array.isArray(weaponGroup.weapons)) {
      targetWeapon = weaponGroup.weapons[weaponIndex];
      weaponFound = !!targetWeapon;
    }

    if (!weaponFound || !targetWeapon) {
      return await interaction.reply({ content: 'Arma no encontrada.', ephemeral: true });
    }

    switch (action) {
      case 'delete_weapon':
        await handleDeleteWeapon(interaction, sessionId, groupIndex, weaponIndex, targetWeapon);
        break;
      case 'confirm_delete_weapon':
        await handleConfirmDeleteWeapon(interaction, sessionId, groupIndex, weaponIndex, targetWeapon);
        break;
      case 'cancel_delete_weapon':
        await handleCancelDeleteWeapon(interaction, sessionId, groupIndex);
        break;
      case 'modify_units':
        await handleModifyUnits(interaction, sessionId, groupIndex, weaponIndex, targetWeapon);
        break;
      case 'modify_weapon_full':
        await handleModifyWeaponFull(interaction, sessionId, groupIndex, weaponIndex, targetWeapon);
        break;
      case 'add_url':
        await handleAddUrl(interaction, sessionId, groupIndex, weaponIndex, targetWeapon);
        break;
      default:
        await interaction.reply({ content: 'Acción no reconocida.', ephemeral: true });
    }

  } catch (error) {
    console.error('Error en handleWeaponActionButton:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo procesar la acción.');
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
};

// Funciones auxiliares para cada acción
const handleDeleteWeapon = async function(interaction, sessionId, groupIndex, weaponIndex, targetWeapon) {
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🗑️ Confirmar Eliminación')
    .setDescription(`¿Estás seguro de que deseas eliminar **${targetWeapon.name}**?`)
    .addFields([
      {
        name: '⚠️ Advertencia',
        value: 'Esta acción no se puede deshacer.',
        inline: false
      }
    ]);

  const confirmButton = new ButtonBuilder()
    .setCustomId(`confirm_delete_weapon_${sessionId}_${groupIndex}_${weaponIndex}`)
    .setLabel('✅ Confirmar')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`cancel_delete_weapon_${sessionId}_${groupIndex}_${weaponIndex}`)
    .setLabel('❌ Cancelar')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
};

const handleModifyUnits = async function(interaction, sessionId, groupIndex, weaponIndex, targetWeapon) {
  const modal = new ModalBuilder()
    .setCustomId(`modify_units_modal_${sessionId}_${groupIndex}_${weaponIndex}`)
    .setTitle(`📊 Modificar Unidades: ${targetWeapon.name}`);

  const unitsInput = new TextInputBuilder()
    .setCustomId('weapon_units')
    .setLabel('📊 Nueva Cantidad')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(String(targetWeapon.units || targetWeapon.quantity || 1))
    .setMaxLength(3)
    .setPlaceholder('Ej: 5');

  const row = new ActionRowBuilder().addComponents(unitsInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
};

// Función para manejar el modal completo de modificación de armas
const handleModifyWeaponFullModalSubmit = async function (interaction) {
  try {
    const parts = interaction.customId.split('_'); // modify_weapon_full_modal_sessionId_groupIndex_weaponIndex
    console.log('[DEBUG] handleModifyWeaponFullModalSubmit - parts:', parts);
    
    // El sessionId puede contener guiones bajos, así que necesitamos reconstruirlo
    const actionParts = 4; // modify_weapon_full_modal tiene 4 partes
    const lastTwoParts = parts.slice(-2); // Los últimos 2 son groupIndex y weaponIndex
    const groupIndex = parseInt(lastTwoParts[0]);
    const weaponIndex = parseInt(lastTwoParts[1]);
    const sessionId = parts.slice(actionParts, -2).join('_'); // Todo lo que está entre la acción y los últimos 2 números

    console.log('[DEBUG] handleModifyWeaponFullModalSubmit - sessionId:', sessionId, 'groupIndex:', groupIndex, 'weaponIndex:', weaponIndex);

    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const { session } = validSession;
    
    // Validar que el grupo existe antes de operar
    const validation = await getAndValidateWeaponGroup(session, groupIndex, interaction, 'modificar arma completa');
    if (!validation.success) {
      const errorEmbed = createErrorEmbed('Grupo no encontrado', validation.error);
      if (validation.suggestion) {
        errorEmbed.addFields([{ name: 'Sugerencia', value: validation.suggestion, inline: false }]);
      }
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const weaponGroup = validation.group;
    console.log(`[DEBUG] handleModifyWeaponFullModalSubmit - Modificando arma completa en grupo: ${validation.groupName}`);

    // Obtener valores del modal (solo campos editables)
    const weaponQuantityStr = interaction.fields.getTextInputValue('weapon_quantity')?.trim();
    const weaponLink = interaction.fields.getTextInputValue('weapon_link')?.trim() || '';
    let weaponLabel = '';
    try {
      weaponLabel = interaction.fields.getTextInputValue('weapon_label')?.trim() || '';
    } catch { /* modales antiguos sin este campo */ }

    // Validaciones (solo para campos editables)
    const weaponQuantity = parseInt(weaponQuantityStr);
    if (isNaN(weaponQuantity) || weaponQuantity < 1) {
      const errorEmbed = createErrorEmbed('Error de Validación', 'La cantidad debe ser un número mayor a 0.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Obtener el arma usando el helper
    const weapon = getWeaponFromGroup(weaponGroup, weaponIndex);
    if (!weapon) {
      const errorEmbed = createErrorEmbed('Error', 'No se pudo encontrar el arma para actualizar.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Preservar todos los datos originales y solo actualizar los campos editables
    const updatedData = {
      // Preservar datos originales
      name: weapon.name,
      emojiId: weapon.emojiId || weapon.emoji,
      emoji: weapon.emoji || weapon.emojiId,
      // Actualizar solo campos editables
      units: weaponQuantity,
      quantity: weaponQuantity, // Compatibilidad
      url: weaponLink,
      link: weaponLink, // Compatibilidad
      label: weaponLabel
    };

    // Preservar ID original si existe
    if (weapon.id) {
      updatedData.id = weapon.id;
    }

    // Actualizar el arma usando el helper
    const updated = updateWeaponInGroup(weaponGroup, weaponIndex, updatedData);
    
    if (!updated) {
      const errorEmbed = createErrorEmbed('Error', 'No se pudo actualizar el arma en el grupo.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Marcar que hay cambios para poder guardar
    session.hasChanges = true;

    console.log('[DEBUG] handleModifyWeaponFullModalSubmit - Arma actualizada exitosamente:', weapon);

    // Re obtener el arma actualizada para mostrar valores correctos
    const updatedWeapon = getWeaponFromGroup(weaponGroup, weaponIndex) || updatedData;

    // Preparar EMBED de confirmación (solo para el usuario que modifica)
    const successEmbed = new EmbedBuilder()
      .setTitle(`📝 Grupo Actualizado: ${weaponGroup.displayName || weaponGroup.name || `Grupo ${groupIndex}`}`)
      .setDescription(`El arma **${updatedWeapon.name}** ha sido actualizada.\n\nCambios guardados en el arma (temporalmente no en MongoDB).`)
      .addFields([
        { name: '📊 Cantidad', value: String(updatedWeapon.units || updatedWeapon.quantity || 1), inline: true },
        { name: '🔗 URL', value: updatedWeapon.url || updatedWeapon.link || 'Sin URL', inline: true }
      ])
      .setColor('#00FF00')
      .setTimestamp();

    // Botón: Volver al editor de grupo
    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
      .setLabel('🔙 Volver al Grupo')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(backButton);

    // Responder solo al usuario (ephemeral) con los botones
    await interaction.reply({ embeds: [successEmbed], components: [row], ephemeral: true });

  } catch (error) {
    console.error('Error en handleModifyWeaponFullModalSubmit:', error);
    
    // Manejo mejorado de errores para modales
    let errorMessage = 'No se pudo procesar la modificación del arma.';
    if (error.code === 10062) {
      errorMessage = 'La interacción expiró. Por favor, inténtalo de nuevo.';
    } else if (error.code === 40060) {
      errorMessage = 'Error de interacción. La sesión puede haber expirado.';
    }
    
    const errorEmbed = createErrorEmbed('Error', errorMessage);
    
    // Intentar responder solo si no se ha respondido
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      } else if (interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (replyError) {
      console.error('Error al enviar mensaje de error:', replyError);
    }
  }
};

// Adjuntar el handler del modal completo al módulo si no está ya asignado
try {
  if (typeof templateModule !== 'undefined' && typeof templateModule.handleModifyWeaponFullModalSubmit !== 'function' && typeof handleModifyWeaponFullModalSubmit === 'function') {
    templateModule.handleModifyWeaponFullModalSubmit = handleModifyWeaponFullModalSubmit;
  }
} catch (e) {
  // Ignorar errores silenciosamente para no romper el flujo
}

const handleModifyWeaponFull = async function(interaction, sessionId, groupIndex, weaponIndex, targetWeapon) {
  try {
    console.log(`[DEBUG] handleModifyWeaponFull - Creando modal simplificado para ${targetWeapon.name}`);
    
    // Crear modal simplificado solo con campos editables
    const modal = new ModalBuilder()
      .setCustomId(`modify_weapon_full_modal_${sessionId}_${groupIndex}_${weaponIndex}`)
      .setTitle(`🔧 Modificar: ${targetWeapon.name}`);

    // Campo para las unidades/cantidad (editable)
    const quantityInput = new TextInputBuilder()
      .setCustomId('weapon_quantity')
      .setLabel('📊 Cantidad/Unidades')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ej: 5')
      .setValue(String(targetWeapon.units || targetWeapon.quantity || 1))
      .setRequired(true);

    // Campo para la URL (editable)
    const urlInput = new TextInputBuilder()
      .setCustomId('weapon_link')
      .setLabel('🔗 URL de la Build')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://albionfreemarket.com/builds/details/...')
      .setValue(targetWeapon.url || targetWeapon.link || '')
      .setRequired(false);

    // Campo para la etiqueta (editable) — distingue builds repetidas de la misma arma
    const labelInput = new TextInputBuilder()
      .setCustomId('weapon_label')
      .setLabel('🏷️ Etiqueta (opcional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ej: Daga doble (Build A)')
      .setValue(targetWeapon.label || '')
      .setMaxLength(80)
      .setRequired(false);

    // Crear filas para el modal (solo campos editables)
    const quantityRow = new ActionRowBuilder().addComponents(quantityInput);
    const urlRow = new ActionRowBuilder().addComponents(urlInput);
    const labelRow = new ActionRowBuilder().addComponents(labelInput);

    // Añadir solo las filas necesarias al modal
    modal.addComponents(quantityRow, urlRow, labelRow);

    // Mostrar el modal
    await interaction.showModal(modal);
    console.log('[DEBUG] handleModifyWeaponFull - Modal simplificado mostrado exitosamente');
    
  } catch (error) {
    console.error('Error en handleModifyWeaponFull:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo abrir el modal de modificación.');
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
  }
};

const handleAddUrl = async function(interaction, sessionId, groupIndex, weaponIndex, targetWeapon) {
  const modal = new ModalBuilder()
    .setCustomId(`add_url_modal_${sessionId}_${groupIndex}_${weaponIndex}`)
    .setTitle(`🔗 Editar URL: ${targetWeapon.name}`);

  const urlInput = new TextInputBuilder()
    .setCustomId('weapon_url')
    .setLabel('🔗 URL del Arma')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(targetWeapon.url || targetWeapon.link || '')
    .setMaxLength(200)
    .setPlaceholder('https://ejemplo.com/arma');

  const row = new ActionRowBuilder().addComponents(urlInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
};

// Funciones para manejar confirmación y cancelación de eliminación
const handleConfirmDeleteWeapon = async function(interaction, sessionId, groupIndex, weaponIndex, targetWeapon) {
  try {
    const validSession = getValidSession(sessionId, interaction.user.id, interaction.guild.id);
    if (!validSession) {
      const errorEmbed = createErrorEmbed('Sesión expirada', 'La sesión de edición ha expirado.');
      return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const { session } = validSession;
    const weaponGroup = session.data.weapons[groupIndex];

    // Eliminar el arma según la estructura de datos
    let deleted = false;
    if (weaponGroup.data && Array.isArray(weaponGroup.data)) {
      if (weaponIndex < weaponGroup.data.length) {
        weaponGroup.data.splice(weaponIndex, 1);
        deleted = true;
      }
    } else if (weaponGroup.categories && Array.isArray(weaponGroup.categories)) {
      let currentIndex = 0;
      for (const category of weaponGroup.categories) {
        if (category.weapons && Array.isArray(category.weapons)) {
          for (let i = 0; i < category.weapons.length; i++) {
            if (currentIndex === weaponIndex) {
              category.weapons.splice(i, 1);
              deleted = true;
              break;
            }
            currentIndex++;
          }
          if (deleted) break;
        }
      }
    } else if (weaponGroup.weapons && Array.isArray(weaponGroup.weapons)) {
      if (weaponIndex < weaponGroup.weapons.length) {
        weaponGroup.weapons.splice(weaponIndex, 1);
        deleted = true;
      }
    }

    if (deleted) {
      session.hasChanges = true;
      const successEmbed = createSuccessEmbed('Arma Eliminada', `**${targetWeapon.name}** ha sido eliminada del grupo.`);
      const backButton = new ButtonBuilder()
        .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
        .setLabel('🔙 Volver al Grupo')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(backButton);

      await interaction.reply({
        embeds: [successEmbed],
        components: [row],
        ephemeral: true
      });
    } else {
      await interaction.reply({ content: 'No se pudo eliminar el arma.', ephemeral: true });
    }

  } catch (error) {
    console.error('Error en handleConfirmDeleteWeapon:', error);
    const errorEmbed = createErrorEmbed('Error', 'No se pudo eliminar el arma.');
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
};

const handleCancelDeleteWeapon = async function(interaction, sessionId, groupIndex) {
  const backButton = new ButtonBuilder()
    .setCustomId(`back_to_group_${sessionId}_${groupIndex}`)
    .setLabel('🔙 Volver al Grupo')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(backButton);

  await interaction.reply({
    content: '❌ Eliminación cancelada.',
    components: [row],
    ephemeral: true
  });
};

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
module.exports.handleModifyAddLink = handleModifyAddLink;
module.exports.handleModifyUpdateQuantities = handleModifyUpdateQuantities;
