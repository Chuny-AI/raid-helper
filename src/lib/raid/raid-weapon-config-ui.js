const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const {
  getEnabledItems,
  getGroupCapacity,
  getGroupItemsFor,
  getGroupMaxPlayers,
  getWeaponLabel,
  getWeaponUnits,
  isGroupDisabled,
  isGroupVisible,
  isWeaponDisabled,
  getTotalCapacity,
} = require('../../utils/raidWeaponConfig');
const { formatEmoji, toComponentEmoji, applyEmoji } = require('../../utils/emoji');

/**
 * Panel de configuración de armas de `/raid create`.
 *
 * Todos los customId usan el prefijo `raidcfg-` y `-` como separador:
 *   raidcfg-<accion>-<pendingId>[-<groupKey>][-<weaponIndex>]
 *
 * El prefijo evita colisiones con el enrutado de `/template` en events.js
 * (que captura `group_`, `_group_`, `edit_`, `template_`, etc.).
 */
const PREFIX = 'raidcfg';

/** Construye un customId del panel. */
const buildId = (action, pendingId, groupKey, weaponIndex) => {
  const parts = [PREFIX, action, pendingId];
  if (groupKey !== undefined && groupKey !== null) parts.push(groupKey);
  if (weaponIndex !== undefined && weaponIndex !== null) parts.push(String(weaponIndex));
  return parts.join('-');
};

/**
 * Parsea un customId del panel.
 * @param {string} customId
 * @returns {{action: string, pendingId: string, groupKey: string|null, weaponIndex: number|null}|null}
 */
const parseId = (customId) => {
  if (typeof customId !== 'string' || !customId.startsWith(`${PREFIX}-`)) return null;
  const [, action, pendingId, groupKey, weaponIndex] = customId.split('-');
  if (!action || !pendingId) return null;
  return {
    action,
    pendingId,
    groupKey: groupKey || null,
    weaponIndex: weaponIndex !== undefined ? parseInt(weaponIndex, 10) : null,
  };
};

/** Recorta un texto al límite admitido por Discord. */
const clamp = (text, max) => String(text ?? '').slice(0, max);

/** Límites de caracteres de Discord en un embed. */
const FIELD_VALUE_LIMIT = 1024;
const DESCRIPTION_LIMIT = 4096;

/** Texto de relleno cuando la lista no cabe entera. */
const omittedNote = (omitidas) =>
  `_…y ${omitidas} más. Se configuran igual desde el selector de abajo._`;

/**
 * Reparte líneas en bloques que no pasen de `limite`, cortando solo entre
 * líneas completas.
 *
 * Cortar a mitad de línea dejaba los últimos grupos fuera sin avisar y podía
 * partir una etiqueta `<:nombre:id>` por la mitad, que entonces se ve como
 * texto crudo.
 *
 * @param {string[]} lines
 * @param {number} limite
 * @returns {string[][]}
 */
const splitIntoBlocks = (lines, limite) => {
  const bloques = [[]];
  let largo = 0;
  for (const linea of lines) {
    const texto = clamp(linea, limite);
    const coste = largo === 0 ? texto.length : texto.length + 1;
    if (largo + coste > limite) {
      bloques.push([texto]);
      largo = texto.length;
    } else {
      bloques[bloques.length - 1].push(texto);
      largo += coste;
    }
  }
  return bloques;
};

/**
 * Junta cuantas líneas quepan en `limite`, en un solo bloque.
 * @returns {{ texto: string, omitidas: number }}
 */
const packLines = (lines, limite) => {
  const [primero] = splitIntoBlocks(lines, limite);
  return { texto: primero.join('\n'), omitidas: lines.length - primero.length };
};

/**
 * Añade una lista de líneas al embed, repartida en tantos campos como haga falta.
 *
 * Discord dibuja una separación entre campos, así que esto solo se usa donde la
 * lista puede pasar de 1024 caracteres de verdad; para la lista de grupos es
 * preferible la descripción, que admite 4096 y se ve seguida.
 *
 * @param {EmbedBuilder} embed
 * @param {string} name Título del primer campo; los siguientes van sin título.
 * @param {string[]} lines
 * @param {string} vacio Texto a mostrar si no hay ninguna línea.
 * @param {number} [maxBloques] Tope de campos, para no rebasar los 6000 del embed.
 */
