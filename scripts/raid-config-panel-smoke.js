#!/usr/bin/env node
/**
 * Smoke test del flujo interactivo del panel de configuración de armas de `/raid create`.
 *
 * Simula las interacciones de Discord (selects, botones y modales) contra
 * `raid.handleWeaponConfigInteraction` y comprueba el estado resultante.
 *
 * Uso: node scripts/raid-config-panel-smoke.js
 */

const assert = require('node:assert');

const cfg = require('../src/utils/raidWeaponConfig');
const raid = require('../src/commands/utility/raid');

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.error(`  ❌ ${name}\n     ${error.stack?.split('\n').slice(0, 3).join('\n     ')}`);
    process.exitCode = 1;
  }
};

const weapon = (name, units) => ({ name, units, emoji: '1286453830292344942', image: '', url: '' });

const template = {
  title: 'Raid',
  description: 'D',
  image: '',
  weapons: {
    group_1: {
      displayName: 'DPS',
      defaultEmoji: '1286453830292344942',
      max_players: 6,
      data: [weapon('Falce de cristal', 6), weapon('Bastón ártico', 6)],
    },
    group_2: {
      displayName: 'Falces',
      defaultEmoji: '1286454706578657382',
      max_players: 3,
      data: [weapon('Falce de cristal', 1), weapon('Falce de cristal', 1), weapon('Falce de cristal', 1)],
    },
  },
};

const LEADER = { id: '999', toString: () => '<@999>' };
const PENDING_ID = '1234567890123456789';

/** Crea una sesión pendiente limpia y devuelve sus overrides. */
const newSession = () => {
  const weaponOverrides = cfg.emptyOverrides();
  raid.pendingRaids.set(PENDING_ID, {
    templateName: 'Raid', template, eventTimestamp: 1, time: '00:00',
    title: 'Raid', color: null, image: null, description: null,
    finalReminder: null, finalNotificationRoles: [], looters: null,
    guildId: '1', user: LEADER, weaponOverrides,
  });
  return weaponOverrides;
};

/** Interacción simulada; registra la última llamada a update/reply/showModal. */
const makeInteraction = (customId, { values, modalValue, user = LEADER } = {}) => {
  const calls = { update: null, reply: null, modal: null };
  return {
    customId,
    user,
    values,
    replied: false,
    deferred: false,
    fields: { getTextInputValue: () => modalValue },
    isModalSubmit: () => modalValue !== undefined,
    isFromMessage: () => true,
    async update(payload) { calls.update = payload; },
    async reply(payload) { calls.reply = payload; this.replied = true; },
    async showModal(modal) { calls.modal = modal; },
    calls,
  };
};

/** Ejecuta una interacción contra el handler y devuelve lo que respondió. */
const run = async (customId, options) => {
  const interaction = makeInteraction(customId, options);
  await raid.handleWeaponConfigInteraction(interaction);
  return interaction.calls;
};

