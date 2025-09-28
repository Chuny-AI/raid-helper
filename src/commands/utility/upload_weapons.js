const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getAllWeapons, createWeapon, deleteWeapon } = require("../../services/weaponService");
const { isOwner } = require("../../middleware/ownerCheck");
const { isServerPremium } = require("../../services/serverService");
const { createErrorEmbed, createSuccessEmbed, createPremiumEmbed, safeReply } = require("../../utils/errorEmbeds");
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
      // JERARQUÍA DE VALIDACIONES:
      // 1. Verificar estado premium del servidor
      // 2. Verificar que es el propietario del bot
      // 3. Proceder con la carga de armas

      // 1. PRIMERA PRIORIDAD: Verificar estado premium
      const isPremium = await isServerPremium(interaction.guild.id);
      if (!isPremium) {
        // Solo el propietario puede usar comandos en servidores no premium
        const ownerCheck = await isOwner(interaction);
        if (!ownerCheck) {
          const premiumEmbed = createPremiumEmbed();
          return await safeReply(interaction, { embeds: [premiumEmbed], ephemeral: true });
        }
      }

      // 2. SEGUNDA PRIORIDAD: Verificar que es el propietario del bot
      const ownerCheck = await isOwner(interaction);
      if (!ownerCheck) {
        const errorEmbed = createErrorEmbed(
          "Acceso Denegado",
          "Solo el propietario del bot puede usar este comando.",
          [{
            name: "Permisos Requeridos",
            value: "• Propietario del bot",
            inline: false
          }]
        );
        return await safeReply(interaction, { embeds: [errorEmbed], ephemeral: true });
      }

      // 3. TERCERA PRIORIDAD: Proceder con la carga de armas
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

