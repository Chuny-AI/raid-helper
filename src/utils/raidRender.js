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
const { formatEmoji, applyEmoji } = require('./emoji');
const {
  availableSlots,
  slotOccupancy,
  groupOccupancy,
  countActiveParticipants,
  raidRoster,
  attendanceReport,
  waitlistWeaponChoices,
  waitlistPreferenceLabels,
} = require('../services/raidState');

const BRAND_ICON =
  'https://media.discordapp.net/attachments/1289065983071223864/1419915514720944128/Logo_Chuny.png?ex=68d37edf&is=68d22d5f&hm=202c5214c5e86b99a083940105d694ef72cba3f523c737d5ce33c64b6a561877&=&format=webp&quality=lossless';

const WAITLIST_FIELD_NAME = '🕒 Lista de espera';
const CANNOTGO_FIELD_NAME = '🚫 No puedo ir';
const MAX_OPTIONS_PER_SELECT = 25;
const MAX_ROWS = 5;

/** Jugadores por página del selector de asistencia (límite de Discord). */
const ATTENDANCE_PAGE_SIZE = MAX_OPTIONS_PER_SELECT;
/** Conservado por compatibilidad: la asistencia ahora se pagina sin tope global. */
const ATTENDANCE_CAPACITY = Number.POSITIVE_INFINITY;

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
    const groupEmoji = formatEmoji(group.emoji);
    const emojiTag = groupEmoji ? `${groupEmoji} ` : '';
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

/**
 * Reparte una lista de líneas en tantos campos como haga falta para no pasar de
 * los 1024 caracteres por campo. Los campos de continuación llevan un nombre
 * invisible (ZWSP), que es lo único que Discord acepta como "sin nombre".
 * @param {Array} target array de campos al que añadir
 * @param {string} name nombre del primer campo
 * @param {string[]} lines
 * @param {string} emptyText valor cuando no hay líneas
 */
function pushLineFields(target, name, lines, emptyText) {
  if (lines.length === 0) {
    target.push({ name, value: emptyText, inline: false });
    return;
  }

  const blocks = [[]];
  let length = 0;
  for (const line of lines) {
    const text = line.length > 1024 ? line.slice(0, 1024) : line;
    const cost = length === 0 ? text.length : text.length + 1;
    if (length + cost > 1024) {
      blocks.push([text]);
      length = text.length;
    } else {
      blocks[blocks.length - 1].push(text);
      length += cost;
    }
  }

  blocks.forEach((block, i) => {
    target.push({ name: i === 0 ? name : '​', value: block.join('\n'), inline: false });
  });
}

/** Línea de un jugador en el informe de asistencia: arma que llevaba + mención. */
function rosterLine(entry) {
  const emoji = formatEmoji(entry.emoji);
  const crown = entry.isLooter ? '👑 ' : '';
  const label = entry.slotId ? entry.label : 'Looter';
  return `${emoji ? `${emoji} ` : ''}${crown}${label} <@${entry.userId}>`.trim();
}

/**
 * Informe de asistencia de un raid finalizado: sustituye a los bloques de grupo.
 *
 * Quien participó y no está marcado como ausente cuenta como asistente, así que
 * nada más cerrar el raid el informe ya sale completo con todos presentes.
 */
function buildAttendanceFields(state) {
  const { attended, absent } = attendanceReport(state);
  const fields = [];
  pushLineFields(fields, `✅ Asistieron (${attended.length})`, attended.map(rosterLine), '_Nadie._');
  pushLineFields(fields, `❌ No asistieron (${absent.length})`, absent.map(rosterLine), '_Nadie._');
  return fields;
}

/** Límites de un embed en Discord. */
const MAX_EMBED_FIELDS = 25;
const MAX_EMBED_CHARS = 6000;
const MAX_MESSAGE_EMBEDS = 10;

