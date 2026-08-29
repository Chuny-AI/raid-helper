#!/usr/bin/env node
/**
 * Smoke test del panel de configuración de armas de `/raid create`.
 *
 * Cubre el reparto de la lista en varios campos del embed. Antes se volcaba
 * entera en uno solo y se recortaba a 1024 caracteres, así que con 11 grupos los
 * últimos desaparecían del panel sin ningún aviso.
 *
 * No necesita BD ni bot. Uso: node scripts/raid-weapon-panel-smoke.js
 */

const assert = require('node:assert');

const {
  buildOverviewPanel,
  buildGroupPanel,
} = require('../src/lib/raid/raid-weapon-config-ui');

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
const ZWSP = '​';

/** Template con `grupos` grupos de `armas` armas cada uno. */
const makeTemplate = (grupos, armas = 1, nombre = 'Falce de cristal') => ({
  title: 'T',
  weapons: Object.fromEntries(
    Array.from({ length: grupos }, (_, g) => [
      `group_${g}`,
      {
        displayName: `Grupo numero ${g}`,
        defaultEmoji: EMOJI,
        max_players: armas,
        data: Array.from({ length: armas }, (_, w) => ({
          name: `${nombre} ${w}`,
          units: 1,
          emoji: EMOJI,
        })),
      },
    ]),
  ),
});

/** Campos del embed que forman la lista (el primero y sus continuaciones). */
const listFields = (embed, titulo) => {
  const json = embed.toJSON();
  const inicio = (json.fields || []).findIndex((f) => f.name.startsWith(titulo));
  assert.notStrictEqual(inicio, -1, `no hay ningún campo "${titulo}"`);
  const campos = [json.fields[inicio]];
  for (let i = inicio + 1; i < json.fields.length && json.fields[i].name === ZWSP; i++) {
    campos.push(json.fields[i]);
  }
  return campos;
};

const listLines = (embed, titulo) =>
  listFields(embed, titulo).flatMap((f) => f.value.split('\n'));

/** Líneas de la lista de grupos, que vive en la descripción. */
const overviewLines = (embed) => (embed.toJSON().description || '').split('\n');

console.log('\n── Panel principal: todos los grupos salen listados');

for (const grupos of [1, 5, 11, 20, 25]) {
  test(`${grupos} grupo(s): aparecen los ${grupos}`, () => {
    const { embeds } = buildOverviewPanel(makeTemplate(grupos), {}, 'p1');
    const cabeceras = overviewLines(embeds[0]).filter((l) => /^[✅🚫] /.test(l));
    assert.strictEqual(cabeceras.length, grupos);
    for (let g = 0; g < grupos; g++) {
      assert.ok(
        cabeceras.some((l) => l.includes(`**Grupo numero ${g}**`)),
        `falta el grupo ${g}`,
      );
    }
  });
}

console.log('\n── La lista se ve seguida, sin huecos');

test('la lista de grupos va en la descripción, no repartida en campos', () => {
  const json = buildOverviewPanel(makeTemplate(11), {}, 'p1').embeds[0].toJSON();
  assert.ok(json.description.includes('**Grupos (capacidad total: 11)**'));
  // Un campo de continuación (título de ancho cero) es justo lo que metía el
  // hueco visible en mitad de la lista.
  assert.ok(!(json.fields || []).some((f) => f.name === ZWSP), 'hay campos de continuación');
});

test('sin ningún grupo separado del resto por un campo', () => {
  for (const grupos of [11, 20, 25]) {
    const json = buildOverviewPanel(makeTemplate(grupos), {}, 'p1').embeds[0].toJSON();
    const enDescripcion = (json.description.match(/^[✅🚫] /gm) || []).length;
    assert.strictEqual(enDescripcion, grupos, `con ${grupos} grupos solo se ven ${enDescripcion}`);
  }
});

console.log('\n── Límites de Discord');

test('la descripción no supera los 4096 caracteres', () => {
  for (const grupos of [25, 60]) {
    const json = buildOverviewPanel(makeTemplate(grupos, 3), {}, 'p1').embeds[0].toJSON();
    assert.ok(json.description.length <= 4096, `${grupos} grupos -> ${json.description.length}`);
  }
});

