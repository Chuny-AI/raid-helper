/**
 * Prueba de humo de la carga automática de armas hacia Mongo.
 *
 * Solo ejercita buildWeaponSeedOps, que es pura, así que no requiere BD ni bot.
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

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

const { buildWeaponSeedOps, loadKnownEmojiIds } = require('../src/services/weaponService');
const load = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, '../src/weapons', file), 'utf8'));

const catalogoMini = {
  weapons: {
    sword: {
      displayName: 'Espadas',
      defaultEmoji: '111',
      data: [
        { name: 'Espada', units: 1, image: '', emoji: '111' },
        { name: 'Claymore', units: 2, image: 'https://x/y.png', emoji: '222' },
      ],
    },
  },
};

console.log('\n— Solo inserta lo que falta —');

test('una operación por arma, upsert por emojiId', () => {
  const { ops, emojiIds } = buildWeaponSeedOps(catalogoMini);
  assert.strictEqual(ops.length, 2);
  assert.deepStrictEqual(emojiIds, ['111', '222']);
  for (const op of ops) {
    assert.strictEqual(op.updateOne.upsert, true);
    assert.ok(op.updateOne.filter.emojiId);
  }
});

test('el update solo lleva $setOnInsert: un arma existente no se toca', () => {
  const { ops } = buildWeaponSeedOps(catalogoMini);
  for (const op of ops) {
    const claves = Object.keys(op.updateOne.update);
    assert.deepStrictEqual(claves, ['$setOnInsert'], `no debe haber $set: ${claves.join(', ')}`);
  }
});

test('el documento insertado trae todos los campos del catálogo', () => {
  const { ops } = buildWeaponSeedOps(catalogoMini);
  const doc = ops[1].updateOne.update.$setOnInsert;
  assert.strictEqual(doc.emojiId, '222');
  assert.strictEqual(doc.name, 'Claymore');
  assert.strictEqual(doc.category, 'sword');
  assert.strictEqual(doc.categoryDisplayName, 'Espadas');
  assert.strictEqual(doc.categoryDefaultEmoji, '111');
  assert.strictEqual(doc.image, 'https://x/y.png');
  assert.strictEqual(doc.sendBuildToPrivate, true);
  assert.strictEqual(doc.isActive, true);
});

console.log('\n— Validación del catálogo —');

test('rechaza un emojiId repetido', () => {
  assert.throws(
    () =>
      buildWeaponSeedOps({
        weapons: { a: { displayName: 'A', defaultEmoji: '1', data: [
          { name: 'x', emoji: '1' }, { name: 'y', emoji: '1' } ] } },
      }),
    /repetido/,
  );
});

test('rechaza un arma sin emoji o sin nombre', () => {
  const base = (data) => ({ weapons: { a: { displayName: 'A', defaultEmoji: '1', data } } });
  assert.throws(() => buildWeaponSeedOps(base([{ name: 'x' }])), /incompleta/);
  assert.throws(() => buildWeaponSeedOps(base([{ emoji: '1' }])), /incompleta/);
});

test('rechaza una categoría sin displayName o defaultEmoji', () => {
  assert.throws(() => buildWeaponSeedOps({ weapons: { a: { data: [] } } }), /displayName/);
});

test('rechaza un catálogo vacío', () => {
  assert.throws(() => buildWeaponSeedOps({ weapons: {} }), /vacío/);
});

console.log('\n— Catálogos reales —');

for (const file of ['weapons.json', 'weapons_dev.json']) {
  test(`${file}: genera 136 inserciones con IDs únicos`, () => {
    const { ops, emojiIds } = buildWeaponSeedOps(load(file));
    assert.strictEqual(ops.length, 136);
    assert.strictEqual(new Set(emojiIds).size, 136);
  });
}

test('los dos catálogos no comparten ningún emojiId', () => {
  const prod = buildWeaponSeedOps(load('weapons.json')).emojiIds;
  const dev = new Set(buildWeaponSeedOps(load('weapons_dev.json')).emojiIds);
  const compartidos = prod.filter((id) => dev.has(id));
  assert.deepStrictEqual(compartidos, []);
});

console.log('\n— Armas obsoletas —');

// La desactivación de armas que ya no están en el catálogo se mide contra la
// unión de TODOS los catálogos. Como los dos no comparten ningún emojiId (test
// de arriba), medirla solo contra el del entorno actual desactivaría en cada
// arranque todas las armas del otro entorno si comparten base de datos.
test('la lista de emojiIds conocidos une prod y dev', () => {
  const conocidos = loadKnownEmojiIds();
  const prod = buildWeaponSeedOps(load('weapons.json')).emojiIds;
  const dev = buildWeaponSeedOps(load('weapons_dev.json')).emojiIds;

  assert.ok(conocidos instanceof Set);
  assert.strictEqual(conocidos.size, prod.length + dev.length);
  for (const id of [...prod, ...dev]) {
    assert.ok(conocidos.has(id), `falta ${id} entre los conocidos`);
  }
});

test('un emojiId que no está en ningún catálogo se considera obsoleto', () => {
  assert.strictEqual(loadKnownEmojiIds().has('000000000000000000'), false);
});

console.log(`\n✅ ${passed} comprobaciones OK\n`);
