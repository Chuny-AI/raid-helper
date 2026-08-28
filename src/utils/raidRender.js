/**
 * Renderiza el embed y los componentes (select + botones) de un raid a partir
 * de su estado estructurado (`raidState`). Sustituye a la generación/mutación
 * de texto que hacía src/utils/embed.js + src/utils/select.js.
 *
 * El embed NUNCA se muta: se reconstruye completo en cada interacción a partir
 * del estado, así que no hay líneas fantasma ni contadores desincronizados.
 */
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const {
  availableSlots,
  slotOccupancy,
  groupOccupancy,
  countActiveParticipants,
} = require('../services/raidState');

const BRAND_ICON =
  'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless';

const WAITLIST_FIELD_NAME = '🕒 Lista de espera';
const CANNOTGO_FIELD_NAME = '🚫 No puedo ir';
const MAX_OPTIONS_PER_SELECT = 25;
const MAX_ROWS = 5;

/**
 * Trunca el valor de un campo embed para no superar el límite de 1024 chars de Discord.
 * @param {string} value
 */
function safeFieldValue(value) {
  const MAX = 1024;
  if (typeof value !== 'string') return '​';
  if (value.length <= MAX) return value;
  const lines = value.split('\n');
  let result = '';
  for (const line of lines) {
    if ((result + '\n' + line).length > MAX - 20) break;
    result = result ? `${result}\n${line}` : line;
  }
  return result + '\n*(truncado)*';
}

function groupDisplayName(state, groupKey) {
  const g = state.groups.find((g) => g.groupKey === groupKey);
  return g ? g.displayName : groupKey;
}

function formatEmoji(emoji) {
  if (!emoji) return '';
  if (/^\d+$/.test(String(emoji))) return `<:weapon:${emoji}>`;
  return String(emoji);
}

/**
 * Construye los fields de grupo, uno por grupo, en el orden congelado en `state.groups`.
 */
function buildGroupFields(state) {
  const fields = [];
  const sortedGroups = [...state.groups].sort((a, b) => a.order - b.order);

  for (const group of sortedGroups) {
    const slots = state.slots
      .filter((s) => s.groupKey === group.groupKey)
      .sort((a, b) => a.itemIndex - b.itemIndex);
    if (slots.length === 0) continue;

    const { current } = groupOccupancy(state, group.groupKey);
    const emojiTag = group.emoji ? `<:${group.emoji}:${group.emoji}> ` : '';
    const name = `${emojiTag}${group.displayName} (${current}/${group.maxPlayers}):`;

    const lines = [];
    for (const slot of slots) {
      for (const u of slot.users || []) {
        lines.push(`${formatEmoji(slot.emoji)} ${slot.label || slot.weaponName} <@${u.userId}>`);
      }
    }

    fields.push({
      name,
      value: safeFieldValue(lines.length > 0 ? lines.join('\n') : '​'),
      inline: true,
    });
  }

  return fields;
}

function buildSocialFields() {
  return [
    {
      name: '🔗 Mis Redes Sociales',
      value: '¡Sígueme para estar al día con las últimas actualizaciones!',
      inline: false,
    },
    { name: '🎮 Twitch', value: '[@chuny_dev](https://www.twitch.tv/chuny_dev)', inline: true },
    { name: '💬 Discord', value: '[Mi Canal](https://discord.gg/6fFHsmewSn)', inline: true },
    { name: '👤 Contacto Directo', value: '<@464241835930419210>', inline: true },
  ];
}

/**
 * Construye el EmbedBuilder completo del raid a partir de su estado.
 * @param {Object} raid - Documento RaidEvent (o plano con la misma forma)
 * @param {Object} state - Estado estructurado (mismo raid, o el objeto de migración)
 */
