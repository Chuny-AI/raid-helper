/**
 * Handlers de interacción de un raid publicado (unirse, lista de espera, no
 * puedo ir, looters, finalizar). Sustituye a los bloques inline de
 * src/utils/events.js. Toda mutación de estado pasa por src/services/raidState.js
 * y termina en raidRegistry.saveRaid (guarda en BD) antes de
 * raidRegistry.renderAndEdit (regenera embed + componentes).
 *
 * Esquema de customId nuevo: "raid:<accion>:<raidId>[:<extra>]".
 * También resuelve los customId legacy (pre-refactor) por interaction.message.id,
 * como red de seguridad si algún mensaje no se llegó a re-renderizar.
 */
const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const raidState = require('../services/raidState');
const raidRegistry = require('../services/raidRegistry');
const {
  renderGroupPickSelect,
  renderWaitlistSelect,
  renderAttendanceRows,
  renderThreadDeleteRow,
  ATTENDANCE_PAGE_SIZE,
  ATTENDANCE_CAPACITY,
} = require('./raidRender');
const { safeDeferUpdate } = require('./interaction');
const { createBuildEmbed } = require('./embed');
const { syncRaidThread, deleteRaidThread } = require('./raidThread');

/** Responde SIEMPRE de forma efímera, sin importar si la interacción ya fue deferida como update. */
async function ephemeralReply(interaction, payload) {
  const data = typeof payload === 'string' ? { content: payload } : payload;
  const withFlag = { ...data, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(withFlag);
    }
    return await interaction.reply(withFlag);
  } catch (e) {
    console.error('[WARN] raidInteractions.ephemeralReply falló:', e?.message);
  }
}

function replyClosed(interaction) {
  return ephemeralReply(interaction, '🔒 Este evento ha sido finalizado.');
}

function replyGone(interaction) {
  return ephemeralReply(interaction, 'No se encontró el evento correspondiente. Puede que ya no exista.');
}

function parseCustomId(customId) {
  if (customId.startsWith('raid:')) {
    const parts = customId.split(':');
    return { action: parts[1], raidId: parts[2] || null, extra: parts.slice(3).join(':') || null };
  }
  // customId legacy (pre-refactor), sin raidId embebido — se resuelve por messageId.
  if (customId.startsWith('weapons-')) return { action: 'join', raidId: null, extra: null };
  if (customId.startsWith('raid_waitlist_weapons-')) return { action: 'waitpick', raidId: null, extra: null };
  if (customId.startsWith('raid_waitlist-')) return { action: 'wait', raidId: null, extra: null };
  if (customId.startsWith('raid_cannotgo-')) return { action: 'cannotgo', raidId: null, extra: null };
  if (customId.startsWith('raid_looter-')) return { action: 'looter', raidId: null, extra: null };
  return null;
}

/**
 * Resuelve (y registra bajo demanda si hace falta) el runtime de un raid.
 *
 * Todo queda acotado al servidor de la interacción. El eventId es un código de
 * 6 caracteres que va a la vista en el embed, y ni el registro en memoria ni la
 * colección de raids están particionados por gremio: sin este filtro, quien
 * viera un id en un servidor podía manejar ese raid desde otro (basta con ser
 * administrador de un servidor propio con el bot invitado, porque
 * `canManageRaid` evalúa los permisos del miembro que ejecuta, no los del
 * servidor dueño del raid). Con esto, un raid de otro gremio se comporta como
 * si no existiera.
 * @param {{raidId?:string|null, messageId?:string|null, guild:Object}} params
 */
