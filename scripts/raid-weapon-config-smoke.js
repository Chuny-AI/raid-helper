#!/usr/bin/env node
/**
 * Smoke test de la configuración de armas por raid.
 *
 * Comprueba los cupos resultantes tanto en el modelo de overrides como en el estado
 * que realmente se publica (`raidState.buildInitialState`: groups[].maxPlayers y
 * slots[].units), que es la fuente de verdad del raid una vez creado.
 *
 * Escenarios cubiertos:
 *   - Grupo con máximo 6 y dos armas de 6 cupos → deshabilitar una arma.
 *   - Grupo con máximo 3 y armas de 6 → el cupo del grupo manda.
 *   - Grupo con tres entradas repetidas del mismo arma → deshabilitar una deja dos.
 *
 * Uso: node scripts/raid-weapon-config-smoke.js
 */

const assert = require('node:assert');

const cfg = require('../src/utils/raidWeaponConfig');
const raidState = require('../src/services/raidState');
const ui = require('../src/lib/raid/raid-weapon-config-ui');

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.error(`  ❌ ${name}\n     ${error.message}`);
    process.exitCode = 1;
  }
};

const weapon = (name, units, emoji = '1286453830292344942') => ({ name, units, emoji, image: '', url: '' });

const template = {
  title: 'Raid de prueba',
  description: 'Template para el smoke test',
  image: '',
  weapons: {
    // Grupo con máximo 6 y dos armas de 6 cupos cada una
    group_1: {
      displayName: 'DPS',
      defaultEmoji: '1286453830292344942',
      max_players: 6,
      data: [weapon('Falce de cristal', 6), weapon('Bastón ártico', 6)],
    },
    // Grupo con máximo 3 aunque sus armas sumen 12
    group_2: {
      displayName: 'Tanques',
      defaultEmoji: '1286453824827031552',
      max_players: 3,
      data: [weapon('Martillo', 6), weapon('Maza pesada', 6)],
    },
    // Tres entradas repetidas del mismo arma, 1 cupo cada una
    group_3: {
      displayName: 'Falces',
      defaultEmoji: '1286454706578657382',
      max_players: 3,
      data: [weapon('Falce de cristal', 1), weapon('Falce de cristal', 1), weapon('Falce de cristal', 1)],
    },
    // Sin max_players: la capacidad es la suma de las armas
    group_4: {
      displayName: 'Healers',
      defaultEmoji: '1286453963209707572',
      data: [weapon('Santificador', 2), weapon('Bastón caído', 1)],
    },
  },
};

/** Estado publicado con una configuración dada. */
const build = (overrides) =>
  raidState.buildInitialState({ template, weaponOverrides: overrides, lootersMax: 0, leaderId: '1' });

const groupOf = (state, groupKey) => state.groups.find((g) => g.groupKey === groupKey) || null;
const slotsOf = (state, groupKey) => state.slots.filter((s) => s.groupKey === groupKey);

console.log('\n── Capacidades base (sin overrides)');

test('DPS: min(max_players 6, suma 12) = 6', () => {
  assert.strictEqual(cfg.getGroupCapacity(template, cfg.emptyOverrides(), 'group_1'), 6);
  assert.strictEqual(groupOf(build(cfg.emptyOverrides()), 'group_1').maxPlayers, 6);
});

test('Tanques: el cupo del grupo (3) manda sobre las armas (12)', () => {
  const state = build(cfg.emptyOverrides());
  assert.strictEqual(groupOf(state, 'group_2').maxPlayers, 3);
  // Ningún slot puede admitir más que el grupo
  for (const slot of slotsOf(state, 'group_2')) assert.strictEqual(slot.units, 3);
});

test('Healers sin max_players: capacidad = suma de armas (3)', () => {
  const state = build(cfg.emptyOverrides());
  assert.strictEqual(groupOf(state, 'group_4').maxPlayers, 3);
  assert.deepStrictEqual(slotsOf(state, 'group_4').map((s) => s.units), [2, 1]);
});

test('Armas repetidas: un slot por entrada, cada una con su cupo', () => {
  const state = build(cfg.emptyOverrides());
  const slots = slotsOf(state, 'group_3');
  assert.strictEqual(slots.length, 3);
  assert.deepStrictEqual(slots.map((s) => s.slotId), ['group_3~0', 'group_3~1', 'group_3~2']);
  assert.strictEqual(groupOf(state, 'group_3').maxPlayers, 3);
});

console.log('\n── Escenario: deshabilitar un arma del grupo');

