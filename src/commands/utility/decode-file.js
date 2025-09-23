const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const DungeonDecoder = require('../../services/dungeonDecoder');
const { colorMap, chestEmojis, chestPriority, albionBackgrounds } = require('../../utils/dungeonConfig');
const { createErrorEmbed } = require('../../utils/errorEmbeds');
const AuthorizedUserService = require('../../services/authorizedUserService');

/**
 * Comando para decodificar información de calabozos de Avalon desde archivos
 * SOLO para usuarios autorizados en la base de datos (owner siempre autorizado)
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('decode-file')
    .setDescription('Decodifica calabozos de Avalon desde un archivo con datos hexadecimales')
    .addAttachmentOption(option =>
      option
        .setName('archivo')
        .setDescription('Archivo .txt/.dat con los datos hexadecimales del Cheat Engine')
        .setRequired(true)
    ),

  async execute(interaction) {
    console.log(`[DECODE-FILE] Comando ejecutado por ${interaction.user.tag} (${interaction.user.id})`);

    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('[DECODE-FILE] Error al defer reply:', error);
      try {
        await interaction.reply({
          content: '⚠️ Error de conexión con Discord. Intenta de nuevo.',
          ephemeral: true
        });
      } catch (secondError) {
        console.error('[DECODE-FILE] Error crítico en interaction:', secondError);
      }
      return;
    }

    try {
      // VERIFICAR AUTORIZACIÓN (El owner siempre puede usar el comando)
      const ownerId = process.env.BOT_OWNER_ID;
      const isOwner = interaction.user.id === ownerId;
      const isAuthorized = isOwner || await AuthorizedUserService.isUserAuthorized(interaction.user.id);

      if (!isAuthorized) {
        const unauthorizedEmbed = createErrorEmbed(
          'Acceso Denegado',
          'No tienes autorización para usar este comando.',
          [{
            name: '🔒 Comando Restringido',
            value: 'El comando `decode-file` está limitado a usuarios autorizados específicamente.',
            inline: false
          }, {
            name: '📞 ¿Necesitas Acceso?',
            value: 'Contacta a un administrador del bot para solicitar autorización.',
            inline: false
          }, {
            name: '👤 Tu ID de Usuario',
            value: `\`${interaction.user.id}\``,
            inline: false
          }]
        );

        await interaction.editReply({ embeds: [unauthorizedEmbed] });
        console.log(`[DECODE-FILE] Acceso denegado para ${interaction.user.tag} (${interaction.user.id})`);
        return;
      }

      console.log(`[DECODE-FILE] Usuario autorizado: ${interaction.user.tag} (${interaction.user.id})${isOwner ? ' (OWNER)' : ''}`);

      const attachment = interaction.options.getAttachment('archivo');

      if (!attachment.name.match(/\.(txt|dat|hex|log)$/i)) {
        const errorEmbed = createErrorEmbed(
          'Formato de Archivo Inválido',
          'El archivo debe ser de tipo texto (.txt, .dat, .hex, .log)',
          [{
            name: '📋 Formatos Soportados',
            value: '• `.txt` - Archivo de texto\n• `.dat` - Archivo de datos\n• `.hex` - Archivo hexadecimal\n• `.log` - Archivo de log',
            inline: false
          }, {
            name: '📁 Archivo Recibido',
            value: `Nombre: \`${attachment.name}\`\nTamaño: ${Math.round(attachment.size / 1024)}KB`,
            inline: false
          }]
        );

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Validar tamaño del archivo (máximo 8MB por Discord)
      if (attachment.size > 8 * 1024 * 1024) {
        const errorEmbed = createErrorEmbed(
          'Archivo Muy Grande',
          'El archivo es demasiado grande. Máximo permitido: 8MB',
          [{
            name: '📏 Tamaño del Archivo',
            value: `${Math.round(attachment.size / 1024 / 1024 * 100) / 100}MB`,
            inline: false
          }]
        );

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      console.log(`[DECODE-FILE] Descargando archivo: ${attachment.name} (${attachment.size} bytes)`);

      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`Error al descargar archivo: ${response.status}`);
      }

      const fileContent = await response.text();
      console.log(`[DECODE-FILE] Archivo leído: ${fileContent.length} caracteres`);

      const hexData = fileContent
        .replace(/\s+/g, ' ')  // Reemplazar múltiples espacios por uno solo
        .replace(/\n/g, ' ')   // Reemplazar saltos de línea por espacios
        .trim();

      if (!DungeonDecoder.isValidHexData(hexData)) {
        const errorEmbed = createErrorEmbed(
          'Datos Inválidos en el Archivo',
          'El contenido del archivo no parece contener datos hexadecimales válidos.',
          [{
            name: '📋 Formato Esperado',
            value: 'Datos hexadecimales obtenidos del Cheat Engine usando:\n• **Primer piso:** `AVA_TEMPLE_START_First_Level_01`\n• **Segundo piso:** `AVA_TEMPLE_START`',
            inline: false
          }, {
            name: '🔍 Contenido Encontrado',
            value: `\`\`\`${fileContent.substring(0, 200)}${fileContent.length > 200 ? '...' : ''}\`\`\``,
            inline: false
          }]
        );

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      console.log(`[DECODE-FILE] Iniciando decodificación de ${hexData.length} caracteres`);
      const bosses = DungeonDecoder.decode(hexData);

      if (bosses.length === 0) {
        const warningEmbed = new EmbedBuilder()
          .setTitle('🔍 Sin Resultados')
          .setDescription('No se encontraron jefes en el archivo proporcionado.')
          .setColor('#FFA500')
          .addFields({
            name: '🤔 Posibles Causas',
            value: '• Los datos pueden ser de una zona diferente\n• Los datos pueden estar incompletos\n• El formato puede no ser el correcto',
            inline: false
          })
          .setFooter({
            text: 'Chuny BOT - Decoder',
            iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [warningEmbed] });
        return;
      }

      const highestPriorityColor = this.getHighestPriorityChest(bosses);
      const embedColor = colorMap[highestPriorityColor] || '#FFD700';
      const randomBackground = albionBackgrounds[Math.floor(Math.random() * albionBackgrounds.length)];

      const dungeonEmbed = new EmbedBuilder()
        .setTitle('🏰 Calabozo de Avalon Decodificado')
        .setDescription(`Encontrados **${bosses.length} jefes** • Analizados por **${interaction.user.displayName}**`)
        .setColor(embedColor)
        .setImage(randomBackground)
        .addFields({
          name: '👑 Jefes Encontrados',
          value: bosses.map((boss, index) => {
            const emoji = chestEmojis[boss.color] || '📦';
            return `${emoji} **${boss.name}** - ${boss.color}`;
          }).join('\n'),
          inline: false
        }, {
          name: '📊 Resumen de Cofres',
          value: this.generateChestSummary(bosses),
          inline: true
        }, {
          name: '💎 Mejor Cofre',
          value: `${chestEmojis[highestPriorityColor] || '📦'} **${highestPriorityColor}**`,
          inline: true
        })
        .setFooter({
          text: `Chuny BOT • ${attachment.name}`,
          iconURL: 'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless'
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [dungeonEmbed] });

      console.log(`[DECODE-FILE] Decodificación exitosa: ${bosses.length} jefes • Mejor cofre: ${highestPriorityColor}`);

    } catch (error) {
      console.error('[ERROR] Error en comando decode-file:', error);

      const errorEmbed = createErrorEmbed(
        'Error de Decodificación',
        'Hubo un error al procesar el archivo del calabozo.',
        [{
          name: '🔧 Solución',
          value: 'Verifica que el archivo contenga datos válidos y vuelve a intentarlo.',
          inline: false
        }, {
          name: '🆘 Error Técnico',
          value: `\`${error.message}\``,
          inline: false
        }]
      );

      try {
        if (interaction.deferred) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyError) {
        console.error('[DECODE-FILE] Error al enviar mensaje de error:', replyError);
      }
    }
  },

  /**
   * Genera un resumen de los tipos de cofres encontrados
   * @param {Array} bosses - Lista de jefes
   * @returns {string} Resumen formateado
   */
  generateChestSummary(bosses) {
    const chestCounts = {};

    bosses.forEach(boss => {
      if (boss.color) {
        chestCounts[boss.color] = (chestCounts[boss.color] || 0) + 1;
      }
    });

    const summary = Object.entries(chestCounts)
      .map(([color, count]) => {
        const emoji = chestEmojis[color] || '📦';
        return `${emoji} **${count}x** ${color}`;
      })
      .join('\n');

    return summary || 'Sin información de cofres';
  },

  /**
   * Determina el cofre de mayor prioridad encontrado
   * @param {Array} bosses - Lista de jefes
   * @returns {string} Color del cofre de mayor prioridad
   */
  getHighestPriorityChest(bosses) {
    let highestPriority = 0;
    let highestColor = 'Verde'; // Default

    bosses.forEach(boss => {
      if (boss.color && chestPriority[boss.color]) {
        if (chestPriority[boss.color] > highestPriority) {
          highestPriority = chestPriority[boss.color];
          highestColor = boss.color;
        }
      }
    });

    return highestColor;
  }
};
