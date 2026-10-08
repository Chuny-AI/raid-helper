const {
  EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, escapeMarkdown,
} = require('discord.js');
const economy = require('../../services/economy/economyService');
const contexts = require('../../services/economy/economyContextService');
const { hasConfiguredEconomyRole } = require('../../services/economy/economyRoleService');
const { UserError, isUserError } = require('../../utils/userError');

const contextOption = (option) => option.setName('contexto')
  .setDescription('Balance al que pertenece la operación')
  .setRequired(true).setAutocomplete(true);
const userOption = (option) => option.setName('usuario')
  .setDescription('Miembro cuyo saldo se consulta o modifica')
  .setRequired(true);
const amountOption = (option) => option.setName('cantidad')
  .setDescription('Cantidad entera positiva')
  .setRequired(true).setMinValue(1);
const reasonOption = (option) => option.setName('motivo')
  .setDescription('Motivo que quedará en el historial y el canal de auditoría')
  .setRequired(true).setMaxLength(300);

const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Gestiona balances por contexto y consulta movimientos')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) => sub.setName('crear-contexto')
    .setDescription('Crea un balance independiente, como Avalonianas o Gremio')
    .addStringOption((option) => option.setName('nombre')
      .setDescription('Nombre del nuevo contexto').setRequired(true).setMaxLength(60)))
  .addSubcommand((sub) => sub.setName('contextos')
    .setDescription('Lista los contextos disponibles en este canal'))
  .addSubcommand((sub) => sub.setName('ver')
    .setDescription('Consulta el saldo de un miembro')
    .addStringOption(contextOption).addUserOption(userOption))
  .addSubcommand((sub) => sub.setName('agregar')
    .setDescription('Suma al saldo y registra el movimiento')
    .addStringOption(contextOption).addUserOption(userOption)
    .addIntegerOption(amountOption).addStringOption(reasonOption))
  .addSubcommand((sub) => sub.setName('quitar')
    .setDescription('Resta del saldo y registra el movimiento')
    .addStringOption(contextOption).addUserOption(userOption)
    .addIntegerOption(amountOption).addStringOption(reasonOption))
  .addSubcommand((sub) => sub.setName('reiniciar')
    .setDescription('Deja el saldo en cero y registra el movimiento')
    .addStringOption(contextOption).addUserOption(userOption))
  .addSubcommand((sub) => sub.setName('historial')
    .setDescription('Muestra los últimos movimientos de un miembro')
    .addStringOption(contextOption).addUserOption(userOption))
  .addSubcommand((sub) => sub.setName('ranking')
    .setDescription('Muestra los mayores saldos del contexto')
    .addStringOption(contextOption));

const formatAmount = (amount) => new Intl.NumberFormat('es-CO').format(amount);
const reply = (interaction, content) => interaction.editReply({ content, allowedMentions: { parse: [] } });
const safeText = (value) => escapeMarkdown(String(value || '').replace(/\s+/g, ' '));