test('Deshabilitar "Bastón ártico" deja DPS con cupo 6 y un solo slot', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureWeapon(overrides, 'group_1', 1).disabled = true;

  const state = build(overrides);
  assert.strictEqual(groupOf(state, 'group_1').maxPlayers, 6);
  assert.deepStrictEqual(slotsOf(state, 'group_1').map((s) => s.slotId), ['group_1~0']);
  assert.strictEqual(cfg.getWeaponLimit(template, overrides, 'group_1', 1), 0);
});

console.log('\n── Escenario: armas repetidas (Falce ×3)');

test('Deshabilitar una de las tres deja cupo 2 y dos slots', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureWeapon(overrides, 'group_3', 0).disabled = true;

  const state = build(overrides);
  assert.strictEqual(groupOf(state, 'group_3').maxPlayers, 2);
  assert.deepStrictEqual(slotsOf(state, 'group_3').map((s) => s.slotId), ['group_3~1', 'group_3~2']);
});

test('Deshabilitar las tres saca el grupo del raid', () => {
  const overrides = cfg.emptyOverrides();
  [0, 1, 2].forEach((i) => { cfg.ensureWeapon(overrides, 'group_3', i).disabled = true; });

  const state = build(overrides);
  assert.strictEqual(groupOf(state, 'group_3'), null);
  assert.strictEqual(slotsOf(state, 'group_3').length, 0);
});

console.log('\n── Escenario: cambiar cupos');

test('Bajar el cupo del grupo recorta también los slots', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureGroup(overrides, 'group_1').maxPlayers = 3;

  const state = build(overrides);
  assert.strictEqual(groupOf(state, 'group_1').maxPlayers, 3);
  // El arma declara 6 pero el grupo manda
  for (const slot of slotsOf(state, 'group_1')) assert.strictEqual(slot.units, 3);
});

test('Subir el cupo del grupo no supera la suma de las armas habilitadas', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureGroup(overrides, 'group_4').maxPlayers = 99;
  assert.strictEqual(groupOf(build(overrides), 'group_4').maxPlayers, 3);
});

test('Cambiar el cupo de un arma concreta recalcula el grupo y su slot', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureWeapon(overrides, 'group_4', 0).units = 5; // Santificador 2 → 5

  const state = build(overrides);
  assert.strictEqual(groupOf(state, 'group_4').maxPlayers, 6);
  assert.deepStrictEqual(slotsOf(state, 'group_4').map((s) => s.units), [5, 1]);
});

test('Cupo de arma por encima del grupo queda acotado por el grupo', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureGroup(overrides, 'group_4').maxPlayers = 2;
  cfg.ensureWeapon(overrides, 'group_4', 0).units = 10;

  const state = build(overrides);
  assert.strictEqual(groupOf(state, 'group_4').maxPlayers, 2);
  for (const slot of slotsOf(state, 'group_4')) assert.ok(slot.units <= 2);
});

console.log('\n── Escenario: deshabilitar grupo completo');

test('El grupo deshabilitado no se publica', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureGroup(overrides, 'group_2').disabled = true;

  const state = build(overrides);
  assert.strictEqual(groupOf(state, 'group_2'), null);
  assert.ok(!state.slots.some((s) => s.groupKey === 'group_2'));
});

test('Deshabilitar todos los grupos deja capacidad total 0', () => {
  const overrides = cfg.emptyOverrides();
  Object.keys(template.weapons).forEach((k) => { cfg.ensureGroup(overrides, k).disabled = true; });
  assert.strictEqual(cfg.getTotalCapacity(template, overrides), 0);
  assert.strictEqual(build(overrides).slots.length, 0);
});

console.log('\n── Serialización y compatibilidad');

test('toDisabledWeapons / fromDisabledWeapons son consistentes', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureGroup(overrides, 'group_2').disabled = true;
  cfg.ensureWeapon(overrides, 'group_1', 1).disabled = true;

  const legacy = cfg.toDisabledWeapons(overrides);
  assert.deepStrictEqual(legacy.sort(), ['group~group_2', 'weapon~group_1~1'].sort());

  const back = cfg.fromDisabledWeapons(legacy);
  assert.strictEqual(cfg.isGroupDisabled(back, 'group_2'), true);
  assert.strictEqual(cfg.isWeaponDisabled(back, 'group_1', 1), true);
});

test('normalizeOverrides acepta objetos serializados desde Mongo', () => {
  const raw = JSON.parse(JSON.stringify({
    groups: {
      group_1: { disabled: false, maxPlayers: 4, weapons: { 0: { disabled: false, units: 2 } } },
    },
  }));
  const overrides = cfg.normalizeOverrides(raw);
  assert.strictEqual(cfg.getGroupMaxPlayers(template, overrides, 'group_1'), 4);
  assert.strictEqual(cfg.getWeaponUnits(template, overrides, 'group_1', 0), 2);
});