async function getOrLoadRuntime({ raidId, messageId, guild }) {
  // Sin servidor no hay forma de acotar la búsqueda, así que no se busca.
  const guildId = guild?.id;
  if (!guildId) return null;

  const delGremio = (entry) => (entry && entry.raid?.guildId === guildId ? entry : null);

  let runtime = raidId ? delGremio(raidRegistry.getByRaidId(raidId)) : null;
  if (!runtime && messageId) runtime = delGremio(raidRegistry.getByMessageId(messageId));
  if (runtime) return runtime;

  const RaidEvent = require('../database/models/RaidEvent');
  const query = raidId
    ? { eventId: raidId, guildId }
    : messageId
      ? { messageId, guildId }
      : null;
  if (!query) return null;

  const raidDoc = await RaidEvent.findOne(query);
  if (!raidDoc) return null;

  let message = null;
  if (guild && raidDoc.channelId && raidDoc.messageId) {
    try {
      const channel = await guild.channels.fetch(raidDoc.channelId);
      message = await channel.messages.fetch(raidDoc.messageId);
    } catch (e) {
      console.error(`[WARN] getOrLoadRuntime: no se pudo obtener el mensaje del raid #${raidDoc.eventId}:`, e?.message);
    }
  }

  const runtimeEntry = { raidId: raidDoc.eventId, raid: raidDoc, message, templateName: raidDoc.templateName };
  raidRegistry.register(runtimeEntry);
  return runtimeEntry;
}

function joinFailureMessage(reason) {
  switch (reason) {
    case 'slot_full':
      return 'Esta arma ya alcanzó su límite dentro del grupo.';
    case 'group_full':
      return 'No se pueden unir más jugadores a este grupo.';
    case 'disabled':
      return 'Esta opción no está disponible en este raid.';
    case 'not_found':
      return 'No se pudo procesar la selección del arma.';
    case 'already_here':
      return null;
    default:
      return 'No se pudo completar la acción.';
  }
}

function looterFailureMessage(reason) {
  switch (reason) {
    case 'raid_not_full':
      return 'Los looters solo pueden unirse cuando el raid esté completo.';
    case 'looters_full':
      return 'El cupo de looters ya está lleno.';
    case 'no_looters':
      return 'Este raid no tiene sección de looters.';
    default:
      return 'No se pudo completar la acción.';
  }
}

function notifyRaidLeader(raid, guild, message) {
  setImmediate(async () => {
    try {
      if (!raid.leaderId || !guild) return;
      const leader = await guild.members.fetch(raid.leaderId);
      await leader.send({ content: message });
    } catch (e) {
      console.log(`[INFO] notifyRaidLeader: no se pudo enviar DM: ${e?.message}`);
    }
  });
}

function notifyPromotedUser(promotion, runtime, guild) {
  setImmediate(async () => {
    try {
      if (!guild) return;
      const member = await guild.members.fetch(promotion.userId);
      await member.send({
        content: `✅ Se liberó un cupo en el raid **#${runtime.raidId}** y fuiste movido automáticamente desde la lista de espera a **${promotion.weaponLabel}**. ¡Buena suerte!`,
      });
    } catch (e) {
      console.log(`[INFO] notifyPromotedUser: no se pudo enviar DM a ${promotion.userId}: ${e?.message}`);
    }
  });
}

function sendBuildDm(runtime, slotId, user) {
  setImmediate(async () => {
    try {
      const slot = raidState.findSlot(runtime.raid, slotId);
      if (!slot || !slot.url || !String(slot.url).trim()) return;
      const group = runtime.raid.groups.find((g) => g.groupKey === slot.groupKey);
      const buildEmbed = createBuildEmbed(group?.displayName || slot.groupKey, slot.url, slot.emoji, runtime.templateName);
      const { client } = require('./client');
      const discordUser = await client.users.fetch(user.userId);
      await discordUser.send({ embeds: [buildEmbed] });
    } catch (e) {
      console.log(`[INFO] sendBuildDm: no se pudo enviar DM: ${e?.message}`);
    }
  });
}

function markFullNotification(runtime) {
  if (runtime.raid.fullNotificationSent) return false;
  if (!raidState.isRaidFull(runtime.raid)) return false;
  runtime.raid.fullNotificationSent = true;
  return true;
}