function renderRaidEmbed(raid, state) {
  const embed = new EmbedBuilder();
  const isClosed = raid.status === 'closed';
  const baseTitle = raid.title || '(sin título)';

  embed.setTitle(isClosed ? `🔒 [FINALIZADO] ${baseTitle}` : baseTitle);
  embed.setColor(isClosed ? '#808080' : raid.color || '#00FFFF');
  if (raid.description) embed.setDescription(raid.description);
  if (raid.image) embed.setImage(raid.image);
  embed.setAuthor({ name: 'Chuny', iconURL: BRAND_ICON, url: 'https://www.linkedin.com/in/edwinjpa/' });
  embed.setFooter({
    text: raid.eventId ? `Raid #${raid.eventId} • Creado con ❤️ por Chuny` : 'Creado con ❤️ por Chuny',
    iconURL: BRAND_ICON,
  });
  embed.setTimestamp();

  const fields = [];

  fields.push({
    name: 'Líder de la actividad:',
    value: state.leaderId ? `<@${state.leaderId}>` : '—',
  });

  if (raid.eventTimestamp) {
    fields.push({
      name: 'Hora de la actividad:',
      value: `<t:${raid.eventTimestamp}:F> (<t:${raid.eventTimestamp}:R>)`,
    });
  }

  fields.push({
    name: 'Armas a utilizar:',
    value: 'Revisa la lista de armas en el mensaje anclado.',
  });

  if (raid.rolesToNotify && raid.rolesToNotify.length > 0) {
    fields.push({
      name: 'Roles válidos:',
      value: raid.rolesToNotify.map((roleId) => `<@&${roleId}>`).join(', '),
    });
  }

  fields.push(...buildGroupFields(state));

  if (state.looters && state.looters.max > 0) {
    const lines = (state.looters.users || []).map((u) => `<@${u.userId}>`);
    fields.push({
      name: `👑 Looters (${state.looters.users.length}/${state.looters.max}):`,
      value: safeFieldValue(lines.length > 0 ? lines.join('\n') : '​'),
      inline: false,
    });
  }

  fields.push({
    name: '👥 Participantes',
    value: String(countActiveParticipants(state)),
    inline: false,
  });

  if (state.waitlist && state.waitlist.length > 0) {
    const lines = state.waitlist.map((w) => `<@${w.userId}>`);
    fields.push({ name: WAITLIST_FIELD_NAME, value: safeFieldValue(lines.join('\n')), inline: false });
  }

  if (state.cannotGo && state.cannotGo.length > 0) {
    const lines = state.cannotGo.map((c) => `<@${c.userId}>`);
    fields.push({ name: CANNOTGO_FIELD_NAME, value: safeFieldValue(lines.join('\n')), inline: false });
  }

  if (isClosed && (raid.closedBy || raid.closedAt)) {
    const who = raid.closedBy ? `<@${raid.closedBy}>` : 'desconocido';
    const when = raid.closedAt ? `<t:${Math.floor(new Date(raid.closedAt).getTime() / 1000)}:R>` : '';
    fields.push({ name: '🔒 Estado', value: `Finalizado por ${who}${when ? ` · ${when}` : ''}` });
  }

  fields.push(...buildSocialFields());

  embed.addFields(fields);
  return embed;
}

function optionFromSlot(state, slot) {
  const { current, max } = slotOccupancy(state, slot.slotId);
  const groupName = groupDisplayName(state, slot.groupKey);
  const label = slot.label || slot.weaponName || 'Arma';

  // Un grupo puede repetir la misma arma en varios slots (cada uno con su propio
  // cupo). Con etiquetas idénticas el usuario no sabría cuál está eligiendo, así
  // que se numeran las repetidas por su orden dentro del grupo.
  const sameLabel = state.slots.filter(
    (s) => s.groupKey === slot.groupKey && (s.label || s.weaponName || 'Arma') === label
  );
  const suffix = sameLabel.length > 1
    ? ` (${sameLabel.findIndex((s) => s.slotId === slot.slotId) + 1}/${sameLabel.length})`
    : '';

  const opt = new StringSelectMenuOptionBuilder()
    .setLabel(`${label}${suffix}`.slice(0, 100))
    .setValue(slot.slotId)
    .setDescription(`Grupo: ${groupName} · ${current}/${max}`.slice(0, 100));
  if (slot.emoji && /^\d+$/.test(String(slot.emoji))) opt.setEmoji(String(slot.emoji));
  return opt;
}

/** Reparte slots disponibles en selects de <=25 opciones, sin partir un grupo salvo que lo exceda solo. */
function binPackSlotsByGroup(slots) {
  const byGroup = new Map();
  for (const slot of slots) {
    if (!byGroup.has(slot.groupKey)) byGroup.set(slot.groupKey, []);
    byGroup.get(slot.groupKey).push(slot);
  }

  const bins = [];
  for (const groupSlots of byGroup.values()) {
    if (groupSlots.length > MAX_OPTIONS_PER_SELECT) {
      for (let i = 0; i < groupSlots.length; i += MAX_OPTIONS_PER_SELECT) {
        bins.push(groupSlots.slice(i, i + MAX_OPTIONS_PER_SELECT));
      }
      continue;
    }
    const bin = bins.find((b) => b.length + groupSlots.length <= MAX_OPTIONS_PER_SELECT);
    if (bin) bin.push(...groupSlots);
    else bins.push([...groupSlots]);
  }
  return bins;
}