test('buildInitialState sigue aceptando la lista legacy disabledWeapons', () => {
  const state = raidState.buildInitialState({
    template,
    disabledWeapons: ['group~group_2', 'weapon~group_1~1'],
    lootersMax: 0,
    leaderId: '1',
  });
  assert.strictEqual(groupOf(state, 'group_2'), null);
  assert.deepStrictEqual(slotsOf(state, 'group_1').map((s) => s.slotId), ['group_1~0']);
});

test('Un raid sin configuración se comporta igual que antes', () => {
  const sinConfig = build(null);
  const vacio = build(cfg.emptyOverrides());
  assert.deepStrictEqual(sinConfig.groups.map((g) => g.groupKey), vacio.groups.map((g) => g.groupKey));
  assert.strictEqual(sinConfig.groups.length, 4);
  assert.strictEqual(sinConfig.slots.length, 9);
});

test('Soporta grupos en formato legacy (categories) además de data', () => {
  const legacyTemplate = {
    weapons: {
      group_x: {
        displayName: 'Legacy',
        defaultEmoji: '1286453830292344942',
        max_players: 2,
        categories: [{ name: 'cat', weapons: [weapon('A', 1), weapon('B', 1)] }],
      },
    },
  };
  const overrides = cfg.emptyOverrides();
  assert.strictEqual(cfg.getGroupCapacity(legacyTemplate, overrides, 'group_x'), 2);

  cfg.ensureWeapon(overrides, 'group_x', 1).disabled = true;
  assert.strictEqual(cfg.getGroupCapacity(legacyTemplate, overrides, 'group_x'), 1);
});

console.log('\n── Panel de configuración (/raid create)');

const PENDING_ID = '1234567890123456789';

test('El panel principal lista los grupos y ofrece el selector', () => {
  const panel = ui.buildOverviewPanel(template, cfg.emptyOverrides(), PENDING_ID);
  const select = panel.components[0].components[0];
  assert.strictEqual(select.data.custom_id, `raidcfg-grp-${PENDING_ID}`);
  assert.strictEqual(select.options.length, 4);
});

test('Sin armas habilitadas, el botón de publicar queda deshabilitado', () => {
  const overrides = cfg.emptyOverrides();
  Object.keys(template.weapons).forEach((k) => { cfg.ensureGroup(overrides, k).disabled = true; });
  const panel = ui.buildOverviewPanel(template, overrides, PENDING_ID);
  const confirm = panel.components[panel.components.length - 1].components[0];
  assert.strictEqual(confirm.data.custom_id, `raid_confirm_create-${PENDING_ID}`);
  assert.strictEqual(confirm.data.disabled, true);
});

test('El panel de grupo lista TODAS las armas, incluidas las repetidas', () => {
  const panel = ui.buildGroupPanel(template, cfg.emptyOverrides(), PENDING_ID, 'group_3');
  const select = panel.components[0].components[0];
  assert.strictEqual(select.data.custom_id, `raidcfg-wpn-${PENDING_ID}-group_3`);
  assert.strictEqual(select.options.length, 3, 'las 3 entradas repetidas son configurables por separado');
  assert.deepStrictEqual(select.options.map((o) => o.data.value), ['0', '1', '2']);
});

test('Los customId del panel se parsean de vuelta correctamente', () => {
  const cases = [
    [`raidcfg-home-${PENDING_ID}`, { action: 'home', groupKey: null }],
    [`raidcfg-gtoggle-${PENDING_ID}-group_3`, { action: 'gtoggle', groupKey: 'group_3' }],
    [`raidcfg-mwunits-${PENDING_ID}-group_3-2`, { action: 'mwunits', groupKey: 'group_3', weaponIndex: 2 }],
  ];
  for (const [customId, expected] of cases) {
    const parsed = ui.parseId(customId);
    assert.ok(parsed, `no se pudo parsear ${customId}`);
    assert.strictEqual(parsed.pendingId, PENDING_ID);
    for (const [key, value] of Object.entries(expected)) {
      assert.strictEqual(parsed[key], value, `${customId} → ${key}`);
    }
  }
  assert.strictEqual(ui.parseId('template_edit_weapons_123'), null);
});

