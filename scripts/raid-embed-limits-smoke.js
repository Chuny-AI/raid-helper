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
const {
  renderRaidEmbeds,
  renderRaidComponents,
  renderGroupBrowser,
  renderGroupPickPanel,
} = require('../src/utils/raidRender');

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

const renderedJson = (raidData, state) => renderRaidEmbeds(raidData, state).map((embed) => embed.toJSON());
const allFields = (embeds) => embeds.flatMap((embed) => embed.fields || []);

console.log('\n── El embed se renderiza con cualquier número de grupos');

for (const [grupos, armas] of [[1, 1], [11, 1], [16, 1], [17, 1], [25, 2], [40, 3], [100, 1]]) {
  test(`${grupos} grupos x ${armas} arma(s)`, () => {
    const embeds = renderedJson(raid, fullState(grupos, armas));
    assert.ok(embeds.length <= 10, `${embeds.length} embeds`);
    assert.ok(embeds.reduce((sum, embed) => sum + embedSize(embed), 0) <= 6000, 'más de 6000 caracteres');
    for (const embed of embeds) {
      assert.ok(embed.fields.length <= 25, `${embed.fields.length} campos`);
      for (const campo of embed.fields) {
        assert.ok(campo.value.length <= 1024, `campo "${campo.name}" con ${campo.value.length}`);
      }
    }
  });
}

console.log('\n── Los grupos se reparten sin desaparecer');

test('los 20 grupos aparecen completos en varios embeds', () => {
  const embeds = renderedJson(raid, fullState(20, 1));
  const fields = allFields(embeds);
  assert.ok(embeds.length > 1, 'no se creó el embed de continuación');
  assert.strictEqual(fields.filter((f) => f.name.includes('Grupo de nombre largo')).length, 20);
  assert.ok(!fields.some((f) => f.name.includes('no mostrados')), 'se recortaron grupos que sí cabían');
});

test('con 16 grupos cabe todo y no se avisa de nada', () => {
  const fields = allFields(renderedJson(raid, fullState(16, 1)));
  assert.ok(!fields.some((f) => f.name.includes('no mostrados')), 'avisa sin haber recortado');
  assert.strictEqual(fields.filter((f) => f.name.includes('Grupo de nombre largo')).length, 16);
});

test('si se alcanzan 6000 caracteres, el aviso sustituye solo a los grupos finales', () => {
  const fields = allFields(renderedJson(raid, fullState(100, 1)));
  const aviso = fields.find((f) => f.name.includes('no mostrados'));
  assert.ok(aviso, 'no aparece el aviso');
  assert.match(aviso.value, /límites totales de Discord/);
});

console.log('\n── Nunca se recortan los campos que no son de grupo');

test('líder, hora, participantes y redes sobreviven al recorte', () => {
  const fields = allFields(renderedJson(raid, fullState(100, 1)));
  for (const nombre of ['Líder de la actividad:', 'Hora de la actividad:', '👥 Participantes', '🎮 Twitch']) {
    assert.ok(fields.some((f) => f.name === nombre), `falta el campo "${nombre}"`);
  }
});

test('la lista de espera sobrevive al recorte', () => {
  const state = fullState(40, 1);
  state.waitlist = [{ userId: USER, username: 'u' }];
  const fields = allFields(renderedJson(raid, state));
  assert.ok(fields.some((f) => f.name.includes('Lista de espera')), 'falta la lista de espera');
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

console.log('\n── Navegación de raids masivos');

test('50 grupos x 10 armas abren un navegador privado en vez de truncarse', () => {
  const state = buildInitialState({ template: makeTemplate(50, 10), leaderId: 'L1', lootersMax: 2 });
  const rows = renderRaidComponents(raid, state).map((row) => row.toJSON());
  assert.ok(rows.some((row) => row.components.some((component) => component.custom_id === `raid:browse:${raid.eventId}`)));

  const first = renderGroupBrowser(raid, state, 0);
  const second = renderGroupBrowser(raid, state, 1);
  assert.strictEqual(first.pageCount, 2);
  assert.strictEqual(first.rows[0].toJSON().components[0].options.length, 25);
  assert.strictEqual(second.rows[0].toJSON().components[0].options.length, 25);
  assert.strictEqual(second.rows[0].toJSON().components[0].options[0].value, 'group_25');
});

test('la búsqueda puede mostrar un grupo fuera de la primera página', () => {
  const state = buildInitialState({ template: makeTemplate(50, 10), leaderId: 'L1', lootersMax: 2 });
  const result = renderGroupBrowser(raid, state, 0, ['group_49']);
  const options = result.rows[0].toJSON().components[0].options;
  assert.deepStrictEqual(options.map((option) => option.value), ['group_49']);
});

test('un grupo con más de 25 armas también se pagina completo', () => {
  const state = buildInitialState({ template: makeTemplate(1, 30), leaderId: 'L1', lootersMax: 2 });
  const first = renderGroupPickPanel(raid, state, 'group_0', 0);
  const second = renderGroupPickPanel(raid, state, 'group_0', 1);
  assert.strictEqual(first.pageCount, 2);
  assert.strictEqual(first.rows[0].toJSON().components[0].options.length, 25);
  assert.strictEqual(second.rows[0].toJSON().components[0].options.length, 5);
});

console.log('\n── Un raid cerrado se sigue renderizando', '');

test('el embed de un raid cerrado con muchos grupos no revienta', () => {
  const cerrado = { ...raid, status: 'closed', closedBy: USER, closedAt: new Date() };
  const embeds = renderedJson(cerrado, fullState(40, 1));
  assert.ok(embeds.every((embed) => embed.fields.length <= 25));
  assert.match(embeds[0].title, /FINALIZADO/);
});

console.log(`\n${process.exitCode ? '❌ Fallos detectados' : `✅ ${passed} comprobaciones OK`}\n`);
