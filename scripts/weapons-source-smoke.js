/** Prueba de humo del catálogo de armas por entorno. No requiere BD ni bot. */
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

const WEAPONS_DIR = path.join(__dirname, '../src/weapons');
const load = (file) => JSON.parse(fs.readFileSync(path.join(WEAPONS_DIR, file), 'utf8'));

const withGuild = (value, fn) => {
  const previous = process.env.GUILD_ID;
  if (value === undefined) delete process.env.GUILD_ID;
  else process.env.GUILD_ID = value;
  try {
    delete require.cache[require.resolve('../src/weapons/weaponsSource')];
    return fn(require('../src/weapons/weaponsSource'));
  } finally {
    if (previous === undefined) delete process.env.GUILD_ID;
    else process.env.GUILD_ID = previous;
    delete require.cache[require.resolve('../src/weapons/weaponsSource')];
  }
};

const ids = (data) => Object.values(data.weapons).flatMap((g) => [g.defaultEmoji, ...g.data.map((d) => d.emoji)]);

console.log('\n— Selección por entorno —');
// El entorno lo decide GUILD_ID: sin él es producción, con él es desarrollo.
for (const guild of [undefined, '', '   ']) {
  test(`GUILD_ID=${String(JSON.stringify(guild))} usa weapons.json`, () => {
    withGuild(guild, (s) => assert.strictEqual(path.basename(s.getWeaponsPath()), 'weapons.json'));
  });
}
for (const guild of ['1534280409582403807', '123']) {
  test(`GUILD_ID=${JSON.stringify(guild)} usa weapons_dev.json`, () => {
    withGuild(guild, (s) => assert.strictEqual(path.basename(s.getWeaponsPath()), 'weapons_dev.json'));
  });
}
test('IS_PROD ya no influye en la selección', () => {
  const previo = process.env.IS_PROD;
  process.env.IS_PROD = 'TRUE';
  try {
    withGuild('1534280409582403807', (s) => assert.strictEqual(path.basename(s.getWeaponsPath()), 'weapons_dev.json'));
  } finally {
    if (previo === undefined) delete process.env.IS_PROD;
    else process.env.IS_PROD = previo;
  }
});

console.log('\n— Integridad de cada catálogo —');
for (const file of ['weapons.json', 'weapons_dev.json']) {
  const data = load(file);
  test(`${file}: mismos grupos y armas que el otro catálogo`, () => {
    const other = load(file === 'weapons.json' ? 'weapons_dev.json' : 'weapons.json');
    assert.deepStrictEqual(Object.keys(data.weapons), Object.keys(other.weapons));
    for (const [key, group] of Object.entries(data.weapons)) {
      assert.deepStrictEqual(
        group.data.map((d) => d.name),
        other.weapons[key].data.map((d) => d.name),
        `el grupo ${key} no coincide`,
      );
    }
  });
  test(`${file}: cada arma tiene un emoji propio`, () => {
    const all = Object.values(data.weapons).flatMap((g) => g.data.map((d) => String(d.emoji)));
    const dup = [...new Set(all.filter((id, i) => all.indexOf(id) !== i))];
    assert.deepStrictEqual(dup, [], `IDs duplicados en ${file}`);
  });
  test(`${file}: todo emoji es un ID de Discord`, () => {
    for (const id of ids(data)) assert.match(String(id), /^\d{17,20}$/);
  });
  test(`${file}: el defaultEmoji del grupo pertenece a un arma del grupo`, () => {
    for (const [key, group] of Object.entries(data.weapons)) {
      const own = group.data.map((d) => String(d.emoji));
      assert.ok(own.includes(String(group.defaultEmoji)), `${key} apunta fuera del grupo`);
    }
  });
}

console.log('\n— Separación entre entornos —');
test('Ningún ID de desarrollo se coló en producción', () => {
  const prodIds = new Set(ids(load('weapons.json')).map(String));
  const devIds = new Set(ids(load('weapons_dev.json')).map(String));
  const shared = [...devIds].filter((id) => prodIds.has(id));
  assert.deepStrictEqual(shared, [], `IDs compartidos entre entornos: ${shared.join(', ')}`);
});
test('Sin weapons_dev.json, desarrollo cae a producción sin romper', () => {
  const devPath = path.join(WEAPONS_DIR, 'weapons_dev.json');
  const backup = fs.readFileSync(devPath);
  fs.rmSync(devPath);
  try {
    withGuild('1534280409582403807', (s) => assert.strictEqual(path.basename(s.getWeaponsPath()), 'weapons.json'));
  } finally {
    fs.writeFileSync(devPath, backup);
  }
});

console.log(`\n✅ ${passed} comprobaciones OK\n`);