/** Post-procesa una unión exitosa a un slot: render, persistencia, notificaciones y promoción. */
async function afterJoin(runtime, slotId, user, freedSlotIds, guild) {
  let promoted = [];
  if (freedSlotIds && freedSlotIds.length > 0) {
    promoted = raidState.promoteFromWaitlist(runtime.raid, freedSlotIds);
  }
  const becameFull = markFullNotification(runtime);

  await raidRegistry.saveRaid(runtime.raidId);
  await raidRegistry.renderAndEdit(runtime.raidId);

  if (becameFull) {
    notifyRaidLeader(runtime.raid, guild, `🎉 El raid **#${runtime.raidId}** se ha llenado por completo.`);
  }
  for (const promotion of promoted) notifyPromotedUser(promotion, runtime, guild);

  sendBuildDm(runtime, slotId, user);
}

/**
 * Select principal de armas en el mensaje público del raid.
 * customId nuevo: raid:join:<raidId>:<page> — customId legacy: weapons-{templateName}-{id}
 */
async function handleJoin(interaction, raidId) {
  await safeDeferUpdate(interaction);
  const runtime = await getOrLoadRuntime({ raidId, messageId: interaction.message?.id, guild: interaction.guild });
  if (!runtime) return replyGone(interaction);
  if (runtime.raid.status !== 'active') return replyClosed(interaction);

  const slotId = interaction.values[0];
  const user = { userId: interaction.user.id, username: interaction.user.username };

  await raidRegistry.withRaidLock(runtime.raidId, async () => {
    const result = raidState.joinSlot(runtime.raid, slotId, user);
    if (!result.ok) {
      const msg = joinFailureMessage(result.reason);
      if (msg) await ephemeralReply(interaction, msg);
      return;
    }
    await afterJoin(runtime, slotId, user, result.freedSlotIds, interaction.guild);
  });
}

/** Select de grupos, modo "dos pasos" cuando hay más de 100 slots disponibles. */
async function handleGroupPick(interaction, raidId) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: interaction.message?.id, guild: interaction.guild });
  if (!runtime) return replyGone(interaction);
  if (runtime.raid.status !== 'active') return replyClosed(interaction);

  const groupKey = interaction.values[0];
  const row = renderGroupPickSelect(runtime.raid, runtime.raid, groupKey);
  if (!row) return ephemeralReply(interaction, 'Ese grupo ya no tiene cupos disponibles.');
  await ephemeralReply(interaction, { content: 'Elige tu arma dentro del grupo:', components: [row] });
}

/** Select de arma dentro de un grupo (segundo paso del modo >100 slots), en mensaje efímero. */
async function handleJoinPick(interaction, raidId) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: null, guild: interaction.guild });
  if (!runtime) return interaction.update({ content: 'No se encontró el evento correspondiente.', components: [] });
  if (runtime.raid.status !== 'active') return interaction.update({ content: '🔒 Este evento ha sido finalizado.', components: [] });

  const slotId = interaction.values[0];
  const user = { userId: interaction.user.id, username: interaction.user.username };

  await raidRegistry.withRaidLock(runtime.raidId, async () => {
    const result = raidState.joinSlot(runtime.raid, slotId, user);
    if (!result.ok) {
      const msg = joinFailureMessage(result.reason) || 'No se pudo completar la acción.';
      await interaction.update({ content: msg, components: [] });
      return;
    }
    await afterJoin(runtime, slotId, user, result.freedSlotIds, interaction.guild);
    await interaction.update({ content: '✅ ¡Te uniste al raid!', components: [] });
  });
}

/** Botón "Lista de espera": abre el select efímero con todas las armas. */
async function handleWaitlistOpen(interaction, raidId) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: interaction.message?.id, guild: interaction.guild });
  if (!runtime) return replyGone(interaction);
  if (runtime.raid.status !== 'active') return replyClosed(interaction);

  const rows = renderWaitlistSelect(runtime.raid, runtime.raid);
  if (rows.length === 0) return ephemeralReply(interaction, 'No hay armas configuradas en este raid.');
  await ephemeralReply(interaction, {
    content: 'Selecciona la(s) arma(s) para las que quieres esperar cupo:',
    components: rows,
  });
}

/**
 * Select de armas de la lista de espera. Si alguna elegida tiene cupo AHORA,
 * une directo; si no, agrega a la waitlist con esas preferencias.
 */
