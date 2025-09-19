const { InteractionType, Events } = require("discord.js");
const { client } = require("./client");
const { embedsMap } = require("../utils/embed");
const { getOrCreateServer } = require("../services/serverService");
const { filterCommand } = require("./commandFilter");

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

module.exports = {
  getEvents,
  extractParticipantsFromEmbed,
};
