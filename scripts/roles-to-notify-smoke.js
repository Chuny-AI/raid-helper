#!/usr/bin/env node
/**
 * Smoke test del parseo del campo único `roles_to_notify` de `/raid create`.
 *
 * Sustituye a las antiguas opciones role_to_notify_1/_2/_3, así que aquí se
 * cubre que un mismo campo admita menciones, IDs y nombres mezclados.
 *
 * Uso: node scripts/roles-to-notify-smoke.js
 */

const assert = require('node:assert');

const {
  MAX_ROLES_TO_NOTIFY,
  parseRolesToNotify,
  buildRolesAutocompleteChoices,
} = require('../src/utils/roleMentions');

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.error(`  ❌ ${name}\n     ${error.stack?.split('\n').slice(0, 3).join('\n     ')}`);
    process.exitCode = 1;
  }
};

/** Construye un guild falso con el mismo API que se usa en producción. */
const makeGuild = (roles) => {
  const map = new Map(roles.map((r) => [r.id, r]));
  return {
    id: '100000000000000000',
    roles: {
      cache: {
        get: (id) => map.get(id) || null,
        values: () => map.values(),
        find: (fn) => [...map.values()].find(fn) || null,
        filter: (fn) => {
          const kept = [...map.values()].filter(fn);
          return { size: kept.length, first: () => kept[0] };
        },
      },
    },
  };
};

const guild = makeGuild([
  { id: '100000000000000000', name: '@everyone' },
  { id: '200000000000000001', name: 'Tank' },
  { id: '200000000000000002', name: 'Healer' },
  { id: '200000000000000003', name: 'Raid Leader' },
  { id: '200000000000000004', name: 'DPS Melee' },
  { id: '200000000000000005', name: 'DPS Ranged' },
]);

console.log('\n── Parseo de roles');

test('Campo vacío no produce roles', () => {
  assert.deepStrictEqual(parseRolesToNotify('', guild).roleIds, []);
  assert.deepStrictEqual(parseRolesToNotify(null, guild).roleIds, []);
  assert.deepStrictEqual(parseRolesToNotify('   ', guild).roleIds, []);
});

test('Menciones literales', () => {
  const r = parseRolesToNotify('<@&200000000000000001> <@&200000000000000002>', guild);
  assert.deepStrictEqual(r.roleIds, ['200000000000000001', '200000000000000002']);
  assert.deepStrictEqual(r.unresolved, []);
});

test('IDs sueltos separados por espacio', () => {
  const r = parseRolesToNotify('200000000000000001 200000000000000002', guild);
  assert.deepStrictEqual(r.roleIds, ['200000000000000001', '200000000000000002']);
});

test('Nombres separados por coma', () => {
  const r = parseRolesToNotify('Tank, Healer', guild);
  assert.deepStrictEqual(r.roleIds, ['200000000000000001', '200000000000000002']);
});

test('Nombre con espacios requiere coma como separador', () => {
  const r = parseRolesToNotify('Raid Leader, Tank', guild);
  assert.deepStrictEqual(r.roleIds, ['200000000000000003', '200000000000000001']);
});

test('Mezcla de mención, ID y nombre en el mismo campo', () => {
  const r = parseRolesToNotify('<@&200000000000000003>, 200000000000000001, Healer', guild);
  assert.deepStrictEqual(r.roleIds, [
    '200000000000000003',
    '200000000000000001',
    '200000000000000002',
  ]);
  assert.deepStrictEqual(r.unresolved, []);
});

test('Se admite más de 3 roles (el límite viejo)', () => {
  const r = parseRolesToNotify('Tank, Healer, Raid Leader, DPS Melee, DPS Ranged', guild);
  assert.strictEqual(r.roleIds.length, 5);
});

test('El prefijo @ y las comillas se ignoran', () => {
  const r = parseRolesToNotify('@Tank, "Raid Leader"', guild);
  assert.deepStrictEqual(r.roleIds, ['200000000000000001', '200000000000000003']);
});

test('Los duplicados se colapsan', () => {
  const r = parseRolesToNotify('Tank, <@&200000000000000001>, 200000000000000001', guild);
  assert.deepStrictEqual(r.roleIds, ['200000000000000001']);
});

test('El nombre no distingue mayúsculas', () => {
  assert.deepStrictEqual(parseRolesToNotify('tANk', guild).roleIds, ['200000000000000001']);
});

test('Coincidencia parcial única resuelve', () => {
  assert.deepStrictEqual(parseRolesToNotify('Heal', guild).roleIds, ['200000000000000002']);
});

