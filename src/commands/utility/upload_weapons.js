const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getAllWeapons, createWeapon, deleteWeapon } = require("../../services/weaponService");
const { checkOwner } = require("../../middleware/ownerCheck");
const { checkPremiumAccessWithOwnerBypass } = require("../../middleware/roleCheck");
const { createErrorEmbed, createSuccessEmbed, safeReply } = require("../../utils/errorEmbeds");
const Weapon = require("../../database/models/Weapon");
const fs = require('fs');
const path = require('path');

/**
 * Comando para subir armas desde el archivo weapons.json (solo propietario del bot)
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("upload_weapons")
    .setDescription("Sube armas desde el archivo weapons.json (solo propietario del bot)"),

  async execute(interaction) {
    try {
      const { isServerPremium } = require('../../services/serverService');
      const isPremium = await isServerPremium(interaction.guild.id);

      if (!isPremium) {
        const { EmbedBuilder } = require('discord.js');
        const premiumEmbed = new EmbedBuilder()
          .setTitle("💎 Servidor Premium Requerido")
          .setDescription("Este comando solo está disponible en servidores premium. ¡Contacta a un administrador para activar premium en este servidor!")
          .setColor("#FFD700")
          .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
          .setTimestamp()
          .setFooter({
            text: "Chuny BOT - Premium",
            iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
          })
          .setAuthor({
            name: "Chuny Dev",
            iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless",
            url: "https://www.twitch.tv/chuny_dev",
          })
          .addFields(
            {
              name: "🔗 Mis Redes Sociales",
              value: "¡Sígueme para estar al día con las últimas actualizaciones!",
              inline: false
            },
            {
              name: "🎮 Twitch",
              value: "[@chuny_dev](https://www.twitch.tv/chuny_dev)",
              inline: true
            },
            {
              name: "💬 Discord",
              value: "[Mi Canal](https://discord.gg/6fFHsmewSn)",
              inline: true
            },
            {
              name: "👤 Contacto Directo",
              value: "<@464241835930419210>",
              inline: true
            },
            {
              name: "💡 ¿Cómo obtener Premium?",
              value: "Contacta directamente a <@464241835930419210> o únete a mi [servidor de Discord](https://discord.gg/6fFHsmewSn) para más información.",
              inline: false
            }
          );

        return await interaction.reply({ embeds: [premiumEmbed], ephemeral: true });
      }

      const isOwner = await checkOwner(interaction);
      if (!isOwner) {
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const weaponsFilePath = path.join(__dirname, '../../weapons/weapons.json');

        if (!fs.existsSync(weaponsFilePath)) {
          const errorEmbed = createErrorEmbed(
            "Archivo No Encontrado",
            "No se encontró el archivo weapons.json en la ruta esperada.",
            [{
              name: "Ruta Esperada",
              value: `\`${weaponsFilePath}\``,
              inline: false
            }, {
              name: "Solución",
              value: "Asegúrate de que el archivo weapons.json existe en la carpeta correcta.",
              inline: false
            }]
          );

          await safeReply(interaction, {
            embeds: [errorEmbed],
          });
          return;
        }

        const jsonContent = fs.readFileSync(weaponsFilePath, 'utf8');
        const weaponsData = JSON.parse(jsonContent);

        if (!weaponsData.weapons || typeof weaponsData.weapons !== 'object') {
          throw new Error("La estructura del JSON debe contener una propiedad 'weapons' como objeto.");
        }

        let createdCount = 0;
        let deletedCount = 0;
        let failedCount = 0;

        const deleteResult = await Weapon.deleteMany({});
        deletedCount = deleteResult.deletedCount;

        for (const categoryKey in weaponsData.weapons) {
          const categoryData = weaponsData.weapons[categoryKey];
          const categoryDisplayName = categoryData.displayName;
          const categoryDefaultEmoji = categoryData.defaultEmoji;

          for (const weaponItem of categoryData.data) {
            const { emoji, name, image = "", url = "", sendBuildToPrivate = true } = weaponItem;
            const emojiId = emoji;

            if (!emojiId || !name) {
              console.warn(`[WARNING] Arma inválida en JSON (sin emojiId o nombre):`, weaponItem);
              failedCount++;
              continue;
            }

            try {
              await createWeapon({
                emojiId,
                name,
                category: categoryKey,
                categoryDisplayName,
                categoryDefaultEmoji,
                image,
                url,
                sendBuildToPrivate
              });
              createdCount++;
            } catch (dbError) {
              console.error(`[ERROR] Error al procesar arma ${name} (${emojiId}):`, dbError);
              failedCount++;
            }
          }
        }

        const embed = createSuccessEmbed(
          "Carga de Armas Completada",
          "Las armas han sido cargadas exitosamente desde el archivo weapons.json.",
          [
            { name: "Armas Creadas", value: createdCount.toString(), inline: true },
            { name: "Armas Eliminadas", value: deletedCount.toString(), inline: true },
            { name: "Armas Fallidas", value: failedCount.toString(), inline: true }
          ]
        );

        await safeReply(interaction, { embeds: [embed] });
      } catch (error) {
        console.error('[ERROR] Error durante la carga de armas:', error);
        const errorEmbed = createErrorEmbed(
          "Error Durante la Carga",
          `Ocurrió un error durante la carga de armas: ${error.message}`,
          [{
            name: "Solución",
            value: "Verifica que el archivo weapons.json tenga la estructura correcta y vuelve a intentar.",
            inline: false
          }]
        );

        await safeReply(interaction, {
          embeds: [errorEmbed],
        });
      }
    } catch (error) {
      console.error('[ERROR] Error en comando upload_weapons:', error);
      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de carga de armas.",
        [{
          name: "Solución",
          value: "Intenta ejecutar el comando de nuevo. Si el problema persiste, contacta al soporte.",
          inline: false
        }]
      );

      await safeReply(interaction, {
        embeds: [errorEmbed],
        ephemeral: true,
      });
    }
  },
};