/** Caracteres que Discord cuenta para el límite de 6000 de un embed. */
function embedSize(embed, fields) {
  const json = embed.toJSON();
  return (
    (json.title || '').length +
    (json.description || '').length +
    (json.author?.name || '').length +
    (json.footer?.text || '').length +
    fields.reduce((suma, f) => suma + f.name.length + f.value.length, 0)
  );
}

const avisoGrupos = (ocultos) => ({
  name: '⚠️ Grupos no mostrados',
  value:
    `No fue posible mostrar **${ocultos}** grupo(s) porque el mensaje alcanzó los límites totales de Discord.`,
});

const avisoAsistencia = (ocultos) => ({
  name: '⚠️ Asistencia no mostrada al completo',
  value:
    `No caben **${ocultos}** bloque(s) más porque el mensaje alcanzó los límites totales de Discord. ` +
    'La asistencia sí quedó registrada; solo falta espacio para listarla entera.',
});

/**
 * Construye la carátula del raid. Los embeds de continuación solo llevan los
 * campos restantes para no repetir descripción, imagen ni redes sociales.
 */
function buildRaidEmbedShell(raid, isClosed) {
  const embed = new EmbedBuilder();
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
  return embed;
}

function buildContinuationEmbed(raid, isClosed, page) {
  return new EmbedBuilder()
    .setTitle(`📋 ${raid.title || 'Raid'} · continuación ${page}`)
    .setColor(isClosed ? '#808080' : raid.color || '#00FFFF');
}

/** Divide los campos entre varios embeds, conservando su orden. */
function paginateRaidFields(raid, isClosed, fields) {
  const chunks = [];
  for (let index = 0; index < fields.length; index += MAX_EMBED_FIELDS) {
    chunks.push(fields.slice(index, index + MAX_EMBED_FIELDS));
  }
  if (chunks.length === 0) chunks.push([]);

  return chunks.map((chunk, index) => {
    const embed = index === 0
      ? buildRaidEmbedShell(raid, isClosed)
      : buildContinuationEmbed(raid, isClosed, index + 1);
    if (chunk.length > 0) embed.addFields(chunk);
    return embed;
  });
}

const totalEmbedsSize = (embeds) => embeds.reduce(
  (total, embed) => total + embedSize(embed, embed.toJSON().fields || []),
  0,
);

const embedsFitDiscord = (embeds) => (
  embeds.length <= MAX_MESSAGE_EMBEDS
  && embeds.every((embed) => (embed.toJSON().fields || []).length <= MAX_EMBED_FIELDS)
  && totalEmbedsSize(embeds) <= MAX_EMBED_CHARS
);

/**
 * Reparte todos los grupos entre embeds de continuación. Solo recorta el
 * bloque variable si el mensaje completo supera los límites globales de
 * Discord (10 embeds y 6000 caracteres entre todos).
 */