test('Ningún customId del panel colisiona con otro enrutado', () => {
  const ids = [];
  const collect = (panel) => panel.components.forEach((row) =>
    row.components.forEach((c) => ids.push(c.data.custom_id)));

  collect(ui.buildOverviewPanel(template, cfg.emptyOverrides(), PENDING_ID));
  collect(ui.buildGroupPanel(template, cfg.emptyOverrides(), PENDING_ID, 'group_3'));
  collect(ui.buildWeaponPanel(template, cfg.emptyOverrides(), PENDING_ID, 'group_3', 1));
  ids.push(ui.buildGroupMaxModal(template, cfg.emptyOverrides(), PENDING_ID, 'group_3').data.custom_id);
  ids.push(ui.buildWeaponUnitsModal(template, cfg.emptyOverrides(), PENDING_ID, 'group_3', 1).data.custom_id);

  // Prefijos que events.js/raidInteractions redirigen a otros manejadores
  const otherRoutes = [
    'raid:', 'weapons-', 'raid_waitlist-', 'raid_waitlist_weapons-', 'raid_cannotgo-', 'raid_looter-',
    'group_', 'template_', 'edit_', 'back_to_group_', 'back_to_weapons_',
    'select_weapon_', 'modify_weapon_select_', 'modify_units_', 'add_url_',
    'delete_weapon_', 'confirm_delete_weapon_', 'cancel_delete_weapon_',
    'category_select_for_group_', 'weapon_select_for_group_',
    'remove_weapons_select_', 'direct_weapon_select_', 'notify_attending-',
  ];

  for (const id of ids) {
    assert.ok(id.length <= 100, `customId demasiado largo: ${id}`);
    assert.ok(!id.includes('_group_'), `"${id}" sería capturado por el enrutado de /template`);
    for (const route of otherRoutes) {
      assert.ok(!id.startsWith(route), `"${id}" empieza por "${route}" (ruta de otro manejador)`);
    }
    assert.ok(
      id.startsWith('raidcfg-') || id.startsWith('raid_confirm_create-'),
      `"${id}" no usa un prefijo de raid conocido`
    );
  }
});

test('Los modales llevan el índice del arma para distinguir repetidas', () => {
  const modal = ui.buildWeaponUnitsModal(template, cfg.emptyOverrides(), PENDING_ID, 'group_3', 2);
  assert.strictEqual(modal.data.custom_id, `raidcfg-mwunits-${PENDING_ID}-group_3-2`);
  assert.ok(modal.data.title.length <= 45);
  assert.strictEqual(modal.components[0].components[0].data.value, '1');
});


// ─────────────────────────────────────────────────────────────────────────────
// De la configuración a la inscripción real (raidState.joinSlot)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Inscripción con la configuración aplicada');

const join = (state, userId, slotId) =>
  raidState.joinSlot(state, slotId, { userId, username: `u${userId}` });

test('El cupo del grupo corta antes que el del arma', () => {
  // Tanques: grupo máx 3, armas de 6 → sólo entran 3 jugadores en total
  const state = build(cfg.emptyOverrides());
  const results = [1, 2, 3, 4].map((i) => join(state, String(i), 'group_2~0'));
  assert.deepStrictEqual(results.slice(0, 3).map((r) => r.ok), [true, true, true]);
  assert.strictEqual(results[3].ok, false, 'el cuarto jugador debe ser rechazado');
});

test('Un arma con cupo reducido se llena antes que el grupo', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureWeapon(overrides, 'group_1', 0).units = 1; // Falce 6 → 1
  const state = build(overrides);

  assert.strictEqual(join(state, '1', 'group_1~0').ok, true);
  assert.strictEqual(join(state, '2', 'group_1~0').ok, false, 'el arma ya está llena');
  // Pero el grupo sigue teniendo hueco en la otra arma
  assert.strictEqual(join(state, '2', 'group_1~1').ok, true);
});

test('No se puede entrar a un arma deshabilitada: su slot no existe', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureWeapon(overrides, 'group_1', 1).disabled = true;
  const state = build(overrides);

  assert.strictEqual(raidState.findSlot(state, 'group_1~1'), null);
  assert.strictEqual(join(state, '1', 'group_1~1').ok, false);
});

test('Armas repetidas: cada entrada admite a su propio jugador', () => {
  const state = build(cfg.emptyOverrides());
  assert.strictEqual(join(state, '1', 'group_3~0').ok, true);
  assert.strictEqual(join(state, '2', 'group_3~1').ok, true);
  assert.strictEqual(join(state, '3', 'group_3~2').ok, true);
  // El grupo (máx 3) ya está lleno
  assert.strictEqual(raidState.groupOccupancy(state, 'group_3').current, 3);
});

test('Deshabilitar una falce reduce a 2 los jugadores posibles', () => {
  const overrides = cfg.emptyOverrides();
  cfg.ensureWeapon(overrides, 'group_3', 0).disabled = true;
  const state = build(overrides);

  assert.strictEqual(join(state, '1', 'group_3~1').ok, true);
  assert.strictEqual(join(state, '2', 'group_3~2').ok, true);
  assert.strictEqual(raidState.availableSlots(state).filter((s) => s.groupKey === 'group_3').length, 0);
});

console.log(`\n${process.exitCode ? '❌ Fallos detectados' : `✅ ${passed} comprobaciones OK`}\n`);
