const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
} = require('discord.js');

const componentId = (action, userId, guildId) => `setup:${action}:${userId}:${guildId}`;

const parseComponentId = (customId) => {
  const [prefix, action, userId, guildId, extra] = String(customId || '').split(':');
  if (prefix !== 'setup' || !action || !userId || !guildId || extra !== undefined) return null;
  return { action, userId, guildId };
};

const navigationRow = (userId, guildId) => new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId(componentId('home', userId, guildId))
    .setLabel('Volver al resumen')
    .setEmoji('⬅️')
    .setStyle(ButtonStyle.Secondary),
);

const buildDashboard = ({ status, userId, guildId, sourceChannelId }) => {
  const baseStatus = status.baseReady ? '✅ Configurado' : '⚠️ Pendiente';
  const economyStatus = status.economyReady ? '✅ Configurada' : '➖ Opcional';
  const voiceStatus = status.temporaryVoiceReady ? '✅ Configurados' : '➖ Opcional';
  const embed = new EmbedBuilder()
    .setTitle('🧭 Configuración inicial del bot')
    .setDescription('Completa la configuración básica desde este asistente. Los cambios se guardan al seleccionar cada opción.')
    .setColor(status.baseReady ? 0x57f287 : 0xfee75c)
    .addFields(
      {
        name: `${baseStatus} · Roles gestores`,
        value: status.authorizedRoleIds.length > 0
          ? status.authorizedRoleIds.map((id) => `<@&${id}>`).join(', ')
          : 'Selecciona al menos un rol que pueda crear raids y plantillas.',
      },
      {
        name: `${economyStatus} · Economía${sourceChannelId ? ` en <#${sourceChannelId}>` : ''}`,
        value: [
          `Canal: ${status.economyChannelId ? `<#${status.economyChannelId}>` : 'sin configurar'}`,
          `Roles: ${status.economyRoleIds.length > 0 ? status.economyRoleIds.map((id) => `<@&${id}>`).join(', ') : 'sin configurar'}`,
        ].join('\n'),
      },
      {
        name: `${voiceStatus} · Canales de voz temporales`,
        value: status.temporaryVoiceGeneratorIds?.length > 0
          ? status.temporaryVoiceGeneratorIds.map((id) => `<#${id}>`).join(', ')
          : 'Sin canales generadores configurados.',
      },
      {
        name: `${status.raidVoiceCategoryId ? '✅ Configurada' : '➖ Opcional'} · Categoría de voz para raids`,
        value: status.raidVoiceCategoryId
          ? `<#${status.raidVoiceCategoryId}>`
          : 'Selecciona dónde se crearán las salas privadas de los eventos.',
      },
    );

  if (status.staleAuthorizedRoles || status.staleEconomyRoles || status.staleTemporaryVoiceGenerators || status.staleRaidVoiceCategory) {
    embed.addFields({
      name: '🧹 Configuración obsoleta detectada',
      value: 'Hay referencias a roles o canales eliminados. Guarda nuevamente la sección correspondiente para limpiarlas.',
    });
  }

  const mainRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(componentId('roles', userId, guildId)).setLabel('Roles gestores').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(componentId('economy', userId, guildId)).setLabel('Economía').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(componentId('voice', userId, guildId)).setLabel('Salas temporales').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(componentId('raidvoice', userId, guildId)).setLabel('Voz de raids').setEmoji('🎙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(componentId('check', userId, guildId)).setLabel('Verificar permisos').setEmoji('🔎').setStyle(ButtonStyle.Secondary),
  );
  const finishRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(componentId('finish', userId, guildId))
      .setLabel(status.baseReady ? 'Finalizar configuración' : 'Falta un rol gestor')
      .setEmoji(status.baseReady ? '✅' : '⚠️')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!status.baseReady),
  );
  return { embeds: [embed], components: [mainRow, finishRow] };
};

