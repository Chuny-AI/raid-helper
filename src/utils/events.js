const { InteractionType, Events, EmbedBuilder } = require("discord.js");
const { client } = require("./client");
const { embedsMap } = require("../utils/embed");
const { getOrCreateServer } = require("../services/serverService");
const { filterCommand } = require("./commandFilter");
const ClaimService = require("../services/claimService");

const getEvents = () => {
  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`El bot ${readyClient.user.tag} está listo.`);

    // Crear registros de servidores existentes (sin migrar templates)
    try {
      const guilds = readyClient.guilds.cache;
      for (const [guildId, guild] of guilds) {
        await getOrCreateServer(guildId, guild.name);
      }
      console.log('[INFO] Servidores registrados en la base de datos');
    } catch (error) {
      console.error('[ERROR] Error al registrar servidores:', error);
    }

    // Ejecutar limpieza de recordatorios huérfanos al iniciar
    try {
      await ClaimService.cleanupOrphanReminders();
    } catch (error) {
      console.error('[ERROR] Error en limpieza de recordatorios huérfanos:', error);
    }
  });

  // Manejar cuando el bot se une a un nuevo servidor
  client.on(Events.GuildCreate, async (guild) => {
    try {
      await getOrCreateServer(guild.id, guild.name);
      console.log(`[INFO] Bot añadido al servidor: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error('[ERROR] Error al procesar nuevo servidor:', error);
    }
  });

  // Manejar mensajes para detección automática de datos hex
  client.on(Events.MessageCreate, async (message) => {
    // Ignorar mensajes del bot
    if (message.author.bot) return;

    // Solo procesar en canales de texto de servidores
    if (!message.guild) return;

    // Buscar patrones de datos hexadecimales del Cheat Engine
    const hexPattern = /(?:41[\s]?56[\s]?41[\s]?5F|AVA_TEMPLE)/i;

    if (hexPattern.test(message.content)) {
      try {
        console.log(`[AUTO-DECODE] Datos hex detectados en mensaje de ${message.author.tag}`);
        await processHexMessage(message);
      } catch (error) {
        console.error('[ERROR] Error procesando mensaje hex automático:', error);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      // Filtrar comandos basado en permisos
      const shouldExecute = await filterCommand(interaction);
      if (!shouldExecute) {
        return;
      }

      if (!interaction.client.commands) {
        console.error("interaction.client.commands no está definido");
        return;
      }

      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(
          `No se encontró un comando identificado con ${interaction.commandName}.`
        );
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Hubo un error ejecutando el comando",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "Hubo un error ejecutando el comando",
            ephemeral: true,
          });
        }
      }
    }

    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(
          `No se encontró un comando identificado con ${interaction.commandName}.`
        );
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(error);
      }
    }

    // Manejar StringSelectMenu
    if (interaction.isStringSelectMenu()) {
      // Manejar selección de categorías en create_template
      // Manejar selección de armas para categorías personalizadas
      if (interaction.customId.startsWith("template_weapon_select_")) {
        await createTemplateCommand.handleWeaponSelect(interaction);
        return;
      }

      // Handlers removidos - no existen en la nueva versión

      if (interaction.customId.startsWith("template_weapon_category_select_")) {
        console.log('[DEBUG] Eventos: Selección de categoría de armas detectada:', interaction.customId);
        await createTemplateCommand.handleWeaponCategorySelect(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_change_category_")) {
        console.log('[DEBUG] Eventos: Cambiar categoría detectado:', interaction.customId);
        await createTemplateCommand.handleAddWeapons(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_add_more_weapons_")) {
        console.log('[DEBUG] Eventos: Agregar más armas detectado:', interaction.customId);
        await createTemplateCommand.handleAddWeapons(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_add_weapons_")) {
        console.log('[DEBUG] Eventos: Agregar armas detectado:', interaction.customId);
        await createTemplateCommand.handleAddWeapons(interaction);
        return;
      }



      if (interaction.customId.startsWith("template_categories_prev_") || interaction.customId.startsWith("template_categories_next_")) {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_emoji_category_select_")) {
        await createTemplateCommand.handleEmojiCategorySelect(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_emoji_select_")) {
        await createTemplateCommand.handleEmojiSelect(interaction);
        return;
      }

      if (interaction.customId === "template_edit_emoji_category_select") {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId === "template_edit_emoji_select") {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId === "template_edit_category_select") {
        await createTemplateCommand.handleEditCategorySelect(interaction);
        return;
      }

      if (interaction.customId === "template_remove_category_select") {
        await createTemplateCommand.handleRemoveCategorySelect(interaction);
        return;
      }

      // Manejar selección de edición en edit_template
      if (interaction.customId === "edit_template_select") {
        await editTemplateCommand.handleEditSelect(interaction);
        return;
      }

      // Manejar selección de categorías de armas en edit_template
      if (interaction.customId === "edit_weapon_category_select") {
        await editTemplateCommand.handleWeaponsEdit(interaction, interaction.client.templateEditState?.get(interaction.user.id)?.template);
        return;
      }
    }

    // Manejar Button
    if (interaction.isButton()) {
      // Manejar botón de continuar en create_template
      if (interaction.customId === "template_continue") {
        await interaction.reply({
          content: "Por favor selecciona al menos una arma para continuar.",
          ephemeral: true
        });
        return;
      }

      // Manejar botones de create_template
      if (interaction.customId === "template_add_category") {
        await createTemplateCommand.handleAddCategory(interaction);
        return;
      }

      if (interaction.customId === "template_edit_category") {
        await createTemplateCommand.handleEditCategory(interaction);
        return;
      }

      if (interaction.customId === "template_remove_category") {
        await createTemplateCommand.handleRemoveCategory(interaction);
        return;
      }

      if (interaction.customId === "template_config_final") {
        await createTemplateCommand.handleConfigFinal(interaction);
        return;
      }

      if (interaction.customId === "template_skip_category") {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_continue_category_")) {
        await createTemplateCommand.handleContinueCategory(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_config_weapon_")) {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_edit_weapons_")) {
        await createTemplateCommand.handleAddWeapons(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_edit_category_info_")) {
        await createTemplateCommand.handleEditCategoryInfo(interaction);
        return;
      }

      if (interaction.customId === "template_back_to_main") {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId === "template_back_to_emoji_categories") {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_back_to_emoji_categories_")) {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId === "template_back_to_edit_emoji_categories") {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      // Manejar botones de edit_template
      if (interaction.customId.startsWith("edit_")) {
        await editTemplateCommand.handleButtonClick(interaction);
        return;
      }

      // Manejadores de botones eliminados
    }

    // Manejar Modal
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "template_new_category_modal") {
        await createTemplateCommand.handleNewCategoryModal(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_weapon_config_modal_")) {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_weapon_search_modal_")) {
        await createTemplateCommand.handleBackToMain(interaction);
        return;
      }

      if (interaction.customId === "template_final_config_modal") {
        await createTemplateCommand.handleFinalConfigModal(interaction);
        return;
      }

      if (interaction.customId.startsWith("template_edit_category_info_modal_")) {
        await createTemplateCommand.handleEditCategoryInfoModal(interaction);
        return;
      }

      if (interaction.customId.startsWith("edit_") && interaction.customId.endsWith("_modal")) {
        await editTemplateCommand.handleModalSubmit(interaction);
        return;
      }
    }

    if (interaction.type === InteractionType.MessageComponent) {
      const { customId, values } = interaction;
      if (customId.startsWith("weapons-")) {
        const {
          templateName,
          emojiSelected,
          weaponName,
          weaponCategory,
          weaponId,
        } = getCustomInfo(values[0].split("-"));
        const getCustomEmbedId = customId.split("-")[2];
        const embedsList = embedsMap[templateName];
        if (!embedsList) {
          console.error(`No se encontró la lista de embeds para ${templateName}`);
          return;
        }
        const currentEmbedEntry = embedsList.find(
          (entry) => entry.id.trim() === getCustomEmbedId
        );
        if (!currentEmbedEntry) {
          console.error(`No se encontró el embed correspondiente para ID: ${getCustomEmbedId}`);
          await interaction.followUp({
            content: "No se encontró el embed correspondiente.",
            ephemeral: true,
          });
          return;
        }

        const embed = currentEmbedEntry.embed;
        const newUser = modifyUnitsFromName(embed, weaponCategory);
        if (!newUser) {
          await interaction.reply({
            content: "No puedes seleccionar más unidades de este arma.",
            ephemeral: true,
          });
          return;
        }
        deleteUserIfExistsOnCurrentField(embed, interaction, emojiSelected);
        embed.data.fields.forEach((field) => {
          if (field.name.includes(weaponCategory)) {
            field.value += `\n<:${emojiSelected}:${emojiSelected}> ${interaction.user}`;
          }
        });

        // Actualizar participantes del recordatorio
        try {
          const { updateReminderParticipants, addInterestedUser } = require('./reminderManager');
          const participants = extractParticipantsFromEmbed(embed);
          updateReminderParticipants(interaction.id, participants);
          // Agregar al usuario que hizo clic como interesado
          addInterestedUser(interaction.id, interaction.user.id);
        } catch (reminderError) {
          console.error('[ERROR] Error actualizando participantes del recordatorio:', reminderError);
        }

        // Obtener la URL de la build del arma seleccionada
        try {
          const { getTemplateByName } = require('../services/templateService');
          const { createBuildEmbed, createNoBuildEmbed } = require('./embed');
          const template = await getTemplateByName(templateName, interaction.guild.id);

          if (template && template.weapons) {
            // Buscar el arma específica por weaponId
            let weaponUrl = null;
            let weaponEmoji = null;
            let shouldSendBuild = true; // Por defecto true si no se especifica

            for (const [key, weapon] of Object.entries(template.weapons)) {
              if (weapon.data && Array.isArray(weapon.data)) {
                const weaponItem = weapon.data.find(item => item.id.toString() === weaponId);
                if (weaponItem) {
                  weaponUrl = weaponItem.url;
                  weaponEmoji = weaponItem.emoji;
                  // Verificar si esta arma específica debe enviar build al privado
                  shouldSendBuild = weaponItem.sendBuildToPrivate !== false;
                  break;
                }
              }
            }

            // Solo enviar si la arma específica tiene sendBuildToPrivate habilitado
            if (shouldSendBuild) {
              // Crear y enviar embed con la build
              let buildEmbed;
              if (weaponUrl && weaponUrl.trim() !== '') {
                buildEmbed = createBuildEmbed(weaponCategory, weaponUrl, weaponEmoji, templateName);
              } else {
                buildEmbed = createNoBuildEmbed(weaponCategory, templateName);
              }

              try {
                await interaction.user.send({
                  embeds: [buildEmbed],
                });
              } catch (dmError) {
                console.error('Error enviando mensaje privado:', dmError);
                // Si no se puede enviar DM, responder en el canal
                await interaction.followUp({
                  embeds: [buildEmbed],
                  ephemeral: true,
                });
              }
            }
          }
        } catch (error) {
          console.error('Error obteniendo URL del arma:', error);
        }

        await interaction.update({
          embeds: [embed],
        });
      }
    }
  });
};

const modifyUnitsFromName = (embed, weaponCategory) => {
  let isValidUser = true;
  embed.data.fields.forEach((field) => {
    const regex = /<:(\w+):\1>\s+(.+?)\s+\((\d+)\/(\d+)\):/;
    if (field.name.includes(weaponCategory)) {
      console.log(weaponCategory);
      const match = field.name.match(regex);
      if (match) {
        const currentUnits = parseInt(match[3]); // Obtiene las unidades actuales
        const totalUnits = parseInt(match[4]); // Obtiene el total de unidades
        console.log(currentUnits, totalUnits);
        if (currentUnits < totalUnits) {
          const newUnits = currentUnits + 1; // Incrementa el número de unidades
          const updatedName = field.name.replace(
            /(\d+)\/(\d+)/, // Captura el formato X/Y
            `${newUnits}/${totalUnits}` // Reemplaza por el nuevo conteo
          );
          field.name = updatedName; // Asigna el nombre actualizado
          console.log(updatedName); // Muestra el nombre actualizado
          isValidUser = true;
        } else {
          isValidUser = false; // No se puede incrementar más allá del total
        }
      }
    }
  });
  return isValidUser; // Devuelve si fue una acción válida
};

const getCustomInfo = (values) => {
  const templateName = values[0];
  const emojiSelected = values[1];
  const weaponName = values[2];
  const weaponCategory = values[3];
  const weaponId = values[4];
  return { templateName, emojiSelected, weaponName, weaponCategory, weaponId };
};

// Función eliminada - no se necesita

const deleteUserIfExistsOnCurrentField = (
  embed,
  interaction,
  weaponCategory
) => {
  embed.data.fields.forEach((field) => {
    const regexUnits = /<:(\w+):\1>\s+(.+?)\s+\((\d+)\/(\d+)\):/;
    if (field.value.includes(interaction.user)) {
      const regex = new RegExp(`\\n<:[^:]+:[0-9]+> ${interaction.user}`, "g");
      if (regex) {
        field.value = field.value.replace(regex, "");
      }
      const match = field.name.match(regexUnits);
      if (match) {
        const currentUnits = parseInt(match[3]);
        const newUnits = currentUnits - 1;
        const updatedName = field.name.replace(
          /(\d+)\/(\d+)/,
          `${newUnits}/${match[4]}`
        );
        field.name = updatedName;
      }
    }
  });
};

/**
 * Extrae todos los participantes de un embed
 * @param {Object} embed - El embed del cual extraer participantes
 * @returns {Array} Lista de participantes únicos
 */
const extractParticipantsFromEmbed = (embed) => {
  const participants = new Set();

  try {
    // Verificar si el embed tiene la estructura correcta
    if (embed && embed.data && embed.data.fields) {
      embed.data.fields.forEach((field) => {
        if (field.value && typeof field.value === 'string') {
          // Buscar menciones de usuarios en el formato <@userId> o <@!userId>
          const userMatches = field.value.match(/<@!?(\d+)>/g);
          if (userMatches) {
            userMatches.forEach(match => {
              // Extraer el ID del usuario
              const userId = match.replace(/<@!?(\d+)>/, '$1');
              participants.add(`<@${userId}>`);
            });
          }
        }
      });
    }

    console.log(`[DEBUG] Participantes extraídos: ${Array.from(participants).length} usuarios`);
    return Array.from(participants);
  } catch (error) {
    console.error('[ERROR] Error extrayendo participantes del embed:', error);
    return [];
  }
};

/**
 * Procesa un mensaje que contiene datos hexadecimales automáticamente
 * @param {Message} message - El mensaje de Discord
 */
async function processHexMessage(message) {
  const DungeonDecoder = require('../services/dungeonDecoder');
  const { colorMap, chestEmojis } = require('../utils/dungeonConfig');
  const { createErrorEmbed } = require('../utils/errorEmbeds');

  try {
    // Extraer datos hexadecimales del mensaje
    let hexData = message.content;

    // Limpiar el contenido
    hexData = hexData
      .replace(/\`\`\`[\s\S]*?\`\`\`/g, '') // Remover bloques de código
      .replace(/\`[^`]*\`/g, '') // Remover código inline
      .replace(/\s+/g, ' ') // Normalizar espacios
      .trim();

    // Validar que los datos parezcan ser hexadecimales válidos
    if (!DungeonDecoder.isValidHexData(hexData)) {
      // Solo responder con emoji si claramente son datos de Avalon
      if (hexData.includes('AVA_TEMPLE')) {
        await message.react('❌');
      }
      return;
    }

    // Decodificar los datos
    console.log(`[AUTO-DECODE] Procesando ${hexData.length} caracteres de ${message.author.tag}`);
    const bosses = DungeonDecoder.decode(hexData);

    if (bosses.length === 0) {
      await message.react('🔍');
      return;
    }

    // Reaccionar con éxito
    await message.react('✅');

    // Crear embed principal con resumen
    const mainEmbed = new EmbedBuilder()
      .setTitle('🤖 Calabozo Detectado Automáticamente')
      .setDescription(`Se encontraron **${bosses.length}** jefe(s) en tu mensaje`)
      .setColor('#00D166')
      .addFields({
        name: '📊 Resumen de Cofres',
        value: generateChestSummary(bosses),
        inline: false
      }, {
        name: '🗺️ Orden de Jefes',
        value: bosses.map((boss, index) =>
          `**${index + 1}.** ${boss.name} (Capa ${boss.layer})`
        ).join('\n'),
        inline: false
      }, {
        name: '👤 Detectado de',
        value: `${message.author.toString()}`,
        inline: false
      })
      .setFooter({
        text: 'Avalon Raid Helper - Auto Decoder • Hecho con ❤️ por @chuny-dev',
        iconURL: 'https://i.imgur.com/AfFp7pu.png'
      })
      .setTimestamp();

    // Crear embeds individuales para cada jefe (máximo 4 para evitar spam)
    const maxEmbeds = Math.min(bosses.length, 4);
    const bossEmbeds = bosses.slice(0, maxEmbeds).map((boss, index) => {
      const color = colorMap[boss.color] || '#FFFFFF';
      const emoji = chestEmojis[boss.color] || '📦';

      return new EmbedBuilder()
        .setTitle(`${emoji} ${boss.name}`)
        .setDescription(`**Cofre:** ${boss.color}`)
        .setColor(color)
        .addFields(
          {
            name: '🗂️ Posición',
            value: `#${index + 1}`,
            inline: true
          },
          {
            name: '🏗️ Capa',
            value: `Nivel ${boss.layer}`,
            inline: true
          },
          {
            name: '📍 Índice',
            value: `${boss.position}`,
            inline: true
          }
        )
        .setFooter({
          text: `Jefe ${index + 1} de ${bosses.length} • Auto-detectado`,
          iconURL: 'https://i.imgur.com/AfFp7pu.png'
        })
        .setTimestamp();
    });

    // Responder en el canal
    await message.reply({
      embeds: [mainEmbed, ...bossEmbeds],
      allowedMentions: { repliedUser: false }
    });

    console.log(`[AUTO-DECODE] Respuesta enviada: ${bosses.length} jefes detectados para ${message.author.tag}`);

  } catch (error) {
    console.error('[ERROR] Error en auto-decode:', error);
    await message.react('⚠️');
  }
}

/**
 * Genera un resumen de los tipos de cofres encontrados
 * @param {Array} bosses - Lista de jefes
 * @returns {string} Resumen formateado
 */
function generateChestSummary(bosses) {
  const { chestEmojis } = require('../utils/dungeonConfig');
  const chestCounts = {};

  bosses.forEach(boss => {
    if (boss.color) {
      chestCounts[boss.color] = (chestCounts[boss.color] || 0) + 1;
    }
  });

  const summary = Object.entries(chestCounts)
    .map(([color, count]) => {
      const emoji = chestEmojis[color] || '📦';
      return `${emoji} **${color}**: ${count}`;
    })
    .join('\n');

  return summary || 'Sin información de cofres';
}

module.exports = {
  getEvents,
  extractParticipantsFromEmbed,
};