async function handleWaitlistPick(interaction, raidId) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: null, guild: interaction.guild });
  if (!runtime) return interaction.update({ content: 'No se encontró el evento correspondiente.', components: [] });
  if (runtime.raid.status !== 'active') return interaction.update({ content: '🔒 Este evento ha sido finalizado.', components: [] });

  const slotIds = interaction.values;
  const user = { userId: interaction.user.id, username: interaction.user.username };

  await raidRegistry.withRaidLock(runtime.raidId, async () => {
    const available = raidState.availableSlots(runtime.raid).map((s) => s.slotId);
    const directSlot = slotIds.find((id) => available.includes(id));

    if (directSlot) {
      const result = raidState.joinSlot(runtime.raid, directSlot, user);
      if (result.ok) {
        await afterJoin(runtime, directSlot, user, result.freedSlotIds, interaction.guild);
        await interaction.update({ content: '✅ Te uniste directamente: ya había cupo disponible.', components: [] });
        return;
      }
    }

    raidState.addToWaitlist(runtime.raid, user, slotIds);
    await raidRegistry.saveRaid(runtime.raidId);
    await raidRegistry.renderAndEdit(runtime.raidId);
    await interaction.update({
      content: '🕒 Te agregamos a la lista de espera para las armas elegidas. Te avisaremos por DM si se libera un cupo.',
      components: [],
    });
  });
}

/** Botón "No puedo ir": toggle. Libera el slot y promueve desde waitlist si aplica. */
async function handleCannotGo(interaction, raidId) {
  await safeDeferUpdate(interaction);
  const runtime = await getOrLoadRuntime({ raidId, messageId: interaction.message?.id, guild: interaction.guild });
  if (!runtime) return replyGone(interaction);
  if (runtime.raid.status !== 'active') return replyClosed(interaction);

  const user = { userId: interaction.user.id, username: interaction.user.username };

  await raidRegistry.withRaidLock(runtime.raidId, async () => {
    const result = raidState.toggleCannotGo(runtime.raid, user);
    let promoted = [];
    if (result.toggled === 'added' && result.freedSlotIds && result.freedSlotIds.length > 0) {
      promoted = raidState.promoteFromWaitlist(runtime.raid, result.freedSlotIds);
    }
    await raidRegistry.saveRaid(runtime.raidId);
    await raidRegistry.renderAndEdit(runtime.raidId);
    for (const promotion of promoted) notifyPromotedUser(promotion, runtime, interaction.guild);
  });
}

/**
 * Botón "Looters": toggle, solo habilitado (a nivel de negocio) cuando el raid
 * está completo. Ser looter es excluyente con tener plaza / lista de espera /
 * "no puedo ir", así que apuntarse puede liberar un slot y disparar una promoción.
 */
async function handleLooter(interaction, raidId) {
  await safeDeferUpdate(interaction);
  const runtime = await getOrLoadRuntime({ raidId, messageId: interaction.message?.id, guild: interaction.guild });
  if (!runtime) return replyGone(interaction);
  if (runtime.raid.status !== 'active') return replyClosed(interaction);

  const user = { userId: interaction.user.id, username: interaction.user.username };

  await raidRegistry.withRaidLock(runtime.raidId, async () => {
    const already = (runtime.raid.looters?.users || []).some((u) => u.userId === user.userId);
    const result = already ? raidState.leaveLooter(runtime.raid, user.userId) : raidState.joinLooter(runtime.raid, user);
    if (!result.ok) {
      if (!already) {
        await ephemeralReply(interaction, looterFailureMessage(result.reason));
      }
      return;
    }
    let promoted = [];
    if (result.freedSlotIds && result.freedSlotIds.length > 0) {
      promoted = raidState.promoteFromWaitlist(runtime.raid, result.freedSlotIds);
    }
    await raidRegistry.saveRaid(runtime.raidId);
    await raidRegistry.renderAndEdit(runtime.raidId);
    for (const promotion of promoted) notifyPromotedUser(promotion, runtime, interaction.guild);
  });
}