function fitRaidEmbeds(raid, isClosed, fields, blockStart, blockLength, warningFactory) {
  const withVisibleBlock = (visible) => {
    const hidden = blockLength - visible;
    const selected = fields.slice();
    if (hidden > 0) {
      selected.splice(blockStart + visible, hidden, {
        ...warningFactory(hidden),
        inline: false,
      });
    }
    return paginateRaidFields(raid, isClosed, selected);
  };

  let visible = blockLength;
  let embeds = withVisibleBlock(visible);
  while (visible > 0 && !embedsFitDiscord(embeds)) {
    visible -= 1;
    embeds = withVisibleBlock(visible);
  }
  return embeds;
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
function renderRaidEmbeds(raid, state) {
  // `started` solo puede existir como compatibilidad transitoria con la versión
  // anterior: visualmente y funcionalmente ya cuenta como finalizado.
  const isClosed = raid.status !== 'active';

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

  // El hilo sobrevive al cierre del raid (solo se borra si alguien lo pide),
  // así que el enlace sigue siendo válido en un raid finalizado.
  if (raid.threadId) {
    fields.push({
      name: '💬 Hilo privado:',
      value: isClosed
        ? `<#${raid.threadId}> — el evento terminó; sigue disponible hasta que el líder lo borre.`
        : `<#${raid.threadId}> — solo pueden escribir quienes estén anotados.`,
    });
  }

  if (raid.voiceChannelId) {
    fields.push({
      name: '🔊 Ir al evento:',
      value: `<#${raid.voiceChannelId}> — visible para todos; solo líder y participantes confirmados pueden entrar.`,
    });
  }

  // Al iniciar el evento se cierran las inscripciones y comienza la fase de
  // asistencia. Desde entonces el roster queda congelado y el bloque de grupos
  // se sustituye por el informe de asistentes / ausentes.
  const useAttendance = isClosed;
  const blockFields = useAttendance ? buildAttendanceFields(state) : buildGroupFields(state);
  const inicioGrupos = fields.length;
  fields.push(...blockFields);

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
    const lines = state.waitlist.map((w) => {
      const labels = waitlistPreferenceLabels(state, w);
      const selected = labels.length > 0 ? ` — ${labels.join(', ')}` : '';
      return `<@${w.userId}>${selected}`;
    });
    fields.push({ name: WAITLIST_FIELD_NAME, value: safeFieldValue(lines.join('\n')), inline: false });
  }

  if (state.cannotGo && state.cannotGo.length > 0) {
    const lines = state.cannotGo.map((c) => `<@${c.userId}>`);
    fields.push({ name: CANNOTGO_FIELD_NAME, value: safeFieldValue(lines.join('\n')), inline: false });
  }

  if (isClosed && (raid.closedBy || raid.closedAt || raid.startedBy || raid.startedAt)) {
    const whoId = raid.closedBy || raid.startedBy;
    const closedAt = raid.closedAt || raid.startedAt;
    const who = whoId ? `<@${whoId}>` : 'desconocido';
    const when = closedAt ? `<t:${Math.floor(new Date(closedAt).getTime() / 1000)}:R>` : '';
    fields.push({ name: '🔒 Estado', value: `Finalizado por ${who}${when ? ` · ${when}` : ''}` });
  }

  fields.push(...buildSocialFields());

  return fitRaidEmbeds(
    raid,
    isClosed,
    fields,
    inicioGrupos,
    blockFields.length,
    useAttendance ? avisoAsistencia : avisoGrupos,
  );
}

/** Compatibilidad para paneles y pruebas que solo necesitan la carátula. */
function renderRaidEmbed(raid, state) {
  return renderRaidEmbeds(raid, state)[0];
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
  applyEmoji(opt, slot.emoji);
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

  // Demasiadas opciones para listarlas todas: abre un navegador privado por
  // jugador. Cambiar de página nunca modifica el mensaje público del raid.
  if (avail.length > 100) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`raid:browse:${raid.eventId}`)
        .setLabel('Buscar plaza')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔎')
    )];
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

/** Grupos con al menos una plaza libre, conservando el orden del raid. */
function availableGroupKeys(state) {
  const available = new Set(availableSlots(state).map((slot) => slot.groupKey));
  return (state.groups || [])
    .map((group) => group.groupKey)
    .filter((groupKey) => available.has(groupKey));
}

/**
 * Navegador efímero de grupos. Los resultados de búsqueda se limitan a una
 * página y avisan si hace falta refinar; el listado completo sí es paginable.
 */