const buildTemporaryVoiceScreen = ({ status, userId, guildId }) => {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(componentId('voice-save', userId, guildId))
    .setPlaceholder('Selecciona hasta 25 canales generadores')
    .setChannelTypes(ChannelType.GuildVoice)
    .setMinValues(1)
    .setMaxValues(25);
  if (status.temporaryVoiceGeneratorIds?.length > 0) {
    channelSelect.setDefaultChannels(...status.temporaryVoiceGeneratorIds.slice(0, 25));
  }

  return {
    embeds: [new EmbedBuilder()
      .setTitle('🔊 Canales de voz temporales')
      .setDescription([
        'Selecciona uno o varios canales de voz que funcionarán como generadores.',
        'Cuando una persona entre, el bot creará una sala dentro de la misma categoría, copiará sus permisos y moverá allí a la persona.',
        'La sala se eliminará automáticamente cuando quede vacía.',
      ].join('\n\n'))
      .setColor(0x5865f2)],
    components: [
      new ActionRowBuilder().addComponents(channelSelect),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(componentId('voice-clear', userId, guildId)).setLabel('Desactivar salas temporales').setEmoji('🧹').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(componentId('home', userId, guildId)).setLabel('Volver al resumen').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
};

const buildRaidVoiceScreen = ({ status, userId, guildId }) => {
  const categorySelect = new ChannelSelectMenuBuilder()
    .setCustomId(componentId('raidvoice-save', userId, guildId))
    .setPlaceholder('Categoría para las salas privadas de raids')
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(1)
    .setMaxValues(1);
  if (status.raidVoiceCategoryId) categorySelect.setDefaultChannels(status.raidVoiceCategoryId);

  return {
    embeds: [new EmbedBuilder()
      .setTitle('🎙️ Categoría de voz para raids')
      .setDescription([
        `Categoría actual: ${status.raidVoiceCategoryId ? `<#${status.raidVoiceCategoryId}>` : 'sin configurar'}.`,
        'Al pulsar **Iniciar evento**, el canal de voz se creará aquí con acceso privado para el líder y los inscritos. El raid se finalizará y esa lista de acceso quedará congelada.',
        'Si no eliges una categoría, los raids existentes seguirán usando la categoría del primer generador de salas temporales.',
      ].join('\n\n'))
      .setColor(0x5865f2)],
    components: [
      new ActionRowBuilder().addComponents(categorySelect),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(componentId('raidvoice-clear', userId, guildId)).setLabel('Quitar categoría de raids').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(componentId('home', userId, guildId)).setLabel('Volver al resumen').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
};

const buildRolesScreen = ({ status, userId, guildId }) => {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(componentId('roles-save', userId, guildId))
    .setPlaceholder('Selecciona hasta 25 roles gestores')
    .setMinValues(1)
    .setMaxValues(25);
  if (status.authorizedRoleIds.length > 0) select.setDefaultRoles(...status.authorizedRoleIds.slice(0, 25));

  return {
    embeds: [new EmbedBuilder()
      .setTitle('🛡️ Roles gestores')
      .setDescription('Quienes tengan cualquiera de estos roles podrán crear y editar raids, plantillas y notificaciones. Los administradores siempre conservan acceso.')
      .setColor(0x5865f2)],
    components: [
      new ActionRowBuilder().addComponents(select),
      navigationRow(userId, guildId),
    ],
  };
};

const buildEconomyScreen = ({ status, userId, guildId, sourceChannelId }) => {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(componentId('economy-roles-save', userId, guildId))
    .setPlaceholder('Selecciona roles de balance')
    .setMinValues(1)
    .setMaxValues(25);
  if (status.economyRoleIds.length > 0) roleSelect.setDefaultRoles(...status.economyRoleIds.slice(0, 25));

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(componentId('economy-channel-save', userId, guildId))
    .setPlaceholder('Selecciona el canal de auditoría')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (status.economyChannelId) channelSelect.setDefaultChannels(status.economyChannelId);

  return {
    embeds: [new EmbedBuilder()
      .setTitle('💰 Configuración de economía')
      .setDescription(`Esta configuración de auditoría corresponde ${sourceChannelId ? `a <#${sourceChannelId}>` : 'al canal actual'}. Los roles de balance se aplican en todo el servidor; los contextos, saldos y movimientos pertenecen solo a este canal.`)
      .setColor(0xf1c40f)],
    components: [
      new ActionRowBuilder().addComponents(roleSelect),
      new ActionRowBuilder().addComponents(channelSelect),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(componentId('economy-clear', userId, guildId)).setLabel('Quitar auditoría de este canal').setEmoji('🧹').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(componentId('economy-roles-clear', userId, guildId)).setLabel('Quitar roles de balance').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(componentId('home', userId, guildId)).setLabel('Volver al resumen').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
};

const permissionChecks = [
  [PermissionFlagsBits.ViewChannel, 'Ver canales'],
  [PermissionFlagsBits.SendMessages, 'Enviar mensajes'],
  [PermissionFlagsBits.EmbedLinks, 'Insertar enlaces'],
  [PermissionFlagsBits.AttachFiles, 'Adjuntar archivos'],
  [PermissionFlagsBits.UseExternalEmojis, 'Usar emojis externos'],
  [PermissionFlagsBits.CreatePrivateThreads, 'Crear hilos privados'],
  [PermissionFlagsBits.SendMessagesInThreads, 'Escribir en hilos'],
  [PermissionFlagsBits.ManageThreads, 'Gestionar hilos'],
];

const buildPermissionScreen = ({ permissions, userId, guildId }) => {
  const lines = permissionChecks.map(([flag, label]) => `${permissions?.has(flag) ? '✅' : '❌'} ${label}`);
  return {
    embeds: [new EmbedBuilder()
      .setTitle('🔎 Verificación de permisos')
      .setDescription(lines.join('\n'))
      .setColor(lines.some((line) => line.startsWith('❌')) ? 0xed4245 : 0x57f287)
      .setFooter({ text: 'La comprobación corresponde al canal donde ejecutaste /setup.' })],
    components: [navigationRow(userId, guildId)],
  };
};

const buildEconomyClearConfirmation = ({ userId, guildId, sourceChannelId }) => ({
  embeds: [new EmbedBuilder()
    .setTitle('⚠️ Quitar auditoría de este canal')
    .setDescription(`Se quitará la configuración de auditoría ${sourceChannelId ? `de <#${sourceChannelId}>` : 'del canal actual'}. Los roles, balances y movimientos existentes no se borrarán.`)
    .setColor(0xed4245)],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(componentId('economy-clear-confirm', userId, guildId)).setLabel('Sí, desactivar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(componentId('economy', userId, guildId)).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
  )],
});

const buildEconomyRolesClearConfirmation = ({ userId, guildId }) => ({
  embeds: [new EmbedBuilder()
    .setTitle('⚠️ Quitar roles de balance')
    .setDescription('Se revocará el acceso a `/balance` en todos los canales del servidor. Los contextos, saldos, movimientos y canales de auditoría configurados se conservarán.')
    .setColor(0xed4245)],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(componentId('economy-roles-clear-confirm', userId, guildId)).setLabel('Sí, quitar roles').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(componentId('economy', userId, guildId)).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
  )],
});

module.exports = {
  buildDashboard,
  buildEconomyClearConfirmation,
  buildEconomyRolesClearConfirmation,
  buildEconomyScreen,
  buildPermissionScreen,
  buildRolesScreen,
  buildRaidVoiceScreen,
  buildTemporaryVoiceScreen,
  componentId,
  parseComponentId,
};