/** Botón "Finalizar evento": pide confirmación en dos pasos. */
async function handleFinish(interaction, raidId) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: interaction.message?.id, guild: interaction.guild });
  if (!runtime) return replyGone(interaction);
  if (runtime.raid.status !== 'active') return replyClosed(interaction);
  if (!raidState.canManageRaid(runtime.raid, interaction.member)) {
    return ephemeralReply(interaction, 'Solo el líder del raid o un administrador puede finalizarlo.');
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`raid:finishok:${runtime.raidId}`).setLabel('Sí, finalizar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`raid:finishno:${runtime.raidId}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
  );
  await ephemeralReply(interaction, {
    content: `⚠️ ¿Seguro que quieres finalizar el raid **#${runtime.raidId}**? Esto bloqueará el mensaje: nadie podrá unirse, cambiar de arma ni salir después.`,
    components: [row],
  });
}

async function handleFinishConfirm(interaction, raidId) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: null, guild: interaction.guild });
  if (!runtime) return interaction.update({ content: 'No se encontró el evento correspondiente.', components: [] });
  if (!raidState.canManageRaid(runtime.raid, interaction.member)) {
    return interaction.update({ content: 'Solo el líder del raid o un administrador puede finalizarlo.', components: [] });
  }

  const result = await finishRaid(raidId, interaction.user.id, interaction.guild);
  if (!result.ok) {
    const msg = result.reason === 'already_closed' ? '🔒 Este evento ya estaba finalizado.' : 'No se pudo finalizar el raid.';
    return interaction.update({ content: msg, components: [] });
  }

  // Es justo ahora cuando el líder sabe quién apareció, así que se le pregunta
  // aquí mismo en vez de dejarle buscar el botón del mensaje.
  const panel = attendancePanelPayload(runtime);
  if (!panel) {
    return interaction.update({ content: `🔒 Raid **#${raidId}** finalizado correctamente.`, components: [] });
  }
  await interaction.update({
    content: `🔒 Raid **#${raidId}** finalizado.\n\n${panel.content}`,
    components: panel.components,
  });
}

async function handleFinishCancel(interaction) {
  await interaction.update({ content: 'Cancelado: el raid sigue activo.', components: [] });
}

/**
 * Cierra un raid: marca status=closed, deja el mensaje en solo lectura y saca
 * el runtime del registro. Compartido entre el botón "Finalizar evento" y
 * `/raid close`.
 *
 * No borra el hilo privado: sobrevive al cierre y solo desaparece si alguien
 * pulsa "Eliminar hilo".
 * @param {string} raidId
 * @param {string} actorId
 * @param {import('discord.js').Guild} guild
 */
async function finishRaid(raidId, actorId, guild) {
  const runtime = await getOrLoadRuntime({ raidId, guild });
  if (!runtime) return { ok: false, reason: 'not_found' };
  if (runtime.raid.status !== 'active') return { ok: false, reason: 'already_closed' };

  return raidRegistry.withRaidLock(raidId, async () => {
    const previous = {
      status: runtime.raid.status,
      closedBy: runtime.raid.closedBy,
      closedAt: runtime.raid.closedAt,
    };
    runtime.raid.status = 'closed';
    runtime.raid.closedBy = actorId;
    runtime.raid.closedAt = new Date();

    // El hilo privado se queda como está: cerrar el raid ya no lo borra. Quien
    // quiera quitarlo usa el botón "Eliminar hilo", que sigue en el mensaje
    // mientras `threadId` apunte a algo.

    // Vía el serializador del registro: un guardado de la última interacción
    // puede seguir en vuelo sobre este mismo documento.
    try {
      await raidRegistry.saveRaid(raidId);
    } catch (error) {
      runtime.raid.status = previous.status;
      runtime.raid.closedBy = previous.closedBy;
      runtime.raid.closedAt = previous.closedAt;
      console.error(`[ERROR] finishRaid: no se pudo persistir el cierre de #${raidId}:`, error);
      return { ok: false, reason: 'persist_failed' };
    }
    try {
      require('./reminderManager').cancelReminder(raidId);
    } catch (e) {
      console.error('[WARN] finishRaid: error cancelando recordatorio:', e?.message);
    }
    await raidRegistry.renderAndEdit(raidId);

    raidRegistry.unregister(raidId);
    return { ok: true };
  });
}