const auditMovement = async (interaction, channel, { context, type, userId, amount, previousBalance, newBalance, reason }) => {
  try {
    const labels = { add: 'Ingreso', remove: 'Retiro', reset: 'Reinicio' };
    const embed = new EmbedBuilder()
      .setTitle(`💰 ${labels[type]} de balance`)
      .setColor(type === 'add' ? 0x57f287 : type === 'remove' ? 0xfee75c : 0xed4245)
      .addFields(
        { name: 'Canal de origen', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'Contexto', value: safeText(context.name), inline: true },
        { name: 'Usuario', value: `<@${userId}>`, inline: true },
        { name: 'Responsable', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Cantidad', value: formatAmount(amount), inline: true },
        { name: 'Antes', value: formatAmount(previousBalance), inline: true },
        { name: 'Después', value: formatAmount(newBalance), inline: true },
        { name: 'Motivo', value: safeText(reason || 'Reinicio de balance') },
      ).setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    console.error('[ERROR] No se pudo publicar auditoría de balance:', error);
    return false;
  }
};

const execute = async (interaction) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!interaction.guildId || !interaction.channelId || !await hasConfiguredEconomyRole(interaction.member, interaction.guildId)) {
      throw new UserError('Solo quienes tengan un rol de balance configurado en `/setup` pueden usar este comando.');
    }
    const action = interaction.options.getSubcommand();
    if (action === 'crear-contexto') {
      const context = await contexts.createContext({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        name: interaction.options.getString('nombre', true),
        createdBy: interaction.user.id,
      });
      return reply(interaction, `✅ Contexto **${safeText(context.name)}** creado. Ya puedes usarlo en los comandos de balance.`);
    }
    if (action === 'contextos') {
      const available = await contexts.listContexts(interaction.guildId, interaction.channelId);
      if (!available.length) return reply(interaction, 'Aún no hay contextos. Usa `/balance crear-contexto` para crear uno.');
      let content = `**Contextos de balance (${available.length})**`;
      let shown = 0;
      for (const context of available) {
        const line = `\n• ${safeText(context.name)}`;
        if (content.length + line.length > 1750) break;
        content += line;
        shown++;
      }
      if (shown < available.length) content += `\n… y ${available.length - shown} más.`;
      return reply(interaction, content);
    }

    const context = await contexts.requireContext(interaction.guildId, interaction.channelId, interaction.options.getString('contexto', true));
    if (action === 'ranking') {
      const leaders = await economy.getLeaderboard(interaction.guildId, interaction.channelId, context.slug, 10);
      return reply(interaction, leaders.length
        ? `**Mayores saldos · ${safeText(context.name)}**\n${leaders.map((item, index) => `${index + 1}. <@${item.userId}> — ${formatAmount(item.balance)}`).join('\n')}`
        : `Todavía no hay saldos positivos en **${safeText(context.name)}**.`);
    }

    const userId = interaction.options.getUser('usuario', true).id;
    if (action === 'ver') {
      const amount = await economy.getBalance(interaction.guildId, interaction.channelId, context.slug, userId);
      return reply(interaction, `**${safeText(context.name)}** · <@${userId}>: **${formatAmount(amount)}**`);
    }
    if (action === 'historial') {
      const movements = await economy.getTransactions(interaction.guildId, interaction.channelId, context.slug, userId, 10);
      const labels = { add: '➕', remove: '➖', reset: '🔄' };
      if (!movements.length) return reply(interaction, `No hay movimientos de <@${userId}> en **${safeText(context.name)}**.`);
      const embed = new EmbedBuilder()
        .setTitle(`Últimos movimientos · ${context.name}`)
        .setDescription(`Usuario: <@${userId}> · Canal: <#${interaction.channelId}>`)
        .setColor(0x5865f2);
      for (const item of movements) {
        const description = safeText(item.description).slice(0, 200);
        embed.addFields({
          name: `${labels[item.type] || '•'} ${formatAmount(item.amount)} · <t:${Math.floor(item.createdAt.getTime() / 1000)}:f>`,
          value: `Por <@${item.executorId}>${description ? ` · ${description}` : ''}`,
        });
      }
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    // El canal debe estar listo antes de escribir. Cada movimiento queda además
    // en MongoDB dentro de la misma transacción que modifica el saldo.
    const logChannelId = await economy.getLogChannel(interaction.guildId, interaction.channelId);
    if (!logChannelId) {
      throw new UserError('Configura el canal de auditoría en `/setup` antes de modificar balances.');
    }
    const auditChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
    if (!auditChannel?.send) {
      throw new UserError('El canal de auditoría configurado ya no está disponible. Actualízalo en `/setup`.');
    }
    const auditPermissions = auditChannel.permissionsFor?.(interaction.guild.members.me);
    if (auditPermissions && !auditPermissions.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])) {
      throw new UserError('El bot necesita permiso para ver, escribir e insertar enlaces en el canal de auditoría.');
    }
    let result;
    let amount;
    let reason;
    let type;
    const common = { guildId: interaction.guildId, channelId: interaction.channelId, contextId: context.slug, userId, executorId: interaction.user.id };
    if (action === 'agregar' || action === 'quitar') {
      amount = interaction.options.getInteger('cantidad', true);
      reason = interaction.options.getString('motivo', true).trim();
      if (!reason) throw new UserError('Escribe un motivo para el movimiento.');
      type = action === 'agregar' ? 'add' : 'remove';
      result = await (type === 'add' ? economy.addMoney : economy.removeMoney)({ ...common, amount, description: reason });
    } else if (action === 'reiniciar') {
      type = 'reset';
      result = await economy.resetBalance(common);
      amount = result.previousBalance;
      result.newBalance = 0;
      reason = 'Reinicio de balance';
    } else {
      throw new UserError('Operación de balance desconocida.');
    }
    const published = await auditMovement(interaction, auditChannel, {
      context, type, userId, amount,
      previousBalance: result.previousBalance,
      newBalance: result.newBalance,
      reason,
    });
    return reply(interaction, `✅ **${safeText(context.name)}** · <@${userId}>: ${formatAmount(result.previousBalance)} → **${formatAmount(result.newBalance)}**.${published ? '' : ' ⚠️ El movimiento se guardó, pero no se pudo publicar en el canal de auditoría.'}`);
  } catch (error) {
    if (!isUserError(error)) console.error('[ERROR] Comando balance:', error);
    return reply(interaction, `❌ ${isUserError(error) ? error.message : 'No se pudo completar la operación de balance.'}`);
  }
};

const autocomplete = async (interaction) => {
  try {
    if (!interaction.guildId || !interaction.channelId || !await hasConfiguredEconomyRole(interaction.member, interaction.guildId)) {
      return interaction.respond([]);
    }
    const available = await contexts.searchContexts(interaction.guildId, interaction.channelId, interaction.options.getFocused());
    return interaction.respond(available.map((context) => ({ name: context.name, value: context.slug })));
  } catch (error) {
    console.error('[ERROR] Autocompletado balance:', error);
    return interaction.respond([]);
  }
};

module.exports = { data, execute, autocomplete, auditMovement };
