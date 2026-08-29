/**
 * Prueba de humo del hilo privado del raid (src/utils/raidThread.js).
 *
 * Cubre quién tiene derecho a estar dentro, el diff de membresía, los fallos de
 * permisos y el borrado al finalizar. No requiere BD ni conexión a Discord: la
 * API se sustituye por dobles que registran las llamadas.
 */
const assert = require('node:assert');
const { PermissionFlagsBits } = require('discord.js');

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
const { renderRaidEmbed } = require('../src/utils/raidRender');

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

function fakeGuild(thread) {
  return {
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

  console.log('\n— Borrado al finalizar —');

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

  await test('un raid finalizado no enlaza un hilo que ya se borró', () => {
    const embed = renderRaidEmbed({ eventId: 'AB3K9F', title: 'X', status: 'closed', threadId: 'T1' }, state);
    assert.ok(!embed.data.fields.some((f) => f.name.includes('Hilo privado')));
  });

  console.log(`\n${passed} comprobaciones OK\n`);
}

main();
