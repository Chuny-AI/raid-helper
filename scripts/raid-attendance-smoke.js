#!/usr/bin/env node
/**
 * Smoke test del registro de asistencia real de un raid finalizado.
 *
 * Regla del negocio: el líder marca SOLO a quienes no aparecieron; todo el que
 * ocupó plaza y no queda marcado cuenta como asistente. Por eso un raid recién
 * cerrado ya muestra el informe completo con todos presentes.
 *
 * No necesita BD ni bot. Uso: node scripts/raid-attendance-smoke.js
 */

const assert = require('node:assert');

const {
  buildInitialState,
  joinSlot,
  joinLooter,
  toggleCannotGo,
  raidRoster,
  getAbsentIds,
  attendanceReport,
  applyAbsenceSelection,
} = require('../src/services/raidState');
const { renderRaidEmbed, renderRaidComponents, renderAttendanceRows } = require('../src/utils/raidRender');

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

const makeTemplate = (grupos, armas = 1, cupo = 1) => ({
  title: 'T',
  weapons: Object.fromEntries(
    Array.from({ length: grupos }, (_, g) => [
      `group_${g}`,
      {
        displayName: `Grupo ${g}`,
        defaultEmoji: EMOJI,
        max_players: armas * cupo,
        data: Array.from({ length: armas }, (_, w) => ({
          name: `Arma ${g}-${w}`,
          units: cupo,
          emoji: EMOJI,
        })),
      },
    ]),
  ),
});

const raid = {
  eventId: 'AB3K9F',
  title: 'Raid de prueba',
  color: '#00ff00',
  status: 'active',
  eventTimestamp: Math.floor(Date.now() / 1000) + 3600,
  rolesToNotify: [],
  stateVersion: 2,
};
const closedRaid = { ...raid, status: 'closed', closedBy: 'L1', closedAt: new Date() };

/** Estado con `n` plazas ocupadas por usuarios u0..u(n-1). */
const stateWith = (grupos, armas = 1, cupo = 1, lootersMax = 0) => {
  const state = buildInitialState({
    template: makeTemplate(grupos, armas, cupo),
    leaderId: 'L1',
    lootersMax,
  });
  let i = 0;
  for (const slot of state.slots) {
    for (let u = 0; u < slot.units; u++) {
      joinSlot(state, slot.slotId, { userId: `u${i}`, username: `Jugador ${i}` });
      i++;
    }
  }
  return state;
};

const fieldNamed = (json, prefix) => json.fields.find((f) => f.name.startsWith(prefix));
const embedSize = (json) =>
  (json.title || '').length +
  (json.description || '').length +
  (json.author?.name || '').length +
  (json.footer?.text || '').length +
  json.fields.reduce((suma, f) => suma + f.name.length + f.value.length, 0);

console.log('\n── El roster es quien tuvo plaza, en el orden del embed');

test('un usuario por plaza, en orden de grupo y arma', () => {
  const roster = raidRoster(stateWith(3, 2));
  assert.strictEqual(roster.length, 6);
  assert.deepStrictEqual(roster.map((r) => r.userId), ['u0', 'u1', 'u2', 'u3', 'u4', 'u5']);
  assert.strictEqual(roster[0].label, 'Arma 0-0');
  assert.strictEqual(roster[0].isLooter, false);
});

test('quien avisó de "no puedo ir" no entra en el roster', () => {
  const state = stateWith(2, 1);
  toggleCannotGo(state, { userId: 'u0', username: 'Jugador 0' });
  const roster = raidRoster(state);
  assert.deepStrictEqual(roster.map((r) => r.userId), ['u1']);
});

test('un looter sin plaza entra al roster marcado como looter', () => {
  const state = stateWith(1, 1, 1, 2);
  const result = joinLooter(state, { userId: 'looter1', username: 'Looter Uno' });
  assert.ok(result.ok, `joinLooter falló: ${result.reason}`);
  const roster = raidRoster(state);
  assert.deepStrictEqual(roster.map((r) => r.userId), ['u0', 'looter1']);
  assert.strictEqual(roster[1].isLooter, true);
  assert.strictEqual(roster[1].slotId, null);
});