const addLineFields = (embed, name, lines, vacio, maxBloques = 4) => {
  if (lines.length === 0) {
    embed.addFields({ name, value: vacio, inline: false });
    return;
  }

  const bloques = splitIntoBlocks(lines, FIELD_VALUE_LIMIT);

  bloques.slice(0, maxBloques).forEach((bloque, i) => {
    // Discord exige un nombre no vacío: en los campos de continuación va un
    // espacio de ancho cero para que se lean como una sola lista.
    embed.addFields({ name: i === 0 ? name : '​', value: bloque.join('\n'), inline: false });
  });

  const omitidas = bloques.slice(maxBloques).reduce((suma, bloque) => suma + bloque.length, 0);
  if (omitidas > 0) {
    embed.addFields({ name: '​', value: omittedNote(omitidas), inline: false });
  }
};

/** Devuelve el emoji si es un ID de emoji personalizado válido, si no undefined. */
const customEmoji = (value) => toComponentEmoji(value);

/** Formatea un emoji para mostrarlo dentro de un texto de embed. */
const renderEmoji = (value) => formatEmoji(value, '•');

/**
 * Estado textual del grupo, para las descripciones del panel.
 * @returns {string}
 */
const describeGroupStatus = (template, overrides, groupKey) => {
  if (isGroupDisabled(overrides, groupKey)) return '🚫 Deshabilitado';
  const capacity = getGroupCapacity(template, overrides, groupKey);
  if (capacity <= 0) return '🚫 Sin armas habilitadas';

  const total = getGroupItemsFor(template, groupKey).length;
  const enabled = getEnabledItems(template, overrides, groupKey).length;
  const suffix = enabled < total ? ` · ${total - enabled} arma(s) off` : '';
  return `✅ Cupo ${capacity}${suffix}`;
};

/**
 * Panel principal: lista de grupos + selector para configurar uno.
 * @returns {{embeds: EmbedBuilder[], components: ActionRowBuilder[]}}
 */
