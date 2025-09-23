const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createErrorEmbed, createPremiumEmbed } = require('../../utils/errorEmbeds');
const { isServerPremiumSilent } = require('../../middleware/premiumCheckSilent');

/**
 * Comando para calcular división de botín entre jugadores
 * Disponible solo en servidores premium
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('split')
    .setDescription('Calcula la división de botín entre jugadores')
    .addStringOption(option =>
      option
        .setName('motivo')
        .setDescription('Motivo de la división del botín')
        .setRequired(true)
        .setMaxLength(100)
    )
    .addIntegerOption(option =>
      option
        .setName('cantidad_total')
        .setDescription('Cantidad total de dinero a dividir')
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption(option =>
      option
        .setName('jugadores')
        .setDescription('Número de jugadores entre los que dividir')
        .setRequired(true)
        .setMinValue(2)
        .setMaxValue(20)
    ),

  async execute(interaction) {
    try {
      // Verificar si el servidor es premium
      const isPremium = await isServerPremiumSilent(interaction);

      if (!isPremium) {
        const premiumEmbed = createPremiumEmbed();
        return await interaction.reply({
          embeds: [premiumEmbed],
          ephemeral: true
        });
      }

      // Obtener los valores de los parámetros
      const motivo = interaction.options.getString('motivo');
      const cantidadTotal = interaction.options.getInteger('cantidad_total');
      const jugadores = interaction.options.getInteger('jugadores');

      // Calcular la división
      const porJugador = Math.floor(cantidadTotal / jugadores);
      const resto = cantidadTotal % jugadores;

      // Crear el embed de resultado
      const resultEmbed = new EmbedBuilder()
        .setTitle("💰 División de Botín")
        .setDescription(`**Motivo:** ${motivo}`)
        .setColor("#00FF00")
        .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
        .addFields([
          {
            name: "💵 Cantidad Total",
            value: `${cantidadTotal.toLocaleString()} monedas`,
            inline: true
          },
          {
            name: "👥 Jugadores",
            value: `${jugadores} jugadores`,
            inline: true
          },
          {
            name: "💰 Por Jugador",
            value: `${porJugador.toLocaleString()} monedas`,
            inline: true
          }
        ])
        .setFooter({
          text: "Chuny BOT - División",
          iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless"
        })
        .setTimestamp();

      // Si hay resto, añadir información sobre él
      if (resto > 0) {
        resultEmbed.addFields([
          {
            name: "⚠️ Resto",
            value: `${resto} monedas sobran (no se pueden dividir equitativamente)`,
            inline: false
          }
        ]);
      }

      // Añadir redes sociales
      resultEmbed.addFields([
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
          value: `<@${process.env.BOT_OWNER_ID}>`,
          inline: true
        }
      ]);

      await interaction.reply({
        embeds: [resultEmbed]
      });

    } catch (error) {
      console.error('[ERROR] Error en comando split:', error);

      const errorEmbed = createErrorEmbed(
        "Error del Sistema",
        "Hubo un error ejecutando el comando de división de botín."
      );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          embeds: [errorEmbed],
          ephemeral: true
        });
      } else {
        await interaction.reply({
          embeds: [errorEmbed],
          ephemeral: true
        });
      }
    }
  }
};
