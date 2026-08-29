/**
 * Prueba de humo de la resiliencia del bot.
 *
 * Cubre lo que antes tumbaba el proceso: un manejador que lanza, una promesa
 * rechazada que nadie captura y un rol que ya no existe al publicar el raid.
 * No requiere BD ni conexión a Discord.
 */
const assert = require('node:assert');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${error.message}`);
    process.exitCode = 1;
  }
}

async function testAsync(name, fn) {
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

const { resolveMentionableRoles, safeInteractionUpdate } = require('../src/commands/utility/raid');
const { installProcessGuards } = require('../src/utils/processGuards');

/** Guild falso con los roles indicados en caché. */
const fakeGuild = (ids) => ({
  roles: { cache: new Map(ids.map((id) => [id, { id, name: `rol-${id}` }])) },
});

async function main() {
  console.log('\n— Roles que ya no existen —');

  test('separa los roles vivos de los borrados', () => {
    const { valid, missing } = resolveMentionableRoles(fakeGuild(['1', '3']), ['1', '2', '3']);
    assert.deepStrictEqual(valid, ['1', '3']);
    assert.deepStrictEqual(missing, ['2']);
  });

  test('sin roles devuelve dos listas vacías', () => {
    const { valid, missing } = resolveMentionableRoles(fakeGuild([]), []);
    assert.deepStrictEqual(valid, []);
    assert.deepStrictEqual(missing, []);
  });

  test('un guild sin caché de roles no lanza', () => {
    const { valid, missing } = resolveMentionableRoles(undefined, ['1']);
    assert.deepStrictEqual(valid, []);
    assert.deepStrictEqual(missing, ['1']);
  });

  test('una lista nula no lanza', () => {
    const { valid, missing } = resolveMentionableRoles(fakeGuild(['1']), null);
    assert.deepStrictEqual(valid, []);
    assert.deepStrictEqual(missing, []);
  });

  console.log('\n— Actualizar el mensaje del líder nunca propaga el fallo —');

  await testAsync('devuelve true cuando la actualización funciona', async () => {
    let recibido = null;
    const ok = await safeInteractionUpdate({ update: async (p) => { recibido = p; } }, { content: 'x' });
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(recibido, { content: 'x' });
  });

  await testAsync('token caducado (10062) devuelve false en vez de lanzar', async () => {
    const error = Object.assign(new Error('Unknown interaction'), { code: 10062 });
    const ok = await safeInteractionUpdate({ update: async () => { throw error; } }, { content: 'x' });
    assert.strictEqual(ok, false);
  });

  await testAsync('interacción ya respondida (40060) devuelve false en vez de lanzar', async () => {
    const error = Object.assign(new Error('Already acknowledged'), { code: 40060 });
    const ok = await safeInteractionUpdate({ update: async () => { throw error; } }, { content: 'x' });
    assert.strictEqual(ok, false);
  });

  console.log('\n— El proceso sobrevive a lo que antes lo mataba —');

  installProcessGuards();

  test('installProcessGuards registra los dos guardas', () => {
    assert.ok(process.listenerCount('unhandledRejection') > 0, 'falta unhandledRejection');
    assert.ok(process.listenerCount('uncaughtException') > 0, 'falta uncaughtException');
  });

  test('llamarlo dos veces no duplica los listeners', () => {
    const antes = process.listenerCount('unhandledRejection');
    installProcessGuards();
    assert.strictEqual(process.listenerCount('unhandledRejection'), antes);
  });

  await testAsync('una promesa rechazada sin capturar no termina el proceso', async () => {
    // Sin el guarda instalado arriba, esto mataría al bot con exit code 1.
    Promise.reject(new Error('fallo simulado al crear un raid'));
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(true, 'seguimos vivos');
  });

  const guardsMock = { __listeners: {}, on(evt, fn) { this.__listeners[evt] = fn; } };
  installProcessGuards(guardsMock);

  test('el cliente de Discord queda enganchado a error, shardError e invalidated', () => {
    for (const evt of ['error', 'shardError', 'shardDisconnect', 'invalidated']) {
      assert.ok(typeof guardsMock.__listeners[evt] === 'function', `falta el listener ${evt}`);
    }
  });

  console.log(`\n${passed} comprobaciones OK\n`);
}

main();