function renderGroupBrowser(raid, state, requestedPage = 0, filteredGroupKeys = null) {
  const allAvailable = availableGroupKeys(state);
  const available = new Set(allAvailable);
  const filtered = Array.isArray(filteredGroupKeys);
  const groupKeys = filtered
    ? [...new Set(filteredGroupKeys)].filter((groupKey) => available.has(groupKey))
    : allAvailable;
  const pageCount = filtered ? 1 : Math.max(1, Math.ceil(groupKeys.length / MAX_OPTIONS_PER_SELECT));
  const page = filtered
    ? 0
    : Math.min(Math.max(0, Number(requestedPage) || 0), pageCount - 1);
  const visibleKeys = groupKeys.slice(
    page * MAX_OPTIONS_PER_SELECT,
    page * MAX_OPTIONS_PER_SELECT + MAX_OPTIONS_PER_SELECT,
  );
  if (visibleKeys.length === 0) {
    return { rows: [], page, pageCount, total: groupKeys.length, truncated: false };
  }

  const options = visibleKeys.map((groupKey) => {
    const { current, max } = groupOccupancy(state, groupKey);
    return new StringSelectMenuOptionBuilder()
      .setLabel(groupDisplayName(state, groupKey).slice(0, 100))
      .setValue(groupKey)
      .setDescription(`${current}/${max} ocupados`.slice(0, 100));
  });
  const rows = [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`raid:grouppick:${raid.eventId}`)
      .setPlaceholder('Elige un grupo con plazas')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  )];

  const buttons = [];
  if (!filtered && pageCount > 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`raid:grouppage:${raid.eventId}:${Math.max(0, page - 1)}`)
        .setLabel('Anterior').setStyle(ButtonStyle.Secondary).setEmoji('⬅️').setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`raid:grouppage:${raid.eventId}:${Math.min(pageCount - 1, page + 1)}`)
        .setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setEmoji('➡️').setDisabled(page + 1 >= pageCount),
    );
  }
  if (filtered) {
    buttons.push(new ButtonBuilder()
      .setCustomId(`raid:grouppage:${raid.eventId}:0`)
      .setLabel('Ver todos').setStyle(ButtonStyle.Secondary));
  }
  buttons.push(new ButtonBuilder()
    .setCustomId(`raid:groupsearch:${raid.eventId}`)
    .setLabel('Buscar grupo').setStyle(ButtonStyle.Primary).setEmoji('🔎'));
  rows.push(new ActionRowBuilder().addComponents(buttons));

  return {
    rows,
    page,
    pageCount,
    total: groupKeys.length,
    truncated: filtered && groupKeys.length > MAX_OPTIONS_PER_SELECT,
  };
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
  buttons.push(raid.voiceChannelId
    ? new ButtonBuilder()
      .setURL(`https://discord.com/channels/${raid.guildId}/${raid.voiceChannelId}`)
      .setLabel('Ir al evento')
      .setStyle(ButtonStyle.Link)
      .setEmoji('🔊')
    : new ButtonBuilder()
      .setCustomId(`raid:start:${raid.eventId}`)
      .setLabel('Iniciar evento')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔊'));
  return new ActionRowBuilder().addComponents(buttons);
}

/** Botón que dispara el borrado (con confirmación) del hilo privado. */
function buildThreadDeleteButton(raid) {
  return new ButtonBuilder()
    .setCustomId(`raid:thdel:${raid.eventId}`)
    .setLabel('Eliminar hilo')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🗑️');
}

/**
 * Fila con el botón de borrar el hilo, para colgarla de un panel efímero
 * (el de asistencia). null si el raid ya no tiene hilo que borrar.
 * @returns {ActionRowBuilder|null}
 */
function renderThreadDeleteRow(raid) {
  if (!raid?.threadId) return null;
  return new ActionRowBuilder().addComponents(buildThreadDeleteButton(raid));
}

/**
 * Acciones que quedan en un raid finalizado: corregir quién no apareció y,
 * si el hilo privado sigue vivo, borrarlo. El borrado nunca es automático, así
 * que este botón es la única vía para quitarlo de en medio.
 * @returns {ActionRowBuilder[]} vacío si no queda ninguna acción
 */