test('ningún campo supera los 1024 caracteres', () => {
  const { embeds } = buildOverviewPanel(makeTemplate(25, 3), {}, 'p1');
  for (const campo of embeds[0].toJSON().fields || []) {
    assert.ok(campo.value.length <= 1024, `campo "${campo.name}" con ${campo.value.length}`);
  }
});

test('el embed entero cabe en 6000 caracteres', () => {
  const json = buildOverviewPanel(makeTemplate(25, 5), {}, 'p1').embeds[0].toJSON();
  const total =
    (json.title || '').length +
    (json.description || '').length +
    (json.fields || []).reduce((suma, f) => suma + f.name.length + f.value.length, 0);
  assert.ok(total <= 6000, `total ${total}`);
});

test('no se superan los 25 campos', () => {
  const json = buildOverviewPanel(makeTemplate(25, 5), {}, 'p1').embeds[0].toJSON();
  assert.ok((json.fields || []).length <= 25, `${(json.fields || []).length} campos`);
});

test('nunca se parte una etiqueta de emoji por la mitad', () => {
  const json = buildOverviewPanel(makeTemplate(60, 3), {}, 'p1').embeds[0].toJSON();
  const textos = [json.description, ...(json.fields || []).map((f) => f.value)];
  for (const texto of textos) {
    const abiertas = (texto.match(/<:/g) || []).length;
    const cerradas = (texto.match(/:\d{17,20}>/g) || []).length;
    assert.strictEqual(abiertas, cerradas, 'etiquetas de emoji descuadradas');
  }
});

console.log('\n── Cuando ni así cabe, se avisa');

test('un template desmedido avisa de cuántos grupos faltan', () => {
  // 60 grupos con armas de nombre largo no caben en los 4096 de la descripción:
  // hay que decirlo, no callarlo.
  const template = makeTemplate(60, 4, 'Arma con un nombre bien largo para gastar sitio');
  const { description } = buildOverviewPanel(template, {}, 'p1').embeds[0].toJSON();
  assert.match(description, /…y \d+ más/);
});

test('si caben todos no aparece ningún aviso de recorte', () => {
  const { description } = buildOverviewPanel(makeTemplate(25), {}, 'p1').embeds[0].toJSON();
  assert.ok(!description.includes('…y '), 'avisa de un recorte que no ha hecho');
});

console.log('\n── Panel de un grupo: todas las armas salen listadas');

for (const armas of [1, 10, 25]) {
  test(`${armas} arma(s): aparecen las ${armas}`, () => {
    const template = makeTemplate(1, armas, 'Arma con un nombre bien largo para gastar sitio');
    const { embeds } = buildGroupPanel(template, {}, 'p1', 'group_0');
    const lineas = listLines(embeds[0], 'Armas').filter((l) => l.includes('`#'));
    assert.strictEqual(lineas.length, armas);
  });
}

test('el panel de grupo tampoco supera los 1024 por campo', () => {
  const template = makeTemplate(1, 25, 'Arma con un nombre bien largo para gastar sitio');
  for (const campo of buildGroupPanel(template, {}, 'p1', 'group_0').embeds[0].toJSON().fields) {
    assert.ok(campo.value.length <= 1024, `campo "${campo.name}" con ${campo.value.length}`);
  }
});

console.log('\n── Casos vacíos');

test('un template sin grupos no revienta', () => {
  const { embeds } = buildOverviewPanel({ title: 'T', weapons: {} }, {}, 'p1');
  assert.match(embeds[0].toJSON().description, /no tiene grupos/);
});

test('un grupo sin armas no revienta', () => {
  const template = { title: 'T', weapons: { group_0: { displayName: 'G', defaultEmoji: EMOJI, data: [] } } };
  const campos = listFields(buildGroupPanel(template, {}, 'p1', 'group_0').embeds[0], 'Armas');
  assert.strictEqual(campos.length, 1);
  assert.match(campos[0].value, /Sin armas/);
});

console.log(`\n${process.exitCode ? '❌ Fallos detectados' : `✅ ${passed} comprobaciones OK`}\n`);