const buildOverviewPanel = (template, overrides, pendingId) => {
  const groupKeys = Object.keys(template.weapons || {});

  const lines = [];
  for (const groupKey of groupKeys) {
    const group = template.weapons[groupKey];
    if (!group) continue;
    const capacity = getGroupCapacity(template, overrides, groupKey);
    const disabled = capacity <= 0;
    const icon = disabled ? '🚫' : '✅';
    const enabledItems = getEnabledItems(template, overrides, groupKey);
    const detail = disabled
      ? '_deshabilitado_'
      : enabledItems
        .map((entry) => `${renderEmoji(entry.item.emoji)} ${entry.name} ×${entry.units}`)
        .join(', ');
    // El emoji del grupo va junto al nombre: el icono de estado solo indica
    // si esta habilitado, no de que grupo se trata.
    const groupEmoji = formatEmoji(group.defaultEmoji);
    const heading = groupEmoji
      ? `${icon} ${groupEmoji} **${group.displayName}**`
      : `${icon} **${group.displayName}**`;
    lines.push(`${heading} — cupo **${capacity}**\n└ ${clamp(detail, 180)}`);
  }

  const totalCapacity = getTotalCapacity(template, overrides);

  // La lista va en la descripción, no en un campo: Discord separa visualmente
  // los campos entre sí, y partir los grupos en dos campos metía un hueco en
  // mitad de la lista. La descripción admite 4096 caracteres y se ve seguida.
  const intro =
    'Selecciona un grupo para ajustarlo antes de publicar. Puedes cambiar el cupo del grupo, ' +
    'deshabilitarlo por completo, o ajustar/deshabilitar cada arma por separado.\n\n' +
    '*El cupo del grupo siempre manda sobre el de las armas.*';
  const cabecera = `**Grupos (capacidad total: ${totalCapacity})**`;

  let listado = '_El template no tiene grupos de armas._';
  if (lines.length > 0) {
    // Se reserva sitio para el intro, la cabecera, los saltos y el posible aviso.
    const { texto, omitidas } = packLines(lines, DESCRIPTION_LIMIT - intro.length - cabecera.length - 120);
    listado = omitidas > 0 ? `${texto}\n${omittedNote(omitidas)}` : texto;
  }

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Configuración de armas del raid')
    .setColor(totalCapacity > 0 ? 0x00ffff : 0xff5555)
    .setDescription(`${intro}\n\n${cabecera}\n${listado}`);

  if (totalCapacity <= 0) {
    embed.addFields({
      name: '⚠️ Atención',
      value: 'No queda ninguna arma habilitada. Habilita al menos una para poder publicar el raid.',
      inline: false,
    });
  }

  const components = [];

  const options = groupKeys.slice(0, 25).map((groupKey) => {
    const group = template.weapons[groupKey];
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(clamp(group.displayName || groupKey, 100))
      .setValue(groupKey)
      .setDescription(clamp(describeGroupStatus(template, overrides, groupKey), 100));
    applyEmoji(option, group.defaultEmoji);
    return option;
  });

  if (options.length > 0) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(buildId('grp', pendingId))
        .setPlaceholder('Selecciona un grupo de armas para configurarlo')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options)
    ));
  }

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid_confirm_create-${pendingId}`)
      .setLabel('Confirmar y publicar raid')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(totalCapacity <= 0),
    new ButtonBuilder()
      .setCustomId(buildId('resetall', pendingId))
      .setLabel('Restablecer todo')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('♻️')
  ));

  return { embeds: [embed], components };
};

/**
 * Panel de un grupo: cupo del grupo, on/off del grupo y selector de armas.
 * @returns {{embeds: EmbedBuilder[], components: ActionRowBuilder[]}}
 */
const buildGroupPanel = (template, overrides, pendingId, groupKey) => {
  const group = template.weapons[groupKey];
  const groupDisabled = isGroupDisabled(overrides, groupKey);
  const capacity = getGroupCapacity(template, overrides, groupKey);
  const maxPlayers = getGroupMaxPlayers(template, overrides, groupKey);
  const items = getGroupItemsFor(template, groupKey);

  const enabledSum = getEnabledItems(template, overrides, groupKey)
    .reduce((acc, entry) => acc + entry.units, 0);

  const weaponLines = items.map((item) => {
    const index = item.index;
    const name = getWeaponLabel(item);
    const units = getWeaponUnits(template, overrides, groupKey, index);
    const off = isWeaponDisabled(overrides, groupKey, index);
    const icon = off ? '🚫' : '✅';
    const unitsText = off ? '~~×' + units + '~~' : `×${units}`;
    return `${icon} \`#${index}\` ${renderEmoji(item.emoji)} **${name}** ${unitsText}`;
  });

  // Avisar cuando el cupo del grupo recorta la suma de las armas
  const notes = [];
  if (!groupDisabled && maxPlayers !== null && enabledSum > maxPlayers) {
    notes.push(
      `⚠️ La suma de cupos de armas es **${enabledSum}**, pero el grupo está limitado a **${maxPlayers}**. ` +
      'Sólo entrarán ' + maxPlayers + ' jugadores en total.'
    );
  }
  if (!groupDisabled && capacity <= 0) {
    notes.push('⚠️ Todas las armas del grupo están deshabilitadas: el grupo no aparecerá en el raid.');
  }

  const embed = new EmbedBuilder()
    .setTitle(`${renderEmoji(group.defaultEmoji)} ${group.displayName}`)
    .setColor(groupDisabled || capacity <= 0 ? 0xff5555 : 0x00ffff)
    .setDescription(
      groupDisabled
        ? '🚫 **Grupo deshabilitado.** No aparecerá en el embed del raid.'
        : 'Ajusta el cupo del grupo o selecciona un arma para configurarla.'
    )
    .addFields(
      {
        name: 'Cupo del grupo',
        value: `**${capacity}** ${maxPlayers === null ? '_(auto: suma de armas)_' : `_(máximo: ${maxPlayers})_`}`,
        inline: true,
      },
      {
        name: 'Suma de armas habilitadas',
        value: `**${enabledSum}**`,
        inline: true,
      }
    );

  addLineFields(embed, `Armas (${items.length})`, weaponLines, '_Sin armas configuradas._');

  if (notes.length > 0) {
    embed.addFields({ name: 'Avisos', value: clamp(notes.join('\n'), 1024), inline: false });
  }

  const components = [];

  // Selector de armas: se listan TODAS (habilitadas y no) para poder revertir.
  // Las repetidas conservan su índice, así se distinguen entre sí.
  const weaponOptions = items.slice(0, 25).map((item) => {
    const index = item.index;
    const name = getWeaponLabel(item);
    const units = getWeaponUnits(template, overrides, groupKey, index);
    const off = isWeaponDisabled(overrides, groupKey, index);
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(clamp(`${off ? '🚫 ' : ''}${name}`, 100))
      .setValue(String(index))
      .setDescription(clamp(`#${index} · cupo ${units}${off ? ' · deshabilitada' : ''}`, 100));
    applyEmoji(option, item.emoji);
    return option;
  });

  if (weaponOptions.length > 0) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(buildId('wpn', pendingId, groupKey))
        .setPlaceholder('Selecciona un arma del grupo para configurarla')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(weaponOptions)
    ));
  }

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildId('gmax', pendingId, groupKey))
      .setLabel('Cupo del grupo')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✏️')
      .setDisabled(groupDisabled),
    new ButtonBuilder()
      .setCustomId(buildId('gtoggle', pendingId, groupKey))
      .setLabel(groupDisabled ? 'Habilitar grupo' : 'Deshabilitar grupo')
      .setStyle(groupDisabled ? ButtonStyle.Success : ButtonStyle.Danger)
      .setEmoji(groupDisabled ? '✅' : '🚫'),
    new ButtonBuilder()
      .setCustomId(buildId('greset', pendingId, groupKey))
      .setLabel('Restablecer grupo')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('♻️')
  ));

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildId('home', pendingId))
      .setLabel('Volver a los grupos')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⬅️')
  ));

  return { embeds: [embed], components };
};