test('quien tiene plaza y además es looter no se duplica', () => {
  const state = stateWith(1, 1, 1, 2);
  joinLooter(state, { userId: 'u0', username: 'Jugador 0' });
  const roster = raidRoster(state);
  assert.strictEqual(roster.length, 1);
  assert.strictEqual(roster[0].isLooter, true);
  assert.strictEqual(roster[0].slotId, 'group_0~0');
});

console.log('\n── Sin marcar a nadie, todos asistieron');

test('un raid recién cerrado da a todos por asistentes', () => {
  const { attended, absent } = attendanceReport(stateWith(4, 1));
  assert.strictEqual(attended.length, 4);
  assert.strictEqual(absent.length, 0);
});

test('el embed cerrado muestra Asistieron / No asistieron y ya no los grupos', () => {
  const json = renderRaidEmbed(closedRaid, stateWith(3, 1)).toJSON();
  assert.ok(fieldNamed(json, '✅ Asistieron (3)'), 'falta el bloque de asistentes');
  assert.ok(fieldNamed(json, '❌ No asistieron (0)'), 'falta el bloque de ausentes');
  assert.ok(!json.fields.some((f) => f.name.startsWith('Grupo ')), 'sigue mostrando los grupos');
});

test('un raid activo sigue mostrando los grupos y no la asistencia', () => {
  const json = renderRaidEmbed(raid, stateWith(3, 1)).toJSON();
  assert.ok(json.fields.some((f) => f.name.includes('Grupo 0')), 'faltan los grupos');
  assert.ok(!json.fields.some((f) => f.name.includes('Asistieron')), 'muestra asistencia estando activo');
});

console.log('\n── Marcar y desmarcar ausentes');

test('marcar a uno lo saca de asistentes', () => {
  const state = stateWith(4, 1);
  const conteo = applyAbsenceSelection(state, {
    pageUserIds: ['u0', 'u1', 'u2', 'u3'],
    selectedUserIds: ['u2'],
    actorId: 'L1',
  });
  assert.deepStrictEqual(conteo, { attended: 3, absent: 1 });

  const { attended, absent } = attendanceReport(state);
  assert.deepStrictEqual(absent.map((r) => r.userId), ['u2']);
  assert.deepStrictEqual(attended.map((r) => r.userId), ['u0', 'u1', 'u3']);
});

test('desmarcar devuelve al jugador a asistentes', () => {
  const state = stateWith(3, 1);
  applyAbsenceSelection(state, { pageUserIds: ['u0', 'u1', 'u2'], selectedUserIds: ['u1'] });
  applyAbsenceSelection(state, { pageUserIds: ['u0', 'u1', 'u2'], selectedUserIds: [] });
  assert.strictEqual(attendanceReport(state).absent.length, 0);
  assert.strictEqual(attendanceReport(state).attended.length, 3);
});

test('guardar una página no toca a los ausentes de otra', () => {
  const state = stateWith(60, 1);
  const roster = raidRoster(state).map((r) => r.userId);
  const pagina1 = roster.slice(0, 25);
  const pagina2 = roster.slice(25, 50);

  applyAbsenceSelection(state, { pageUserIds: pagina1, selectedUserIds: [pagina1[0]] });
  applyAbsenceSelection(state, { pageUserIds: pagina2, selectedUserIds: [pagina2[3]] });
  assert.deepStrictEqual([...getAbsentIds(state)].sort(), [pagina1[0], pagina2[3]].sort());

  // Vaciar la página 2 no debe resucitar ni borrar el ausente de la página 1.
  applyAbsenceSelection(state, { pageUserIds: pagina2, selectedUserIds: [] });
  assert.deepStrictEqual([...getAbsentIds(state)], [pagina1[0]]);
});

test('se ignoran los ids que no participaron en el raid', () => {
  const state = stateWith(2, 1);
  applyAbsenceSelection(state, {
    pageUserIds: ['u0', 'u1', 'intruso'],
    selectedUserIds: ['u0', 'intruso', 'otro'],
  });
  assert.deepStrictEqual([...getAbsentIds(state)], ['u0']);
});