(async () => {
  console.log('\n── Navegación del panel');

  await test('Seleccionar un grupo abre su panel con el selector de armas', async () => {
    newSession();
    const calls = await run(`raidcfg-grp-${PENDING_ID}`, { values: ['group_2'] });
    assert.ok(calls.update, 'debe actualizar el mensaje');
    const select = calls.update.components[0].components[0];
    assert.strictEqual(select.data.custom_id, `raidcfg-wpn-${PENDING_ID}-group_2`);
    assert.strictEqual(select.options.length, 3, 'las 3 falces son configurables por separado');
  });

  await test('Seleccionar un arma abre su panel', async () => {
    newSession();
    const calls = await run(`raidcfg-wpn-${PENDING_ID}-group_2`, { values: ['1'] });
    const buttons = calls.update.components[0].components;
    assert.strictEqual(buttons[0].data.custom_id, `raidcfg-wunits-${PENDING_ID}-group_2-1`);
    assert.strictEqual(buttons[1].data.custom_id, `raidcfg-wtoggle-${PENDING_ID}-group_2-1`);
  });

  await test('"Volver a los grupos" regresa al panel principal', async () => {
    newSession();
    const calls = await run(`raidcfg-home-${PENDING_ID}`);
    assert.strictEqual(
      calls.update.components[0].components[0].data.custom_id,
      `raidcfg-grp-${PENDING_ID}`
    );
  });

  await test('Un grupo inexistente devuelve al panel principal sin romperse', async () => {
    newSession();
    const calls = await run(`raidcfg-gtoggle-${PENDING_ID}-group_99`);
    assert.strictEqual(
      calls.update.components[0].components[0].data.custom_id,
      `raidcfg-grp-${PENDING_ID}`
    );
  });

  console.log('\n── Deshabilitar / habilitar');

  await test('Deshabilitar un grupo y volver a habilitarlo', async () => {
    const overrides = newSession();
    await run(`raidcfg-gtoggle-${PENDING_ID}-group_1`);
    assert.strictEqual(cfg.isGroupDisabled(overrides, 'group_1'), true);
    assert.strictEqual(cfg.getGroupCapacity(template, overrides, 'group_1'), 0);

    await run(`raidcfg-gtoggle-${PENDING_ID}-group_1`);
    assert.strictEqual(cfg.isGroupDisabled(overrides, 'group_1'), false);
    assert.strictEqual(cfg.getGroupCapacity(template, overrides, 'group_1'), 6);
  });

  await test('Deshabilitar un arma concreta del grupo', async () => {
    const overrides = newSession();
    await run(`raidcfg-wtoggle-${PENDING_ID}-group_1-1`);
    assert.strictEqual(cfg.isWeaponDisabled(overrides, 'group_1', 1), true);
    assert.strictEqual(cfg.getWeaponLimit(template, overrides, 'group_1', 1), 0);
    assert.strictEqual(cfg.getWeaponLimit(template, overrides, 'group_1', 0), 6);
  });

  await test('Deshabilitar una de las tres falces deja cupo 2', async () => {
    const overrides = newSession();
    await run(`raidcfg-wtoggle-${PENDING_ID}-group_2-0`);
    assert.strictEqual(cfg.getGroupCapacity(template, overrides, 'group_2'), 2);
    assert.strictEqual(cfg.getGroupCapacity(template, overrides, 'group_2'), 2);
  });

  await test('Un índice de arma inexistente vuelve al panel del grupo', async () => {
    const overrides = newSession();
    const calls = await run(`raidcfg-wtoggle-${PENDING_ID}-group_2-9`);
    assert.deepStrictEqual(overrides.groups.group_2?.weapons?.['9'], undefined);
    assert.strictEqual(
      calls.update.components[0].components[0].data.custom_id,
      `raidcfg-wpn-${PENDING_ID}-group_2`
    );
  });

  console.log('\n── Modales de cupos');

  await test('El botón de cupo del grupo abre el modal con el valor actual', async () => {
    newSession();
    const calls = await run(`raidcfg-gmax-${PENDING_ID}-group_1`);
    assert.ok(calls.modal, 'debe abrirse un modal');
    assert.strictEqual(calls.modal.data.custom_id, `raidcfg-mgmax-${PENDING_ID}-group_1`);
    assert.strictEqual(calls.modal.components[0].components[0].data.value, '6');
  });

  await test('Enviar el modal cambia el cupo del grupo', async () => {
    const overrides = newSession();
    await run(`raidcfg-mgmax-${PENDING_ID}-group_1`, { modalValue: '3' });
    assert.strictEqual(cfg.getGroupMaxPlayers(template, overrides, 'group_1'), 3);
    assert.strictEqual(cfg.getGroupCapacity(template, overrides, 'group_1'), 3);
    // El arma declara 6 cupos pero el grupo manda
    assert.strictEqual(cfg.getWeaponLimit(template, overrides, 'group_1', 0), 3);
  });

  await test('Un cupo de grupo vacío vuelve al valor del template', async () => {
    const overrides = newSession();
    await run(`raidcfg-mgmax-${PENDING_ID}-group_1`, { modalValue: '3' });
    await run(`raidcfg-mgmax-${PENDING_ID}-group_1`, { modalValue: '  ' });
    assert.strictEqual(overrides.groups.group_1.maxPlayers, null);
    assert.strictEqual(cfg.getGroupMaxPlayers(template, overrides, 'group_1'), 6);
  });

  await test('Un cupo de grupo inválido se rechaza sin modificar nada', async () => {
    const overrides = newSession();
    const calls = await run(`raidcfg-mgmax-${PENDING_ID}-group_1`, { modalValue: 'abc' });
    assert.ok(calls.reply?.content.includes('mayor a 0'), 'debe avisar al usuario');
    assert.strictEqual(cfg.getGroupMaxPlayers(template, overrides, 'group_1'), 6);
  });

  await test('Cambiar el cupo de un arma concreta', async () => {
    const overrides = newSession();
    await run(`raidcfg-mwunits-${PENDING_ID}-group_2-1`, { modalValue: '4' });
    assert.strictEqual(cfg.getWeaponUnits(template, overrides, 'group_2', 1), 4);
    // 1 + 4 + 1 = 6, pero el grupo está limitado a 3
    assert.strictEqual(cfg.getGroupCapacity(template, overrides, 'group_2'), 3);
    assert.strictEqual(cfg.getWeaponLimit(template, overrides, 'group_2', 1), 3);
  });

  await test('Poner 0 en el cupo de un arma la deshabilita', async () => {
    const overrides = newSession();
    await run(`raidcfg-mwunits-${PENDING_ID}-group_1-1`, { modalValue: '0' });
    assert.strictEqual(cfg.isWeaponDisabled(overrides, 'group_1', 1), true);
    assert.strictEqual(cfg.getWeaponLimit(template, overrides, 'group_1', 1), 0);
  });

  await test('Un cupo de arma inválido se rechaza', async () => {
    const overrides = newSession();
    const calls = await run(`raidcfg-mwunits-${PENDING_ID}-group_1-0`, { modalValue: '-2' });
    assert.ok(calls.reply?.content.includes('0 la deshabilita'));
    assert.strictEqual(cfg.getWeaponUnits(template, overrides, 'group_1', 0), 6);
  });

  console.log('\n── Restablecer');

  await test('Restablecer un arma descarta sólo sus cambios', async () => {
    const overrides = newSession();
    await run(`raidcfg-mwunits-${PENDING_ID}-group_1-0`, { modalValue: '2' });
    await run(`raidcfg-wtoggle-${PENDING_ID}-group_1-1`);
    await run(`raidcfg-wreset-${PENDING_ID}-group_1-0`);

    assert.strictEqual(cfg.getWeaponUnits(template, overrides, 'group_1', 0), 6, 'el arma vuelve al template');
    assert.strictEqual(cfg.isWeaponDisabled(overrides, 'group_1', 1), true, 'la otra arma conserva su cambio');
  });

  await test('Restablecer un grupo descarta todos sus cambios', async () => {
    const overrides = newSession();
    await run(`raidcfg-gtoggle-${PENDING_ID}-group_1`);
    await run(`raidcfg-mwunits-${PENDING_ID}-group_1-0`, { modalValue: '2' });
    await run(`raidcfg-greset-${PENDING_ID}-group_1`);

    assert.strictEqual(overrides.groups.group_1, undefined);
    assert.strictEqual(cfg.getGroupCapacity(template, overrides, 'group_1'), 6);
  });

  await test('"Restablecer todo" limpia la configuración completa', async () => {
    newSession();
    await run(`raidcfg-gtoggle-${PENDING_ID}-group_1`);
    await run(`raidcfg-wtoggle-${PENDING_ID}-group_2-0`);
    await run(`raidcfg-resetall-${PENDING_ID}`);

    const pending = raid.pendingRaids.get(PENDING_ID);
    assert.deepStrictEqual(pending.weaponOverrides, { groups: {} });
    assert.strictEqual(cfg.getTotalCapacity(template, pending.weaponOverrides), 9);
  });

  console.log('\n── Permisos y expiración');

  await test('Otro usuario no puede tocar el panel', async () => {
    const overrides = newSession();
    const otro = { id: '111', toString: () => '<@111>' };
    const calls = await run(`raidcfg-gtoggle-${PENDING_ID}-group_1`, { user: otro });
    assert.ok(calls.reply?.content.includes('Solo quien ejecutó'));
    assert.strictEqual(cfg.isGroupDisabled(overrides, 'group_1'), false);
  });

  await test('Una sesión expirada avisa y limpia los componentes', async () => {
    raid.pendingRaids.delete(PENDING_ID);
    const calls = await run(`raidcfg-home-${PENDING_ID}`);
    assert.ok(calls.update?.content.includes('expirado'));
    assert.deepStrictEqual(calls.update.components, []);
  });

  await test('Un customId ajeno al panel se ignora', async () => {
    newSession();
    const calls = await run('template_edit_weapons_123');
    assert.strictEqual(calls.update, null);
    assert.strictEqual(calls.reply, null);
  });

  console.log('\n── Publicación');

  await test('No se puede publicar con todo deshabilitado', async () => {
    newSession();
    await run(`raidcfg-gtoggle-${PENDING_ID}-group_1`);
    await run(`raidcfg-gtoggle-${PENDING_ID}-group_2`);

    const interaction = makeInteraction(`raid_confirm_create-${PENDING_ID}`);
    await raid.handleConfirmRaidCreate(interaction);

    assert.ok(interaction.calls.update?.content.includes('todas las armas están deshabilitadas'));
    assert.ok(raid.pendingRaids.has(PENDING_ID), 'la sesión debe seguir viva para poder corregir');
  });

  raid.pendingRaids.delete(PENDING_ID);
  console.log(`\n${process.exitCode ? '❌ Fallos detectados' : `✅ ${passed} comprobaciones OK`}\n`);
})();
