#!/usr/bin/env node
/**
 * Smoke test de los límites del embed del raid publicado.
 *
 * Cada grupo del template ocupa un campo del embed, y Discord solo admite 25.
 * Con 17 grupos discord.js rechazaba el embed entero ("Invalid number value"):
 * el raid no se podía publicar y un raid ya publicado tampoco se podía volver a
 * renderizar, así que se quedaba congelado al apuntarse alguien.
 *
 * No necesita BD ni bot. Uso: node scripts/raid-embed-limits-smoke.js
 */

const assert = require('node:assert');

const { buildInitialState, joinSlot } = require('../src/services/raidState');
const { renderRaidEmbed, renderRaidComponents } = require('../src/utils/raidRender');

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

const EMOJI = '1543135270474620968';
const USER = '464241835930419210';

const makeTemplate = (grupos, armas = 1) => ({
  title: 'T',
  weapons: Object.fromEntries(
    Array.from({ length: grupos }, (_, g) => [
      `group_${g}`,
      {
        displayName: `Grupo de nombre largo numero ${g}`,
        defaultEmoji: EMOJI,
        max_players: armas,
        data: Array.from({ length: armas }, (_, w) => ({
          name: `Arma de nombre largo ${w}`,
          units: 1,
          emoji: EMOJI,
        })),
      },
    ]),
  ),
});

const raid = {
  eventId: 'AB3K9F',
  title: 'Raid de prueba',
  description: 'Una descripción de raid de las largas. '.repeat(30),
  color: '#00ff00',
  status: 'active',
  eventTimestamp: Math.floor(Date.now() / 1000) + 3600,
  rolesToNotify: [],
  stateVersion: 2,
};

/** Estado con todas las plazas ocupadas, que es el caso más pesado. */
const fullState = (grupos, armas) => {
  const state = buildInitialState({ template: makeTemplate(grupos, armas), leaderId: 'L1', lootersMax: 2 });
  for (const slot of state.slots) joinSlot(state, slot.slotId, { userId: USER, username: 'u' });
  return state;
};

const embedSize = (json) =>
  (json.title || '').length +
  (json.description || '').length +
  (json.author?.name || '').length +
  (json.footer?.text || '').length +
  json.fields.reduce((suma, f) => suma + f.name.length + f.value.length, 0);

console.log('\n── El embed se renderiza con cualquier número de grupos');

for (const [grupos, armas] of [[1, 1], [11, 1], [16, 1], [17, 1], [25, 2], [40, 3], [100, 1]]) {
  test(`${grupos} grupos x ${armas} arma(s)`, () => {
    const json = renderRaidEmbed(raid, fullState(grupos, armas)).toJSON();
    assert.ok(json.fields.length <= 25, `${json.fields.length} campos`);
    assert.ok(embedSize(json) <= 6000, `${embedSize(json)} caracteres`);
    for (const campo of json.fields) {
      assert.ok(campo.value.length <= 1024, `campo "${campo.name}" con ${campo.value.length}`);
    }
  });
}

console.log('\n── Lo que no cabe se dice, no se calla');

test('con 17 grupos aparece el aviso de grupos no mostrados', () => {
  const json = renderRaidEmbed(raid, fullState(17, 1)).toJSON();
  const aviso = json.fields.find((f) => f.name.includes('no mostrados'));
  assert.ok(aviso, 'no aparece el aviso');
  assert.match(aviso.value, /No caben \*\*\d+\*\* grupo\(s\)/);
});

test('con 16 grupos cabe todo y no se avisa de nada', () => {
  const json = renderRaidEmbed(raid, fullState(16, 1)).toJSON();
  assert.ok(!json.fields.some((f) => f.name.includes('no mostrados')), 'avisa sin haber recortado');
  assert.strictEqual(json.fields.filter((f) => f.name.includes('Grupo de nombre largo')).length, 16);
});

console.log('\n── Nunca se recortan los campos que no son de grupo');

test('líder, hora, participantes y redes sobreviven al recorte', () => {
  const json = renderRaidEmbed(raid, fullState(100, 1)).toJSON();
  for (const nombre of ['Líder de la actividad:', 'Hora de la actividad:', '👥 Participantes', '🎮 Twitch']) {
    assert.ok(json.fields.some((f) => f.name === nombre), `falta el campo "${nombre}"`);
  }
});

test('la lista de espera sobrevive al recorte', () => {
  const state = fullState(40, 1);
  state.waitlist = [{ userId: USER, username: 'u' }];
  const json = renderRaidEmbed(raid, state).toJSON();
  assert.ok(json.fields.some((f) => f.name.includes('Lista de espera')), 'falta la lista de espera');
});

console.log('\n── Los componentes tampoco se pasan de los límites');

test('nunca más de 5 filas ni 25 opciones por selector', () => {
  for (const grupos of [11, 25, 40]) {
    const filas = renderRaidComponents(raid, fullState(grupos, 1));
    assert.ok(filas.length <= 5, `${grupos} grupos -> ${filas.length} filas`);
    for (const fila of filas) {
      for (const componente of fila.toJSON().components) {
        if (componente.options) {
          assert.ok(componente.options.length <= 25, `${componente.options.length} opciones`);
        }
      }
    }
  }
});

console.log('\n── Un raid cerrado se sigue renderizando', '');

test('el embed de un raid cerrado con muchos grupos no revienta', () => {
  const cerrado = { ...raid, status: 'closed', closedBy: USER, closedAt: new Date() };
  const json = renderRaidEmbed(cerrado, fullState(40, 1)).toJSON();
  assert.ok(json.fields.length <= 25, `${json.fields.length} campos`);
  assert.match(json.title, /FINALIZADO/);
});

console.log(`\n${process.exitCode ? '❌ Fallos detectados' : `✅ ${passed} comprobaciones OK`}\n`);