/**
 * Panel de un arma concreta: cupo individual y on/off.
 * @returns {{embeds: EmbedBuilder[], components: ActionRowBuilder[]}}
 */
const buildWeaponPanel = (template, overrides, pendingId, groupKey, weaponIndex) => {
  const group = template.weapons[groupKey];
  const items = getGroupItemsFor(template, groupKey);
  const item = items.find((it) => it.index === Number(weaponIndex));
  const name = getWeaponLabel(item);
  const units = getWeaponUnits(template, overrides, groupKey, weaponIndex);
  const off = isWeaponDisabled(overrides, groupKey, weaponIndex);
  const groupDisabled = isGroupDisabled(overrides, groupKey);
  const capacity = getGroupCapacity(template, overrides, groupKey);

  // Cuántas entradas comparten este nombre dentro del grupo (armas repetidas)
  const sameName = items
    .map((candidate) => ({ candidate, index: candidate.index }))
    .filter(({ candidate }) => getWeaponLabel(candidate) === name);

  const embed = new EmbedBuilder()
    .setTitle(`${renderEmoji(item.emoji)} ${name}`)
    .setColor(off || groupDisabled ? 0xff5555 : 0x00ffff)
    .setDescription(
      `Arma **#${weaponIndex}** del grupo **${group.displayName}**.` +
      (groupDisabled ? '\n\n🚫 El grupo completo está deshabilitado; estos ajustes no tendrán efecto hasta que lo habilites.' : '')
    )
    .addFields(
      { name: 'Estado', value: off ? '🚫 Deshabilitada' : '✅ Habilitada', inline: true },
      { name: 'Cupo del arma', value: `**${units}**`, inline: true },
      { name: 'Cupo del grupo', value: `**${capacity}**`, inline: true }
    );

  if (units > capacity && !off && !groupDisabled) {
    embed.addFields({
      name: '⚠️ Limitada por el grupo',
      value: `El cupo del arma (**${units}**) supera la capacidad del grupo (**${capacity}**). ` +
        `Sólo podrán inscribirse **${capacity}** jugadores.`,
      inline: false,
    });
  }

  if (sameName.length > 1) {
    const detail = sameName
      .map(({ index }) => {
        const entryUnits = getWeaponUnits(template, overrides, groupKey, index);
        const entryOff = isWeaponDisabled(overrides, groupKey, index);
        return `${entryOff ? '🚫' : '✅'} #${index} ×${entryUnits}`;
      })
      .join(' · ');
    const total = sameName
      .filter(({ index }) => !isWeaponDisabled(overrides, groupKey, index))
      .reduce((acc, { index }) => acc + getWeaponUnits(template, overrides, groupKey, index), 0);
    embed.addFields({
      name: 'Entradas repetidas de esta arma',
      value: `${detail}\n**Cupo combinado habilitado: ${Math.min(total, capacity)}**`,
      inline: false,
    });
  }

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildId('wunits', pendingId, groupKey, weaponIndex))
        .setLabel('Cambiar cupo')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✏️')
        .setDisabled(off),
      new ButtonBuilder()
        .setCustomId(buildId('wtoggle', pendingId, groupKey, weaponIndex))
        .setLabel(off ? 'Habilitar arma' : 'Deshabilitar arma')
        .setStyle(off ? ButtonStyle.Success : ButtonStyle.Danger)
        .setEmoji(off ? '✅' : '🚫'),
      new ButtonBuilder()
        .setCustomId(buildId('wreset', pendingId, groupKey, weaponIndex))
        .setLabel('Restablecer arma')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('♻️')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildId('gback', pendingId, groupKey))
        .setLabel('Volver al grupo')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️'),
      new ButtonBuilder()
        .setCustomId(buildId('home', pendingId))
        .setLabel('Volver a los grupos')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🏠')
    ),
  ];

  return { embeds: [embed], components };
};