function buildClosedRaidRows(raid, state) {
  const buttons = [];

  if (raid.voiceChannelId) {
    buttons.push(
      new ButtonBuilder()
        .setURL(`https://discord.com/channels/${raid.guildId}/${raid.voiceChannelId}`)
        .setLabel('Ir al evento')
        .setStyle(ButtonStyle.Link)
        .setEmoji('🔊')
    );
  }

  if (raidRoster(state).length > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`raid:att:${raid.eventId}`)
        .setLabel('Registrar asistencia')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋')
    );
  }

  if (raid.threadId) buttons.push(buildThreadDeleteButton(raid));

  return buttons.length > 0 ? [new ActionRowBuilder().addComponents(buttons)] : [];
}

/**
 * Construye los componentes (selects + botones) del mensaje del raid.
 *
 * Un raid iniciado ya no admite inscripciones y muestra la fase de asistencia.
 * Al finalizar conserva el acceso a esa asistencia y al borrado manual del hilo.
 */
function renderRaidComponents(raid, state) {
  if (raid.status !== 'active') return buildClosedRaidRows(raid, state);

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

/** Panel paginado de armas dentro del grupo elegido. */
function renderGroupPickPanel(raid, state, groupKey, requestedPage = 0) {
  const available = availableSlots(state).filter((slot) => slot.groupKey === groupKey);
  if (available.length === 0) return null;
  const pageCount = Math.max(1, Math.ceil(available.length / MAX_OPTIONS_PER_SELECT));
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pageCount - 1);
  const chunk = available.slice(page * MAX_OPTIONS_PER_SELECT, (page + 1) * MAX_OPTIONS_PER_SELECT);
  const options = chunk.map((slot) => optionFromSlot(state, slot));
  const rows = [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`raid:joinpick:${raid.eventId}`)
      .setPlaceholder(pageCount > 1 ? `Elige tu arma · ${page + 1}/${pageCount}` : 'Elige tu arma')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  )];

  const groupIndex = (state.groups || []).findIndex((group) => group.groupKey === groupKey);
  const buttons = [];
  if (pageCount > 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`raid:gweaponpage:${raid.eventId}:${groupIndex}:${Math.max(0, page - 1)}`)
        .setLabel('Anterior').setStyle(ButtonStyle.Secondary).setEmoji('⬅️').setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`raid:gweaponpage:${raid.eventId}:${groupIndex}:${Math.min(pageCount - 1, page + 1)}`)
        .setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setEmoji('➡️').setDisabled(page + 1 >= pageCount),
    );
  }
  buttons.push(new ButtonBuilder()
    .setCustomId(`raid:grouppage:${raid.eventId}:0`)
    .setLabel('Volver a grupos').setStyle(ButtonStyle.Secondary));
  rows.push(new ActionRowBuilder().addComponents(buttons));
  return { rows, page, pageCount, total: available.length };
}

/** Compatibilidad con consumidores que solo necesitan la primera fila. */
function renderGroupPickSelect(raid, state, groupKey) {
  return renderGroupPickPanel(raid, state, groupKey)?.rows[0] || null;
}

/**
 * Panel efímero paginado para elegir armas únicas de la lista de espera.
 * Una misma arma repetida en varios grupos se presenta una sola vez. Cada
 * página usa como máximo 25 opciones y la navegación permite recorrerlas todas
 * sin depender del límite de cinco filas de Discord.
 * @returns {ActionRowBuilder[]}
 */