// ─────────────────────────────── Asistencia ───────────────────────────────
// Solo tras finalizar el raid. El líder marca a quienes NO aparecieron; todo el
// que participó y no queda marcado cuenta como asistente, así que el informe
// del embed ya es correcto desde el cierre y esto solo registra las excepciones.

/**
 * Contenido + selectores del panel efímero, siempre reconstruidos desde el
 * estado guardado: no hay selección a medias viviendo en memoria.
 *
 * El panel se muestra nada más finalizar el raid y también desde el botón del
 * mensaje, que es la vía para volver cuando el efímero ya caducó (Discord
 * invalida sus componentes a los 15 minutos).
 *
 * @returns {{content:string, components:Array}|null} null si nadie participó
 */
function attendancePanelPayload(runtime) {
  const roster = raidState.raidRoster(runtime.raid);
  if (roster.length === 0) return null;
  const absentIds = raidState.getAbsentIds(runtime.raid);
  const ausentes = roster.filter((r) => absentIds.has(r.userId)).length;

  const lineas = [
    `Marca a quienes **NO** asistieron al raid **#${runtime.raidId}**. ` +
      'Los que dejes sin marcar cuentan como que sí participaron.',
    `Ahora mismo: **${roster.length - ausentes}** asistieron · **${ausentes}** no asistieron.`,
  ];
  if (roster.length > ATTENDANCE_CAPACITY) {
    lineas.push(
      `⚠️ Discord solo deja marcar ${ATTENDANCE_CAPACITY} jugadores por panel: ` +
        `los ${roster.length - ATTENDANCE_CAPACITY} últimos quedan como asistentes.`
    );
  }

  return {
    content: lineas.join('\n'),
    components: renderAttendanceRows(runtime.raid, roster, absentIds),
  };
}

/** Botón "Registrar asistencia" del mensaje de un raid ya finalizado. */
async function handleAttendanceOpen(interaction, raidId) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: interaction.message?.id, guild: interaction.guild });
  if (!runtime) return replyGone(interaction);
  if (runtime.raid.status === 'active') {
    return ephemeralReply(interaction, 'La asistencia solo se registra cuando el evento ha finalizado.');
  }
  if (!raidState.canManageRaid(runtime.raid, interaction.member)) {
    return ephemeralReply(interaction, 'Solo el líder del raid o un administrador puede registrar la asistencia.');
  }

  const panel = attendancePanelPayload(runtime);
  if (!panel) {
    return ephemeralReply(interaction, 'Este raid no tuvo participantes, no hay asistencia que registrar.');
  }
  await ephemeralReply(interaction, panel);
}

/**
 * Selector de una página del panel. La página es la unidad de guardado: los
 * ausentes de esa página pasan a ser exactamente los seleccionados, así que
 * deseleccionar a alguien lo devuelve a "asistió".
 */
async function handleAttendancePick(interaction, raidId, extra) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: null, guild: interaction.guild });
  if (!runtime) {
    return interaction.update({ content: 'No se encontró el evento correspondiente.', components: [] });
  }
  if (!raidState.canManageRaid(runtime.raid, interaction.member)) {
    return interaction.update({
      content: 'Solo el líder del raid o un administrador puede registrar la asistencia.',
      components: [],
    });
  }

  const page = Number.parseInt(extra, 10) || 0;

  await raidRegistry.withRaidLock(runtime.raidId, async () => {
    const roster = raidState.raidRoster(runtime.raid);
    if (roster.length === 0) return;
    const pageUserIds = roster
      .slice(page * ATTENDANCE_PAGE_SIZE, (page + 1) * ATTENDANCE_PAGE_SIZE)
      .map((r) => r.userId);

    raidState.applyAbsenceSelection(runtime.raid, {
      pageUserIds,
      selectedUserIds: interaction.values,
      actorId: interaction.user.id,
    });

    // Se espera al guardado: el panel se repinta desde este mismo documento y
    // un fallo de BD no debe quedar reflejado como si se hubiera guardado.
    await raidRegistry.saveRaid(runtime.raidId);
    await raidRegistry.renderAndEdit(runtime.raidId);
  });

  const panel = attendancePanelPayload(runtime);
  await interaction.update(
    panel || { content: 'Este raid no tuvo participantes, no hay asistencia que registrar.', components: [] }
  );
}

