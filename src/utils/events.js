const { InteractionType, Events } = require("discord.js");
const { client } = require("./client");
const { embedsMap } = require("../utils/embed");

const getEvents = () => {
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`El bot ${readyClient.user.tag} está listo.`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
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

module.exports = {
  getEvents,
};