/**
 * Modal para cambiar el cupo máximo de un grupo.
 * @returns {ModalBuilder}
 */
const buildGroupMaxModal = (template, overrides, pendingId, groupKey) => {
  const group = template.weapons[groupKey];
  const current = getGroupMaxPlayers(template, overrides, groupKey);

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel('Cupo máximo del grupo')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Número mayor a 0. Vacío = suma de las armas.')
    .setRequired(false)
    .setMaxLength(4);

  if (current !== null) input.setValue(String(current));

  return new ModalBuilder()
    .setCustomId(buildId('mgmax', pendingId, groupKey))
    .setTitle(clamp(`Cupo: ${group.displayName}`, 45))
    .addComponents(new ActionRowBuilder().addComponents(input));
};

/**
 * Modal para cambiar el cupo de un arma concreta.
 * @returns {ModalBuilder}
 */
const buildWeaponUnitsModal = (template, overrides, pendingId, groupKey, weaponIndex) => {
  const item = getGroupItemsFor(template, groupKey).find((it) => it.index === Number(weaponIndex));
  const name = getWeaponLabel(item);
  const current = getWeaponUnits(template, overrides, groupKey, weaponIndex);

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel('Cupo de esta arma')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Número mayor a 0. 0 la deshabilita.')
    .setRequired(true)
    .setMaxLength(4)
    .setValue(String(current));

  return new ModalBuilder()
    .setCustomId(buildId('mwunits', pendingId, groupKey, weaponIndex))
    .setTitle(clamp(`Cupo: ${name}`, 45))
    .addComponents(new ActionRowBuilder().addComponents(input));
};

module.exports = {
  PREFIX,
  buildId,
  parseId,
  buildOverviewPanel,
  buildGroupPanel,
  buildWeaponPanel,
  buildGroupMaxModal,
  buildWeaponUnitsModal,
  isGroupVisible,
};