function buildJoinSelectRows(raid, state, availableRoomForRows) {
  const avail = availableSlots(state);
  if (avail.length === 0) return [];

  // Demasiadas opciones para listarlas todas: modo dos pasos (elegir grupo primero).
  if (avail.length > 100) {
    const groupKeys = [...new Set(avail.map((s) => s.groupKey))].slice(0, MAX_OPTIONS_PER_SELECT);
    const options = groupKeys.map((gk) => {
      const { current, max } = groupOccupancy(state, gk);
      return new StringSelectMenuOptionBuilder()
        .setLabel(groupDisplayName(state, gk).slice(0, 100))
        .setValue(gk)
        .setDescription(`${current}/${max} ocupados`.slice(0, 100));
    });
    const select = new StringSelectMenuBuilder()
      .setCustomId(`raid:group:${raid.eventId}`)
      .setPlaceholder('Elige tu grupo')
      .addOptions(options);
    return [new ActionRowBuilder().addComponents(select)];
  }

  const bins = binPackSlotsByGroup(avail).slice(0, availableRoomForRows);
  return bins.map((binSlots, page) => {
    const options = binSlots.map((slot) => optionFromSlot(state, slot));
    const groupNames = [...new Set(binSlots.map((s) => groupDisplayName(state, s.groupKey)))];
    const select = new StringSelectMenuBuilder()
      .setCustomId(`raid:join:${raid.eventId}:${page}`)
      .setPlaceholder(`Elige tu rol — ${groupNames.join(', ')}`.slice(0, 150))
      .addOptions(options);
    return new ActionRowBuilder().addComponents(select);
  });
}

function buildButtonRow(raid, state) {
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`raid:wait:${raid.eventId}`)
      .setLabel('Lista de espera')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🕒'),
    new ButtonBuilder()
      .setCustomId(`raid:cannotgo:${raid.eventId}`)
      .setLabel('No puedo ir')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🚫'),
  ];
  if (state.looters && state.looters.max > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`raid:looter:${raid.eventId}`)
        .setLabel('Looters')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👑')
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`raid:finish:${raid.eventId}`)
      .setLabel('Finalizar evento')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );
  return new ActionRowBuilder().addComponents(buttons);
}

/**
 * Construye los componentes (selects + botones) del mensaje del raid.
 * Un raid cerrado no lleva componentes (mensaje en solo lectura).
 */
function renderRaidComponents(raid, state) {
  if (raid.status !== 'active') return [];

  const rows = [];
  const avail = availableSlots(state);
  const hasAnySlot = state.slots.some((s) => !s.disabled);

  if (avail.length > 0) {
    rows.push(...buildJoinSelectRows(raid, state, MAX_ROWS - 1));
  } else if (hasAnySlot) {
    const disabledSelect = new StringSelectMenuBuilder()
      .setCustomId(`raid:full:${raid.eventId}`)
      .setPlaceholder('🔒 Raid completo')
      .setDisabled(true)
      .addOptions(new StringSelectMenuOptionBuilder().setLabel('Raid completo').setValue('none'));
    rows.push(new ActionRowBuilder().addComponents(disabledSelect));
  }

  rows.push(buildButtonRow(raid, state));
  return rows.slice(0, MAX_ROWS);
}

/**
 * Select ephemeral de segundo paso (modo >100 opciones): arma dentro de un grupo elegido.
 * @returns {ActionRowBuilder|null}
 */
function renderGroupPickSelect(raid, state, groupKey) {
  const avail = availableSlots(state)
    .filter((s) => s.groupKey === groupKey)
    .slice(0, MAX_OPTIONS_PER_SELECT);
  if (avail.length === 0) return null;
  const options = avail.map((slot) => optionFromSlot(state, slot));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`raid:joinpick:${raid.eventId}:${groupKey}`)
    .setPlaceholder('Elige tu arma')
    .addOptions(options);
  return new ActionRowBuilder().addComponents(select);
}

/**
 * Select(s) ephemeral(es) para elegir por cuáles armas esperar en la lista de espera.
 * Incluye TODOS los slots no deshabilitados (llenos o no): si el elegido tiene
 * cupo, el handler une directo; si no, agrega a la waitlist.
 * @returns {ActionRowBuilder[]}
 */
function renderWaitlistSelect(raid, state) {
  const slots = state.slots.filter((s) => !s.disabled);
  if (slots.length === 0) return [];

  const chunks = [];
  for (let i = 0; i < slots.length; i += MAX_OPTIONS_PER_SELECT) {
    chunks.push(slots.slice(i, i + MAX_OPTIONS_PER_SELECT));
  }

  return chunks.slice(0, MAX_ROWS).map((chunk, page) => {
    const options = chunk.map((slot) => optionFromSlot(state, slot));
    const select = new StringSelectMenuBuilder()
      .setCustomId(`raid:waitpick:${raid.eventId}:${page}`)
      .setPlaceholder('Arma(s) para las que quieres esperar')
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options);
    return new ActionRowBuilder().addComponents(select);
  });
}

module.exports = {
  safeFieldValue,
  renderRaidEmbed,
  renderRaidComponents,
  renderGroupPickSelect,
  renderWaitlistSelect,
};