test('Coincidencia parcial ambigua se reporta sin resolver', () => {
  const r = parseRolesToNotify('DPS', guild);
  assert.deepStrictEqual(r.roleIds, []);
  assert.deepStrictEqual(r.unresolved, ['DPS']);
});

test('Rol inexistente se reporta, no se ignora en silencio', () => {
  const r = parseRolesToNotify('Tank, NoExiste', guild);
  assert.deepStrictEqual(r.roleIds, ['200000000000000001']);
  assert.deepStrictEqual(r.unresolved, ['NoExiste']);
});

test('Mención a un rol borrado se reporta sin resolver', () => {
  const r = parseRolesToNotify('<@&999999999999999999>', guild);
  assert.deepStrictEqual(r.roleIds, []);
  assert.deepStrictEqual(r.unresolved, ['<@&999999999999999999>']);
});

console.log('\n── @everyone');

test('@everyone por su ID (el del servidor) se rechaza', () => {
  const r = parseRolesToNotify('100000000000000000', guild);
  assert.deepStrictEqual(r.roleIds, []);
  assert.strictEqual(r.blockedEveryone, true);
});

test('@everyone por mención se rechaza', () => {
  const r = parseRolesToNotify('<@&100000000000000000>', guild);
  assert.deepStrictEqual(r.roleIds, []);
  assert.strictEqual(r.blockedEveryone, true);
});

test('La palabra "everyone" casa parcialmente con el rol y también se rechaza', () => {
  const r = parseRolesToNotify('everyone', guild);
  assert.deepStrictEqual(r.roleIds, []);
  assert.strictEqual(r.blockedEveryone, true);
});

test('@everyone no arrastra a los roles válidos del mismo campo', () => {
  const r = parseRolesToNotify('Tank, @everyone, Healer', guild);
  assert.deepStrictEqual(r.roleIds, ['200000000000000001', '200000000000000002']);
  assert.strictEqual(r.blockedEveryone, true);
});

test('Sin @everyone la bandera queda en false', () => {
  assert.strictEqual(parseRolesToNotify('Tank', guild).blockedEveryone, false);
  assert.strictEqual(parseRolesToNotify('', guild).blockedEveryone, false);
});

console.log('\n── Límite de roles');

test('Se marca cuando se supera el máximo de roles', () => {
  const many = Array.from({ length: MAX_ROLES_TO_NOTIFY + 5 }, (_, i) => ({
    id: '3000000000000000' + String(i).padStart(2, '0'),
    name: `Rol${i}`,
  }));
  const bigGuild = makeGuild(many);
  const r = parseRolesToNotify(many.map((role) => role.id).join(' '), bigGuild);
  assert.strictEqual(r.roleIds.length, MAX_ROLES_TO_NOTIFY);
  assert.strictEqual(r.exceededLimit, true);
});

console.log('\n── Autocompletado');

test('Sin texto sugiere los roles del servidor menos @everyone', () => {
  const choices = buildRolesAutocompleteChoices('', guild);
  assert.ok(!choices.some((c) => c.value.includes('@everyone')));
  assert.strictEqual(choices.length, 5);
});

test('Filtra por el texto escrito', () => {
  const choices = buildRolesAutocompleteChoices('hea', guild);
  assert.deepStrictEqual(choices.map((c) => c.value), ['Healer']);
});

test('Acumula sobre lo ya escrito tras la coma', () => {
  const choices = buildRolesAutocompleteChoices('Tank, hea', guild);
  assert.deepStrictEqual(choices.map((c) => c.value), ['Tank, Healer']);
});

test('No vuelve a sugerir un rol ya elegido', () => {
  const choices = buildRolesAutocompleteChoices('Tank, ', guild);
  assert.ok(!choices.some((c) => c.value.endsWith('Tank')));
});

test('Nunca supera el límite de 25 opciones de Discord', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    id: '3000000000000000' + String(i).padStart(2, '0'),
    name: `Rol${i}`,
  }));
  assert.strictEqual(buildRolesAutocompleteChoices('', makeGuild(many)).length, 25);
});

test('Descarta sugerencias que superen los 100 caracteres de valor', () => {
  const longGuild = makeGuild([{ id: '400000000000000001', name: 'R'.repeat(90) }]);
  const choices = buildRolesAutocompleteChoices(`${'A'.repeat(50)}, `, longGuild);
  assert.deepStrictEqual(choices, []);
});

console.log(`\n${process.exitCode ? '❌ Fallos detectados' : `✅ ${passed} comprobaciones OK`}\n`);