test('se conserva la fecha del ausente que ya estaba marcado', () => {
  const state = stateWith(3, 1);
  applyAbsenceSelection(state, { pageUserIds: ['u0', 'u1', 'u2'], selectedUserIds: ['u0'] });
  const primera = state.attendance.absent[0].at;
  applyAbsenceSelection(state, { pageUserIds: ['u0', 'u1', 'u2'], selectedUserIds: ['u0', 'u2'] });
  const conservada = state.attendance.absent.find((a) => a.userId === 'u0').at;
  assert.strictEqual(conservada, primera, 'se regeneró la fecha de un ausente ya marcado');
});

test('los ausentes se listan en el orden del roster', () => {
  const state = stateWith(5, 1);
  applyAbsenceSelection(state, {
    pageUserIds: ['u0', 'u1', 'u2', 'u3', 'u4'],
    selectedUserIds: ['u4', 'u1', 'u3'],
  });
  assert.deepStrictEqual(state.attendance.absent.map((a) => a.userId), ['u1', 'u3', 'u4']);
});

test('queda registrado quién y cuándo tocó la asistencia', () => {
  const state = stateWith(2, 1);
  applyAbsenceSelection(state, { pageUserIds: ['u0', 'u1'], selectedUserIds: ['u0'], actorId: 'L1' });
  assert.strictEqual(state.attendance.updatedBy, 'L1');
  assert.ok(state.attendance.updatedAt instanceof Date);
});

console.log('\n── El botón solo aparece con el raid finalizado');

test('un raid cerrado con participantes trae el botón de asistencia', () => {
  const filas = renderRaidComponents(closedRaid, stateWith(2, 1));
  assert.strictEqual(filas.length, 1);
  const boton = filas[0].toJSON().components[0];
  assert.strictEqual(boton.custom_id, `raid:att:${closedRaid.eventId}`);
});

test('un raid cerrado sin participantes informa del vacío y no trae botón', () => {
  const vacio = buildInitialState({ template: makeTemplate(2, 1), leaderId: 'L1' });
  assert.strictEqual(renderRaidComponents(closedRaid, vacio).length, 0, 'ofrece marcar sin nadie a quien marcar');
  const json = renderRaidEmbed(closedRaid, vacio).toJSON();
  assert.ok(fieldNamed(json, '✅ Asistieron (0)'), 'no dice que no fue nadie');
  assert.ok(fieldNamed(json, '❌ No asistieron (0)'), 'no dice que no faltó nadie');
  assert.ok(!json.fields.some((f) => f.name.startsWith('Grupo ')), 'sigue mostrando los grupos vacíos');
});

test('un raid activo no trae el botón de asistencia', () => {
  const filas = renderRaidComponents(raid, stateWith(2, 1));
  const ids = filas.flatMap((f) => f.toJSON().components.map((c) => c.custom_id));
  assert.ok(!ids.some((id) => id?.startsWith('raid:att')), 'el botón sale con el raid activo');
});

console.log('\n── El panel de marcado respeta los límites de Discord');

test('los ya ausentes vienen preseleccionados y el resto no', () => {
  const state = stateWith(4, 1);
  applyAbsenceSelection(state, { pageUserIds: ['u0', 'u1', 'u2', 'u3'], selectedUserIds: ['u1'] });
  const filas = renderAttendanceRows(closedRaid, raidRoster(state), getAbsentIds(state));
  const opciones = filas[0].toJSON().components[0].options;
  assert.strictEqual(opciones.find((o) => o.value === 'u1').default, true);
  assert.ok(!opciones.find((o) => o.value === 'u0').default, 'u0 sale preseleccionado sin estar ausente');
  assert.match(opciones.find((o) => o.value === 'u1').description, /No asistió/);
  assert.match(opciones.find((o) => o.value === 'u0').description, /Asistió/);
});

test('el selector permite no marcar a nadie y marcarlos a todos', () => {
  const state = stateWith(4, 1);
  const select = renderAttendanceRows(closedRaid, raidRoster(state), getAbsentIds(state))[0]
    .toJSON().components[0];
  assert.strictEqual(select.min_values, 0);
  assert.strictEqual(select.max_values, 4);
});