/**
 * Botón "Listo": cierra el panel efímero. Lo registrado ya está guardado.
 *
 * Es el momento en que el hilo privado deja de hacer falta, así que aquí se
 * ofrece borrarlo. Solo se ofrece: si el líder no pulsa nada, el hilo se queda.
 */
async function handleAttendanceDone(interaction, raidId) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: null, guild: interaction.guild });
  if (!runtime) {
    return interaction.update({ content: 'No se encontró el evento correspondiente.', components: [] });
  }
  const { attended, absent } = raidState.attendanceReport(runtime.raid);
  const threadRow = renderThreadDeleteRow(runtime.raid);
  const resumen =
    `📋 Asistencia del raid **#${runtime.raidId}** registrada: ` +
    `**${attended.length}** asistieron · **${absent.length}** no asistieron. ` +
    'Ya se ve en el mensaje del raid.';

  await interaction.update({
    content: threadRow
      ? `${resumen}\n\n💬 El hilo privado sigue abierto. Bórralo si ya no hace falta; ` +
        'si prefieres conservarlo, ignora este botón: el hilo no se borra solo y ' +
        'lo tienes también en el mensaje del raid.'
      : resumen,
    components: threadRow ? [threadRow] : [],
  });
}

// ───────────────────────── Borrado del hilo privado ─────────────────────────
// Nunca es automático: ni al finalizar el raid, ni al expirar, ni al registrar
// la asistencia. Siempre lo pide alguien que puede gestionar el raid, y en dos
// pasos porque borrar un hilo se lleva por delante toda la conversación.

/** Botón "Eliminar hilo": pide confirmación en dos pasos. */
async function handleThreadDelete(interaction, raidId) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: interaction.message?.id, guild: interaction.guild });
  if (!runtime) return replyGone(interaction);
  if (!raidState.canManageRaid(runtime.raid, interaction.member)) {
    return ephemeralReply(interaction, 'Solo el líder del raid o un administrador puede borrar el hilo privado.');
  }
  if (!runtime.raid.threadId) {
    return ephemeralReply(interaction, 'Este raid ya no tiene hilo privado.');
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`raid:thdelok:${runtime.raidId}`).setLabel('Sí, borrar el hilo').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`raid:thdelno:${runtime.raidId}`).setLabel('Conservarlo').setStyle(ButtonStyle.Secondary)
  );
  await ephemeralReply(interaction, {
    content:
      `⚠️ ¿Seguro que quieres borrar el hilo privado del raid **#${runtime.raidId}**? ` +
      'Se perderá todo lo que se haya escrito ahí y no se puede deshacer.',
    components: [row],
  });
}

/** Confirmación del borrado. Es el único punto del bot que borra un hilo. */
async function handleThreadDeleteConfirm(interaction, raidId) {
  const runtime = await getOrLoadRuntime({ raidId, messageId: null, guild: interaction.guild });
  if (!runtime) {
    return interaction.update({ content: 'No se encontró el evento correspondiente.', components: [] });
  }
  if (!raidState.canManageRaid(runtime.raid, interaction.member)) {
    return interaction.update({
      content: 'Solo el líder del raid o un administrador puede borrar el hilo privado.',
      components: [],
    });
  }

  const threadId = runtime.raid.threadId;
  if (!threadId) {
    return interaction.update({ content: 'Este raid ya no tiene hilo privado.', components: [] });
  }

  const result = await deleteRaidThread(interaction.guild, threadId, runtime.raidId);
  if (!result.ok) {
    return interaction.update({
      content:
        '❌ No se pudo borrar el hilo. Comprueba que el bot conserve el permiso ' +
        '«Gestionar hilos» en el canal e inténtalo de nuevo.',
      components: [],
    });
  }

  // El id se suelta solo después de que Discord confirme el borrado: soltarlo
  // antes y fallar la llamada dejaría el hilo vivo y sin botón para quitarlo.
  runtime.raid.threadId = null;
  await raidRegistry.saveRaid(runtime.raidId);
  await raidRegistry.renderAndEdit(runtime.raidId);

  await interaction.update({
    content: `🗑️ Hilo privado del raid **#${runtime.raidId}** borrado.`,
    components: [],
  });
}

