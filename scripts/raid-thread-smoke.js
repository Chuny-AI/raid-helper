/**
 * Prueba de humo del hilo privado del raid (src/utils/raidThread.js).
 *
 * Cubre quién tiene derecho a estar dentro, el diff de membresía, los fallos de
 * permisos y el borrado (siempre manual: ninguna rutina borra hilos por su
 * cuenta). No requiere BD ni conexión a Discord: la API se sustituye por dobles
 * que registran las llamadas.
 */
const assert = require('node:assert');
const { PermissionFlagsBits } = require('discord.js');

// Aquí no hay Mongo. El caso "raid de otro servidor" cae al respaldo en BD
// a propósito (es el segundo cerrojo), así que se recorta la espera de
// mongoose para no bloquear la prueba 10 segundos por un fallo esperado.
require('mongoose').set('bufferTimeoutMS', 50);

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${error.message}`);
    process.exitCode = 1;
  }
}

const {
  THREAD_NAME_MAX,
  collectAllowedMemberIds,
  buildThreadName,
  missingThreadPermissions,
  createRaidThread,
  syncRaidThread,
  deleteRaidThread,
  describeThreadFailure,
} = require('../src/utils/raidThread');
const { buildInitialState, joinSlot } = require('../src/services/raidState');
const raidRegistry = require('../src/services/raidRegistry');
const { routeRaidInteraction, finishRaid } = require('../src/utils/raidInteractions');
const {
  renderRaidEmbed,
  renderRaidComponents,
  renderThreadDeleteRow,
} = require('../src/utils/raidRender');

const ALL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.ManageThreads,
];

/** Canal falso con los permisos indicados y un `threads.create` instrumentado. */
function fakeChannel({ permissions = ALL_PERMISSIONS, thread = null, createError = null } = {}) {
  const granted = new Set(permissions);
  const calls = [];
  return {
    calls,
    permissionsFor: () => ({ has: (flag) => granted.has(flag) }),
    threads: {
      create: async (options) => {
        calls.push(options);
        if (createError) throw createError;
        return thread;
      },
    },
  };
}

/** Hilo falso: expone la membresía como un Map y registra add/remove/delete. */
function fakeThread({ id = 'T1', members = [], archived = false, failAdd = [] } = {}) {
  const state = new Map(members.map((m) => [m, { id: m }]));
  const log = { added: [], removed: [], sent: [], deleted: false, unarchived: false };
  return {
    id,
    log,
    archived,
    isThread: () => true,
    setArchived: async () => { log.unarchived = true; },
    send: async (payload) => { log.sent.push(payload); },
    delete: async () => { log.deleted = true; },
    members: {
      fetch: async () => state,
      add: async (userId) => {
        if (failAdd.includes(userId)) throw new Error(`no se puede añadir a ${userId}`);
        log.added.push(userId);
        state.set(userId, { id: userId });
      },
      remove: async (userId) => {
        log.removed.push(userId);
        state.delete(userId);
      },
    },
  };
}

function fakeGuild(thread, { id = 'G1' } = {}) {
  return {
    id,
    members: { me: { id: 'BOT' } },
    client: { user: { id: 'BOT' } },
    channels: {
      fetch: async (id) => {
        if (thread && id === thread.id) return thread;
        throw Object.assign(new Error('Unknown Channel'), { code: 10003 });
      },
    },
  };
}

/** Raid mínimo con un participante, un looter y ruido que NO debe entrar al hilo. */
function fakeRaid(overrides = {}) {
  return {
    eventId: 'AB3K9F',
    guildId: 'G1',
    title: 'Raid de prueba',
    status: 'active',
    leaderId: 'LEADER',
    threadId: 'T1',
    slots: [
      { slotId: 'g~0', users: [{ userId: 'U1' }, { userId: 'U2' }] },
      { slotId: 'g~1', users: [] },
    ],
    looters: { max: 2, users: [{ userId: 'L1' }] },
    waitlist: [{ userId: 'W1' }],
    cannotGo: [{ userId: 'N1' }],
    ...overrides,
  };
}

async function main() {
  console.log('\n— Quién tiene derecho a estar en el hilo —');

  await test('entran participantes, looters y el líder', () => {
    const ids = collectAllowedMemberIds(fakeRaid());
    assert.deepStrictEqual([...ids].sort(), ['L1', 'LEADER', 'U1', 'U2']);
  });

  await test('lista de espera y "no puedo ir" quedan fuera', () => {
    const ids = collectAllowedMemberIds(fakeRaid());
    assert.ok(!ids.has('W1'), 'la lista de espera no debe entrar');
    assert.ok(!ids.has('N1'), '"no puedo ir" no debe entrar');
  });

  await test('un raid vacío no lanza', () => {
    assert.deepStrictEqual([...collectAllowedMemberIds(undefined)], []);
    assert.deepStrictEqual([...collectAllowedMemberIds({})], []);
  });

  console.log('\n— Nombre del hilo —');

  await test('conserva el id del raid y respeta el límite de Discord', () => {
    const name = buildThreadName({ eventId: 'AB3K9F', title: 'x'.repeat(200) });
    assert.ok(name.length <= THREAD_NAME_MAX, `nombre de ${name.length} chars`);
    assert.ok(name.endsWith('#AB3K9F'), `el id se perdió: ${name}`);
  });

  await test('sin título usa un nombre por defecto', () => {
    assert.strictEqual(buildThreadName({ eventId: 'AB3K9F', title: '   ' }), 'Raid · #AB3K9F');
  });

  console.log('\n— Permisos del canal —');

  await test('con todos los permisos no falta ninguno', () => {
    assert.deepStrictEqual(missingThreadPermissions(fakeChannel(), fakeGuild()), []);
  });

  await test('detecta los permisos que faltan por nombre', () => {
    const channel = fakeChannel({ permissions: [PermissionFlagsBits.ViewChannel] });
    const missing = missingThreadPermissions(channel, fakeGuild());
    assert.deepStrictEqual(missing, ['Crear hilos privados', 'Enviar mensajes en hilos', 'Gestionar hilos']);
  });

  await test('si no se pueden evaluar no se inventan permisos que faltan', () => {
    assert.deepStrictEqual(missingThreadPermissions({}, fakeGuild()), []);
  });

  console.log('\n— Creación del hilo —');

  await test('crea un hilo privado no invitable y da la bienvenida', async () => {
    const thread = fakeThread();
    const channel = fakeChannel({ thread });
    const result = await createRaidThread({ channel, guild: fakeGuild(thread), raid: fakeRaid() });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.thread, thread);
    assert.strictEqual(channel.calls[0].type, 12, 'debe ser ChannelType.PrivateThread');
    assert.strictEqual(channel.calls[0].invitable, false);
    assert.strictEqual(thread.log.sent.length, 1, 'falta el mensaje de bienvenida');
  });

  await test('sin permisos no se crea y se dice cuáles faltan', async () => {
    const channel = fakeChannel({ permissions: [PermissionFlagsBits.ViewChannel] });
    const result = await createRaidThread({ channel, guild: fakeGuild(), raid: fakeRaid() });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'missing_permissions');
    assert.ok(result.missing.includes('Gestionar hilos'));
    assert.strictEqual(channel.calls.length, 0, 'no debió llamar a la API');
  });

  await test('un canal que no admite hilos no lanza', async () => {
    const result = await createRaidThread({ channel: {}, guild: fakeGuild(), raid: fakeRaid() });
    assert.deepStrictEqual(result, { ok: false, reason: 'unsupported_channel' });
  });

  await test('un rechazo de Discord se devuelve, no se propaga', async () => {
    const channel = fakeChannel({ createError: Object.assign(new Error('nope'), { code: 50013 }) });
    const result = await createRaidThread({ channel, guild: fakeGuild(), raid: fakeRaid() });
    assert.deepStrictEqual(result, { ok: false, reason: 'api_error' });
  });

  await test('un fallo del mensaje de bienvenida no invalida el hilo', async () => {
    const thread = fakeThread();
    thread.send = async () => { throw new Error('sin permiso para escribir'); };
    const result = await createRaidThread({ channel: fakeChannel({ thread }), guild: fakeGuild(thread), raid: fakeRaid() });
    assert.strictEqual(result.ok, true);
  });

  console.log('\n— Sincronización de miembros —');

  await test('añade a los anotados que aún no están', async () => {
    const thread = fakeThread({ members: ['BOT', 'LEADER'] });
    const result = await syncRaidThread(fakeGuild(thread), fakeRaid());

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.added.sort(), ['L1', 'U1', 'U2']);
    assert.deepStrictEqual(result.removed, []);
  });

  await test('saca a quien ya no está en el embed', async () => {
    const thread = fakeThread({ members: ['BOT', 'LEADER', 'U1', 'U2', 'L1', 'EXPULSADO'] });
    const result = await syncRaidThread(fakeGuild(thread), fakeRaid());

    assert.deepStrictEqual(result.added, []);
    assert.deepStrictEqual(result.removed, ['EXPULSADO']);
  });

  await test('nunca saca al propio bot', async () => {
    const thread = fakeThread({ members: ['BOT'] });
    await syncRaidThread(fakeGuild(thread), fakeRaid({ leaderId: null, slots: [], looters: null }));
    assert.deepStrictEqual(thread.log.removed, [], 'el bot no debe salir del hilo');
  });

  await test('desarchiva antes de tocar la membresía', async () => {
    const thread = fakeThread({ members: ['BOT'], archived: true });
    await syncRaidThread(fakeGuild(thread), fakeRaid());
    assert.strictEqual(thread.log.unarchived, true);
  });

  await test('un add que falla no aborta el resto', async () => {
    const thread = fakeThread({ members: ['BOT'], failAdd: ['U1'] });
    const result = await syncRaidThread(fakeGuild(thread), fakeRaid());

    assert.strictEqual(result.ok, true);
    assert.ok(!result.added.includes('U1'));
    assert.ok(result.added.includes('U2'), 'los demás debían añadirse igualmente');
  });

  await test('un hilo borrado a mano se reporta como ausente', async () => {
    const result = await syncRaidThread(fakeGuild(null), fakeRaid());
    assert.deepStrictEqual(result, { ok: false, reason: 'gone' });
  });

  await test('un raid sin hilo no hace nada', async () => {
    const result = await syncRaidThread(fakeGuild(null), fakeRaid({ threadId: null }));
    assert.deepStrictEqual(result, { ok: false, reason: 'no_thread' });
  });

  await test('dos sincronizaciones a la vez no se pisan', async () => {
    const thread = fakeThread({ members: ['BOT'] });
    const raid = fakeRaid();
    const [a, b] = await Promise.all([
      syncRaidThread(fakeGuild(thread), raid),
      syncRaidThread(fakeGuild(thread), raid),
    ]);
    assert.strictEqual(a.ok && b.ok, true);
    // La segunda ve el resultado de la primera: nadie se añade dos veces.
    assert.deepStrictEqual([...a.added, ...b.added].sort(), ['L1', 'LEADER', 'U1', 'U2']);
  });

  console.log('\n— Borrado del hilo (a petición) —');

  await test('borra el hilo del raid', async () => {
    const thread = fakeThread();
    const result = await deleteRaidThread(fakeGuild(thread), 'T1', 'AB3K9F');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(thread.log.deleted, true);
  });

  await test('un hilo ya borrado cuenta como éxito', async () => {
    const result = await deleteRaidThread(fakeGuild(null), 'T1', 'AB3K9F');
    assert.deepStrictEqual(result, { ok: true, reason: 'already_gone' });
  });

  await test('sin hilo no hay nada que borrar', async () => {
    assert.deepStrictEqual(await deleteRaidThread(fakeGuild(null), null, 'AB3K9F'), {
      ok: true,
      reason: 'no_thread',
    });
  });

  await test('un fallo de Discord al borrar no se propaga', async () => {
    const thread = fakeThread();
    thread.delete = async () => { throw Object.assign(new Error('nope'), { code: 50013 }); };
    const result = await deleteRaidThread(fakeGuild(thread), 'T1', 'AB3K9F');
    assert.deepStrictEqual(result, { ok: false, reason: 'api_error' });
  });

  console.log('\n— Avisos al líder —');

  await test('cada fallo tiene su explicación', () => {
    assert.match(
      describeThreadFailure({ reason: 'missing_permissions', missing: ['Gestionar hilos'] }),
      /Gestionar hilos/
    );
    assert.match(describeThreadFailure({ reason: 'unsupported_channel' }), /no admite hilos/);
    assert.match(describeThreadFailure({ reason: 'api_error' }), /rechazó la creación/);
  });

  console.log('\n— El embed enlaza el hilo —');

  const template = {
    weapons: {
      group_1: { displayName: 'DPS', defaultEmoji: '1', data: [{ name: 'Daga', units: 1, emoji: '1' }] },
    },
  };
  const state = buildInitialState({ template, leaderId: 'LEADER', lootersMax: 0 });
  joinSlot(state, 'group_1~0', { userId: 'U1', username: 'u1' });

  await test('un raid activo con hilo muestra el enlace', () => {
    const embed = renderRaidEmbed({ eventId: 'AB3K9F', title: 'X', status: 'active', threadId: 'T1' }, state);
    const field = embed.data.fields.find((f) => f.name.includes('Hilo privado'));
    assert.ok(field, 'falta el campo del hilo');
    assert.match(field.value, /<#T1>/);
  });

  await test('un raid sin hilo no muestra el campo', () => {
    const embed = renderRaidEmbed({ eventId: 'AB3K9F', title: 'X', status: 'active' }, state);
    assert.ok(!embed.data.fields.some((f) => f.name.includes('Hilo privado')));
  });

  await test('un raid finalizado sigue enlazando su hilo: no se borra solo', () => {
    const embed = renderRaidEmbed({ eventId: 'AB3K9F', title: 'X', status: 'closed', threadId: 'T1' }, state);
    const field = embed.data.fields.find((f) => f.name.includes('Hilo privado'));
    assert.ok(field, 'falta el campo del hilo en el raid cerrado');
    assert.match(field.value, /<#T1>/);
  });

  console.log('\n— El borrado del hilo es manual —');

  await test('un raid cerrado con hilo ofrece asistencia y borrado', () => {
    const rows = renderRaidComponents({ eventId: 'AB3K9F', status: 'closed', threadId: 'T1' }, state);
    const ids = rows.flatMap((r) => r.components.map((c) => c.data.custom_id));
    assert.deepStrictEqual(ids, ['raid:att:AB3K9F', 'raid:thdel:AB3K9F']);
  });

  await test('un raid cerrado sin hilo solo ofrece la asistencia', () => {
    const rows = renderRaidComponents({ eventId: 'AB3K9F', status: 'closed', threadId: null }, state);
    const ids = rows.flatMap((r) => r.components.map((c) => c.data.custom_id));
    assert.deepStrictEqual(ids, ['raid:att:AB3K9F']);
  });

  await test('un raid cerrado sin participantes pero con hilo deja borrarlo', () => {
    const vacio = buildInitialState({ template, leaderId: 'LEADER', lootersMax: 0 });
    const rows = renderRaidComponents({ eventId: 'AB3K9F', status: 'closed', threadId: 'T1' }, vacio);
    const ids = rows.flatMap((r) => r.components.map((c) => c.data.custom_id));
    assert.deepStrictEqual(ids, ['raid:thdel:AB3K9F']);
  });

  await test('el panel de asistencia ofrece el borrado solo si queda hilo', () => {
    assert.ok(renderThreadDeleteRow({ eventId: 'AB3K9F', threadId: 'T1' }));
    assert.strictEqual(renderThreadDeleteRow({ eventId: 'AB3K9F', threadId: null }), null);
  });

  await test('cerrar un raid en BD ya no suelta el threadId', () => {
    const fuente = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'src', 'services', 'raidEventService.js'),
      'utf8'
    );
    assert.ok(!/threadId:\s*null/.test(fuente), 'closeRaidEvent no debe borrar la referencia al hilo');
  });

  console.log('\n— El flujo de borrado a petición —');

  // Runtime completo (registro + mensaje falso) para ejercitar los handlers
  // reales: es la única forma de comprobar que finalizar NO borra y que el
  // botón sí lo hace.
  function montarRuntime(thread, { status = 'closed' } = {}) {
    const raid = {
      ...fakeRaid({ status, threadId: thread ? thread.id : null }),
      stateVersion: 2,
      groups: [],
      absentUserIds: [],
      save: async () => {},
    };
    const message = { id: 'M1', edit: async (payload) => ({ id: 'M1', edit: message.edit, payload }) };
    raidRegistry.register({ raidId: raid.eventId, raid, message, templateName: 't' });
    return raid;
  }

  function fakeInteraction({ customId, userId = 'LEADER', guild }) {
    const log = { updates: [], replies: [] };
    return {
      log,
      customId,
      guild,
      deferred: false,
      replied: false,
      message: { id: 'M1' },
      user: { id: userId, username: userId },
      member: { id: userId, permissions: { has: () => false } },
      update: async (payload) => { log.updates.push(payload); },
      reply: async (payload) => { log.replies.push(payload); },
      followUp: async (payload) => { log.replies.push(payload); },
    };
  }

  const idsDe = (payload) =>
    (payload.components || []).flatMap((r) => r.components.map((c) => c.data.custom_id));

  await test('finalizar un raid ya no borra el hilo', async () => {
    const thread = fakeThread();
    const raid = montarRuntime(thread, { status: 'active' });
    const result = await finishRaid(raid.eventId, 'LEADER', fakeGuild(thread));
    assert.ok(result.ok);
    assert.strictEqual(thread.log.deleted, false, 'el hilo no debe borrarse al finalizar');
    assert.strictEqual(raid.threadId, 'T1', 'el raid debe seguir apuntando al hilo');
    raidRegistry.unregister(raid.eventId);
  });

  await test('el botón Eliminar hilo solo pide confirmación', async () => {
    const thread = fakeThread();
    const raid = montarRuntime(thread);
    const it = fakeInteraction({ customId: `raid:thdel:${raid.eventId}`, guild: fakeGuild(thread) });
    assert.strictEqual(await routeRaidInteraction(it), true);
    assert.strictEqual(thread.log.deleted, false);
    assert.deepStrictEqual(idsDe(it.log.replies[0]), [
      `raid:thdelok:${raid.eventId}`,
      `raid:thdelno:${raid.eventId}`,
    ]);
    raidRegistry.unregister(raid.eventId);
  });

  await test('confirmar borra el hilo y suelta la referencia', async () => {
    const thread = fakeThread();
    const raid = montarRuntime(thread);
    const it = fakeInteraction({ customId: `raid:thdelok:${raid.eventId}`, guild: fakeGuild(thread) });
    await routeRaidInteraction(it);
    assert.strictEqual(thread.log.deleted, true);
    assert.strictEqual(raid.threadId, null);
    assert.match(it.log.updates[0].content, /borrado/i);
    raidRegistry.unregister(raid.eventId);
  });

  await test('cancelar deja el hilo intacto', async () => {
    const thread = fakeThread();
    const raid = montarRuntime(thread);
    const it = fakeInteraction({ customId: `raid:thdelno:${raid.eventId}`, guild: fakeGuild(thread) });
    await routeRaidInteraction(it);
    assert.strictEqual(thread.log.deleted, false);
    assert.strictEqual(raid.threadId, 'T1');
    raidRegistry.unregister(raid.eventId);
  });

  await test('quien no gestiona el raid no puede borrar el hilo', async () => {
    const thread = fakeThread();
    const raid = montarRuntime(thread);
    const it = fakeInteraction({ customId: `raid:thdelok:${raid.eventId}`, userId: 'U1', guild: fakeGuild(thread) });
    await routeRaidInteraction(it);
    assert.strictEqual(thread.log.deleted, false);
    assert.strictEqual(raid.threadId, 'T1');
    raidRegistry.unregister(raid.eventId);
  });

  await test('un raid de otro servidor no se puede tocar', async () => {
    const thread = fakeThread();
    const raid = montarRuntime(thread);
    const it = fakeInteraction({
      customId: `raid:thdelok:${raid.eventId}`,
      guild: fakeGuild(thread, { id: 'OTRO-SERVIDOR' }),
    });
    await routeRaidInteraction(it);
    assert.strictEqual(thread.log.deleted, false, 'no se puede borrar el hilo de otro gremio');
    assert.strictEqual(raid.threadId, 'T1');
    raidRegistry.unregister(raid.eventId);
  });

  await test('un borrado que falla conserva la referencia al hilo', async () => {
    const thread = fakeThread();
    thread.delete = async () => { throw Object.assign(new Error('nope'), { code: 50013 }); };
    const raid = montarRuntime(thread);
    const it = fakeInteraction({ customId: `raid:thdelok:${raid.eventId}`, guild: fakeGuild(thread) });
    await routeRaidInteraction(it);
    assert.strictEqual(raid.threadId, 'T1', 'sin borrado no se puede soltar el id');
    assert.match(it.log.updates[0].content, /No se pudo borrar/);
    raidRegistry.unregister(raid.eventId);
  });

  console.log(`\n${passed} comprobaciones OK\n`);
}

main();