test('la última fila siempre es el botón Listo', () => {
  const filas = renderAttendanceRows(closedRaid, raidRoster(stateWith(4, 1)), new Set());
  const ultima = filas[filas.length - 1].toJSON().components[0];
  assert.strictEqual(ultima.custom_id, `raid:attdone:${closedRaid.eventId}`);
});

for (const [jugadores, selects] of [[1, 1], [25, 1], [26, 2], [60, 3], [100, 4], [200, 4]]) {
  test(`${jugadores} jugadores -> ${selects} selector(es), nunca más de 5 filas`, () => {
    const state = stateWith(jugadores, 1);
    const roster = raidRoster(state);
    assert.strictEqual(roster.length, jugadores);

    const filas = renderAttendanceRows(closedRaid, roster, new Set());
    assert.ok(filas.length <= 5, `${filas.length} filas`);
    assert.strictEqual(filas.length, selects + 1);

    for (const fila of filas) {
      for (const componente of fila.toJSON().components) {
        if (componente.options) {
          assert.ok(componente.options.length <= 25, `${componente.options.length} opciones`);
        }
      }
    }
  });
}

test('las páginas del selector no repiten ni se saltan jugadores', () => {
  const roster = raidRoster(stateWith(60, 1));
  const filas = renderAttendanceRows(closedRaid, roster, new Set());
  const valores = filas
    .slice(0, -1)
    .flatMap((f) => f.toJSON().components[0].options.map((o) => o.value));
  assert.deepStrictEqual(valores, roster.slice(0, 60).map((r) => r.userId));
  assert.strictEqual(new Set(valores).size, valores.length, 'hay jugadores repetidos');
});

console.log('\n── El informe no revienta ni se trunca con muchos jugadores');

for (const jugadores of [1, 30, 80, 200]) {
  test(`el embed cerrado con ${jugadores} jugadores cabe en Discord`, () => {
    const state = stateWith(jugadores, 1);
    const json = renderRaidEmbed(closedRaid, state).toJSON();
    assert.ok(json.fields.length <= 25, `${json.fields.length} campos`);
    assert.ok(embedSize(json) <= 6000, `${embedSize(json)} caracteres`);
    for (const campo of json.fields) {
      assert.ok(campo.value.length <= 1024, `campo "${campo.name}" con ${campo.value.length}`);
    }
  });
}

test('una lista larga se reparte en varios campos, no se trunca', () => {
  const json = renderRaidEmbed(closedRaid, stateWith(40, 1)).toJSON();
  const inicio = json.fields.findIndex((f) => f.name.startsWith('✅ Asistieron'));
  assert.ok(inicio !== -1, 'falta el bloque de asistentes');
  // El bloque de asistentes ocupa su campo más los de continuación (nombre ZWSP).
  const continuacion = json.fields.slice(inicio + 1).filter((f) => f.name === '​').length;
  assert.ok(continuacion >= 1, 'no se repartió en varios campos');
  assert.ok(!json.fields.some((f) => f.value.includes('(truncado)')), 'se truncó la lista');
});

test('con demasiados jugadores se avisa en vez de romper el embed', () => {
  const json = renderRaidEmbed(closedRaid, stateWith(400, 1)).toJSON();
  assert.ok(json.fields.length <= 25, `${json.fields.length} campos`);
  const aviso = json.fields.find((f) => f.name.includes('Asistencia no mostrada'));
  assert.ok(aviso, 'no avisa de que la lista no cabe entera');
});

test('los ausentes salen en su bloque con el arma que llevaban', () => {
  const state = stateWith(3, 1);
  applyAbsenceSelection(state, { pageUserIds: ['u0', 'u1', 'u2'], selectedUserIds: ['u1'] });
  const json = renderRaidEmbed(closedRaid, state).toJSON();
  const ausentes = fieldNamed(json, '❌ No asistieron (1)');
  assert.ok(ausentes, 'falta el bloque de ausentes');
  assert.match(ausentes.value, /Arma 1-0 <@u1>/);
  assert.ok(!ausentes.value.includes('<@u0>'), 'u0 aparece como ausente');
  assert.match(fieldNamed(json, '✅ Asistieron (2)').value, /<@u0>/);
});

console.log(`\n${process.exitCode ? '❌ Fallos detectados' : `✅ ${passed} comprobaciones OK`}\n`);