async function handleThreadDeleteCancel(interaction) {
  await interaction.update({ content: 'El hilo privado se queda como está.', components: [] });
}

/**
 * Alinea la membresía del hilo privado con el embed después de una interacción.
 *
 * Se hace aquí, en el enrutador, y no en cada handler: apuntarse, salir, entrar
 * como looter o ser promovido desde la lista de espera pasan todos por aquí.
 * Va fuera del flujo de respuesta porque añadir/quitar miembros son llamadas
 * REST y la interacción no debe esperarlas.
 * @param {string|null} raidId
 * @param {import('discord.js').Interaction} interaction
 */
function scheduleThreadSync(raidId, interaction) {
  const runtime = raidId
    ? raidRegistry.getByRaidId(raidId)
    : raidRegistry.getByMessageId(interaction.message?.id);

  // Un raid finalizado conserva el hilo, pero su membresía ya no se toca: la
  // lista queda congelada tal como estaba al cerrar.
  if (!runtime?.raid?.threadId || runtime.raid.status !== 'active') return;

  setImmediate(async () => {
    try {
      await syncRaidThread(interaction.guild, runtime.raid);
    } catch (e) {
      console.error(`[WARN] scheduleThreadSync: raid #${runtime.raidId}:`, e?.message);
    }
  });
}

/**
 * Punto de entrada único llamado desde events.js para cualquier customId de
 * componente relacionado con un raid (nuevo esquema "raid:*" o legacy).
 * @returns {Promise<boolean>} true si el customId era de un raid y se manejó
 */
async function routeRaidInteraction(interaction) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return false;

  const { action, raidId, extra } = parsed;
  try {
    switch (action) {
      case 'join':
        await handleJoin(interaction, raidId);
        break;
      case 'group':
        await handleGroupPick(interaction, raidId);
        break;
      case 'joinpick':
        await handleJoinPick(interaction, raidId);
        break;
      case 'wait':
        await handleWaitlistOpen(interaction, raidId);
        break;
      case 'waitpick':
        await handleWaitlistPick(interaction, raidId);
        break;
      case 'cannotgo':
        await handleCannotGo(interaction, raidId);
        break;
      case 'looter':
        await handleLooter(interaction, raidId);
        break;
      case 'finish':
        await handleFinish(interaction, raidId);
        break;
      case 'finishok':
        await handleFinishConfirm(interaction, raidId);
        break;
      case 'finishno':
        await handleFinishCancel(interaction);
        break;
      case 'att':
        await handleAttendanceOpen(interaction, raidId);
        break;
      case 'attpick':
        await handleAttendancePick(interaction, raidId, extra);
        break;
      case 'attdone':
        await handleAttendanceDone(interaction, raidId);
        break;
      case 'thdel':
        await handleThreadDelete(interaction, raidId);
        break;
      case 'thdelok':
        await handleThreadDeleteConfirm(interaction, raidId);
        break;
      case 'thdelno':
        await handleThreadDeleteCancel(interaction);
        break;
      case 'full':
        break; // select decorativo/deshabilitado, no debería dispararse
      default:
        return false;
    }
  } catch (e) {
    console.error(`[ERROR] routeRaidInteraction (${action}):`, e);
    const failedRuntime = raidId
      ? raidRegistry.getByRaidId(raidId)
      : raidRegistry.getByMessageId(interaction.message?.id);
    if (failedRuntime) raidRegistry.unregister(failedRuntime.raidId);
    await ephemeralReply(
      interaction,
      '❌ No se pudo guardar el cambio. El raid no se marcó como actualizado; inténtalo de nuevo.'
    );
    return true;
  }

  scheduleThreadSync(raidId, interaction);
  return true;
}

module.exports = {
  routeRaidInteraction,
  getOrLoadRuntime,
  finishRaid,
  attendancePanelPayload,
};