function renderWaitlistSelect(raid, state, requestedPage = 0) {
  const weapons = waitlistWeaponChoices(state);
  if (weapons.length === 0) return [];

  const pageCount = Math.max(1, Math.ceil(weapons.length / MAX_OPTIONS_PER_SELECT));
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pageCount - 1);
  const chunk = weapons.slice(page * MAX_OPTIONS_PER_SELECT, (page + 1) * MAX_OPTIONS_PER_SELECT);
  const options = chunk.map((weapon) => {
    const groups = weapon.groupKeys.length;
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(String(weapon.label || 'Arma').slice(0, 100))
      // El primer slot identifica el arma; el handler lo expande a todos los
      // slots equivalentes antes de guardar la preferencia.
      .setValue(weapon.slotIds[0])
      .setDescription(
        `${groups} grupo${groups === 1 ? '' : 's'} · ${weapon.occupied}/${weapon.capacity} plazas`.slice(0, 100)
      );
    applyEmoji(option, weapon.emoji);
    return option;
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`raid:waitpick:${raid.eventId}:${page}`)
    .setPlaceholder(
      (pageCount > 1
        ? `Elige arma(s) · página ${page + 1}/${pageCount}`
        : 'Arma(s) para las que quieres esperar').slice(0, 150)
    )
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options);
  const rows = [new ActionRowBuilder().addComponents(select)];

  if (pageCount > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`raid:waitpage:${raid.eventId}:${Math.max(0, page - 1)}`)
        .setLabel('Anterior')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`raid:waitpage:${raid.eventId}:${Math.min(pageCount - 1, page + 1)}`)
        .setLabel('Siguiente')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('➡️')
        .setDisabled(page + 1 >= pageCount),
    ));
  }
  return rows;
}

/**
 * Panel efímero de asistencia: el líder marca a quienes NO aparecieron.
 *
 * Los ya marcados vienen preseleccionados (`setDefault`), así que el selector
 * funciona como un interruptor: deseleccionar a alguien lo devuelve a
 * "asistió". Cada página se guarda por su cuenta contra la BD, sin estado
 * intermedio en memoria, así que el panel se puede reabrir cuando sea.
 *
 * @param {Object} raid
 * @param {Array} roster salida de raidState.raidRoster
 * @param {Set<string>} absentIds
 * @returns {ActionRowBuilder[]} selectores + la fila del botón "Listo"
 */
function renderAttendanceRows(raid, roster, absentIds, requestedPage = 0) {
  if (roster.length === 0) return [];
  const pageCount = Math.max(1, Math.ceil(roster.length / ATTENDANCE_PAGE_SIZE));
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pageCount - 1);
  const chunk = roster.slice(page * ATTENDANCE_PAGE_SIZE, (page + 1) * ATTENDANCE_PAGE_SIZE);
  const options = chunk.map((entry) => {
    const absent = absentIds.has(entry.userId);
    const weapon = entry.slotId ? entry.label || 'Sin arma' : 'Looter';
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel((entry.username || entry.userId).slice(0, 100))
      .setValue(entry.userId)
      .setDescription(`${absent ? '❌ No asistió' : '✅ Asistió'} · ${weapon}`.slice(0, 100))
      .setDefault(absent);
    applyEmoji(opt, entry.emoji);
    return opt;
  });

  const rows = [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`raid:attpick:${raid.eventId}:${page}`)
      .setPlaceholder(
        (pageCount > 1
          ? `Marca quienes NO asistieron (${page + 1}/${pageCount})`
          : 'Marca quienes NO asistieron').slice(0, 150)
      )
      .setMinValues(0)
      .setMaxValues(options.length)
      .addOptions(options)
  )];

  if (pageCount > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`raid:attpage:${raid.eventId}:${Math.max(0, page - 1)}`)
        .setLabel('Anterior').setStyle(ButtonStyle.Secondary).setEmoji('⬅️').setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`raid:attpage:${raid.eventId}:${Math.min(pageCount - 1, page + 1)}`)
        .setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setEmoji('➡️').setDisabled(page + 1 >= pageCount),
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid:attdone:${raid.eventId}`)
      .setLabel('Listo')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
  ));
  return rows;
}

module.exports = {
  safeFieldValue,
  renderRaidEmbed,
  renderRaidEmbeds,
  renderRaidComponents,
  renderThreadDeleteRow,
  renderGroupBrowser,
  renderGroupPickPanel,
  renderGroupPickSelect,
  renderWaitlistSelect,
  renderAttendanceRows,
  ATTENDANCE_PAGE_SIZE,
  ATTENDANCE_CAPACITY,
};
