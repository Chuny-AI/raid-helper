const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createErrorEmbed, createPremiumEmbed } = require('../../utils/errorEmbeds');
const EconomyService = require('../../services/economyService');
const { isServerPremiumSilent } = require('../../middleware/premiumCheckSilent');
const { checkPremiumAccessWithOwnerBypass } = require('../../middleware/roleCheck');

/**
 * Comando de economía con subcomandos para gestionar dinero de usuarios
 * Requiere permisos de administrador o roles autorizados
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('Gestiona la economía del servidor')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add-money')
        .setDescription('Añade dinero a un usuario')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuario al que añadir dinero')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('cantidad')
            .setDescription('Cantidad de dinero a añadir')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(999999999)
        )
        .addStringOption(option =>
          option
            .setName('razon')
            .setDescription('Razón para añadir el dinero')
            .setRequired(false)
            .setMaxLength(200)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove-money')
        .setDescription('Elimina dinero de un usuario')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuario al que eliminar dinero')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('cantidad')
            .setDescription('Cantidad de dinero a eliminar')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(999999999)
        )
        .addStringOption(option =>
          option
            .setName('razon')
            .setDescription('Razón para eliminar el dinero')
            .setRequired(false)
            .setMaxLength(200)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('balance')
        .setDescription('Muestra el balance de un usuario')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuario del que ver el balance (opcional)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('top')
        .setDescription('Muestra el top 10 de usuarios con más dinero')
        .addIntegerOption(option =>
          option
            .setName('limite')
            .setDescription('Número de usuarios a mostrar (máximo 20)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20)
        )
    ),

  async execute(interaction) {
    try {
      // Verificar premium ANTES de defer para poder usar ephemeral
      const isPremium = await isServerPremiumSilent(interaction);
      if (!isPremium) {
        const premiumEmbed = createPremiumEmbed();
        await interaction.reply({
          embeds: [premiumEmbed],
          ephemeral: true
        });
        return;
      }

      // Solo defer si es premium
      await interaction.deferReply();

      const subcommand = interaction.options.getSubcommand();
      const serverId = interaction.guild.id;

      // Solo verificar permisos administrativos para comandos de gestión
      if (subcommand === 'add-money' || subcommand === 'remove-money') {
        const hasAdminPermission = await checkPremiumAccessWithOwnerBypass(interaction);
        if (!hasAdminPermission) {
          return;
        }
      }

      switch (subcommand) {
        case 'add-money':
          await this.handleAddMoney(interaction, serverId);
          break;
        case 'remove-money':
          await this.handleRemoveMoney(interaction, serverId);
          break;
        case 'balance':
          await this.handleBalance(interaction, serverId);
          break;
        case 'top':
          await this.handleTop(interaction, serverId);
          break;
        default:
          throw new Error('Subcomando no reconocido');
      }

    } catch (error) {
      console.error('[ECONOMY] Error en comando economy:', error);

      const errorEmbed = createErrorEmbed(
        'Error en Economía',
        'Hubo un error al procesar el comando de economía.',
        [{
          name: '🔧 Solución',
          value: 'Verifica los parámetros ingresados y vuelve a intentarlo.',
          inline: false
        }, {
          name: '🆘 Error Técnico',
          value: `\`${error.message}\``,
          inline: false
        }, {
          name: '🔗 Mis Redes Sociales',
          value: '¡Sígueme para estar al día con las últimas actualizaciones!',
          inline: false
        }, {
          name: '🎮 Twitch',
          value: '[@chuny_dev](https://www.twitch.tv/chuny_dev)',
          inline: true
        }, {
          name: '💬 Discord',
          value: '[Mi Canal](https://discord.gg/6fFHsmewSn)',
          inline: true
        }, {
          name: '👤 Contacto Directo',
          value: `<@${process.env.BOT_OWNER_ID}>`,
          inline: true
        }, {
          name: '💡 ¿Necesitas Ayuda?',
          value: `Contacta directamente a <@${process.env.BOT_OWNER_ID}> o únete a mi servidor de Discord para soporte.`,
          inline: false
        }]
      );

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  async handleAddMoney(interaction, serverId) {
    const targetUser = interaction.options.getUser('usuario');
    const amount = interaction.options.getInteger('cantidad');
    const reason = interaction.options.getString('razon') || 'No especificada';

    if (targetUser.bot) {
      throw new Error('No puedes añadir dinero a un bot');
    }

    const result = await EconomyService.addMoney(targetUser.id, serverId, amount);

    const addMoneyEmbed = new EmbedBuilder()
      .setTitle('💰 Dinero Añadido')
      .setDescription(`Se ha añadido dinero exitosamente a **${targetUser.displayName}**`)
      .setColor('#00FF00')
      .addFields([
        {
          name: '👤 Usuario',
          value: `${targetUser}`,
          inline: true
        },
        {
          name: '💵 Cantidad Añadida',
          value: `${EconomyService.formatCurrency(amount)}`,
          inline: true
        },
        {
          name: '🏦 Nuevo Balance',
          value: `${EconomyService.formatCurrency(result.newBalance)}`,
          inline: true
        },
        {
          name: '📝 Razón',
          value: reason,
          inline: false
        },
        {
          name: '🔗 Mis Redes Sociales',
          value: '¡Sígueme para estar al día con las últimas actualizaciones!',
          inline: false
        },
        {
          name: '🎮 Twitch',
          value: '[@chuny_dev](https://www.twitch.tv/chuny_dev)',
          inline: true
        },
        {
          name: '💬 Discord',
          value: '[Mi Canal](https://discord.gg/6fFHsmewSn)',
          inline: true
        },
        {
          name: '👤 Contacto Directo',
          value: `<@${process.env.BOT_OWNER_ID}>`,
          inline: true
        }
      ])
      .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
      .setFooter({
        text: "Chuny BOT - Economía",
        iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless"
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [addMoneyEmbed] });
  },

  async handleRemoveMoney(interaction, serverId) {
    const targetUser = interaction.options.getUser('usuario');
    const amount = interaction.options.getInteger('cantidad');
    const reason = interaction.options.getString('razon') || 'No especificada';

    if (targetUser.bot) {
      throw new Error('No puedes eliminar dinero de un bot');
    }

    const result = await EconomyService.removeMoney(targetUser.id, serverId, amount);

    const removeMoneyEmbed = new EmbedBuilder()
      .setTitle('💸 Dinero Eliminado')
      .setDescription(`Se ha eliminado dinero exitosamente de **${targetUser.displayName}**`)
      .setColor('#FFA500')
      .addFields([
        {
          name: '👤 Usuario',
          value: `${targetUser}`,
          inline: true
        },
        {
          name: '💵 Cantidad Eliminada',
          value: `${EconomyService.formatCurrency(amount)}`,
          inline: true
        },
        {
          name: '🏦 Nuevo Balance',
          value: `${EconomyService.formatCurrency(result.newBalance)}`,
          inline: true
        },
        {
          name: '📝 Razón',
          value: reason,
          inline: false
        },
        {
          name: '🔗 Mis Redes Sociales',
          value: '¡Sígueme para estar al día con las últimas actualizaciones!',
          inline: false
        },
        {
          name: '🎮 Twitch',
          value: '[@chuny_dev](https://www.twitch.tv/chuny_dev)',
          inline: true
        },
        {
          name: '💬 Discord',
          value: '[Mi Canal](https://discord.gg/6fFHsmewSn)',
          inline: true
        },
        {
          name: '👤 Contacto Directo',
          value: `<@${process.env.BOT_OWNER_ID}>`,
          inline: true
        }
      ])
      .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
      .setFooter({
        text: "Chuny BOT - Economía",
        iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless"
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [removeMoneyEmbed] });
  },

  async handleBalance(interaction, serverId) {
    const targetUser = interaction.options.getUser('usuario') || interaction.user;

    if (targetUser.bot) {
      throw new Error('Los bots no tienen balance');
    }

    const balance = await EconomyService.getBalance(targetUser.id, serverId);

    const balanceEmbed = new EmbedBuilder()
      .setTitle('💰 Balance del Usuario')
      .setDescription(`Balance actual de **${targetUser.displayName}**`)
      .setColor('#0099FF')
      .addFields([
        {
          name: '👤 Usuario',
          value: `${targetUser}`,
          inline: true
        },
        {
          name: '🏦 Balance Total',
          value: `${EconomyService.formatCurrency(balance)}`,
          inline: true
        },
        {
          name: '📅 Consulta',
          value: new Date().toLocaleString('es-ES'),
          inline: true
        },
        {
          name: '🔗 Mis Redes Sociales',
          value: '¡Sígueme para estar al día con las últimas actualizaciones!',
          inline: false
        },
        {
          name: '🎮 Twitch',
          value: '[@chuny_dev](https://www.twitch.tv/chuny_dev)',
          inline: true
        },
        {
          name: '💬 Discord',
          value: '[Mi Canal](https://discord.gg/6fFHsmewSn)',
          inline: true
        },
        {
          name: '👤 Contacto Directo',
          value: `<@${process.env.BOT_OWNER_ID}>`,
          inline: true
        }
      ])
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setFooter({
        text: "Chuny BOT - Economía",
        iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless"
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [balanceEmbed] });
  },

  async handleTop(interaction, serverId) {
    const limit = interaction.options.getInteger('limite') || 10;
    const topUsers = await EconomyService.getTopUsers(serverId, limit);

    if (topUsers.length === 0) {
      const noDataEmbed = new EmbedBuilder()
        .setTitle('📊 Top Usuarios - Sin Datos')
        .setDescription('No hay datos de economía para este servidor.')
        .setColor('#FFA500')
        .addFields([
          {
            name: '🔗 Mis Redes Sociales',
            value: '¡Sígueme para estar al día con las últimas actualizaciones!',
            inline: false
          },
          {
            name: '🎮 Twitch',
            value: '[@chuny_dev](https://www.twitch.tv/chuny_dev)',
            inline: true
          },
          {
            name: '💬 Discord',
            value: '[Mi Canal](https://discord.gg/6fFHsmewSn)',
            inline: true
          },
          {
            name: '👤 Contacto Directo',
            value: `<@${process.env.BOT_OWNER_ID}>`,
            inline: true
          }
        ])
        .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless")
        .setFooter({
          text: "Chuny BOT - Economía",
          iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless"
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [noDataEmbed] });
      return;
    }

    const topEmbed = new EmbedBuilder()
      .setTitle(`📊 Top ${limit} Usuarios - Economía`)
      .setDescription('Usuarios con más dinero en el servidor')
      .setColor('#FFD700')
      .setThumbnail("https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless");

    let ranking = '';
    const medals = ['🥇', '🥈', '🥉'];

    for (let i = 0; i < topUsers.length; i++) {
      const user = topUsers[i];
      const medal = i < 3 ? medals[i] : `**${i + 1}.**`;
      ranking += `${medal} <@${user.userId}> - ${EconomyService.formatCurrency(user.balance)}\n`;
    }

    topEmbed.addFields([
      {
        name: '🏆 Ranking',
        value: ranking,
        inline: false
      },
      {
        name: '🔗 Mis Redes Sociales',
        value: '¡Sígueme para estar al día con las últimas actualizaciones!',
        inline: false
      },
      {
        name: '🎮 Twitch',
        value: '[@chuny_dev](https://www.twitch.tv/chuny_dev)',
        inline: true
      },
      {
        name: '💬 Discord',
        value: '[Mi Canal](https://discord.gg/6fFHsmewSn)',
        inline: true
      },
      {
        name: '👤 Contacto Directo',
        value: `<@${process.env.BOT_OWNER_ID}>`,
        inline: true
      }
    ])
      .setFooter({
        text: "Chuny BOT - Economía",
        iconURL: "https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless"
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [topEmbed] });
  }
};
