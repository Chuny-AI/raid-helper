#!/usr/bin/env node
/**
 * Smoke test del decodificador de calabozos.
 *
 * Cubre la reescritura de `decode`, que dejó de construir un regex por jefe
 * (`jefe.*?layer(\d{1,2})`, coste cuadrático y patrón formado por concatenación)
 * y pasó a localizar el jefe con indexOf. El resultado debe ser idéntico al de
 * antes, así que aquí se compara contra la implementación original.
 *
 * No necesita BD ni bot. Uso: node scripts/dungeon-decoder-smoke.js
 */

const assert = require('node:assert');

const DungeonDecoder = require('../src/services/dungeonDecoder');
const { bosses } = require('../src/utils/dungeonConfig');
const { cleanText } = require('../src/utils/textDecoder');

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

/** Implementación anterior, como referencia de comportamiento. */
const decodeLegacy = (texto) => {
  const cleanedText = cleanText(texto.toLowerCase());
  const out = [];
  Object.keys(bosses).forEach((boss) => {
    const regex = new RegExp(`${boss}.*?layer(\\d{1,2})`, 'gi');
    let match;
    while ((match = regex.exec(cleanedText)) !== null) {
      out.push({
        name: bosses[boss].name,
        position: match.index,
        layer: parseInt(match[1], 10),
        color: bosses[boss][parseInt(match[1], 10)],
        bossKey: boss,
      });
    }
  });
  return out.sort((a, b) => (a.position || 0) - (b.position || 0));
};

/** Codifica texto plano a la cadena hexadecimal que espera el decodificador. */
const toHex = (texto) => Buffer.from(texto, 'latin1').toString('hex');

console.log('\n── Equivalencia con la implementación anterior');

const casos = [
  ['un jefe', 'construct layer7'],
  ['dos jefes en orden', 'construct layer7 archmage layer9'],
  ['el mismo jefe repetido', 'priest layer6 priest layer8'],
  ['ruido entre jefe y capa', 'construct xxx yyy zzz layer8'],
  ['jefe sin capa detrás', 'construct sin nada mas'],
  ['capa suelta sin jefe', 'layer7 layer8'],
  ['texto sin jefes', 'aqui no hay nada relevante 1234'],
  ['capa de dos dígitos', 'knightcaptain layer10'],
  ['todos los jefes seguidos', Object.keys(bosses).map((b, i) => `${b} layer${(i % 4) + 6}`).join(' ')],
];

for (const [nombre, texto] of casos) {
  test(nombre, () => {
    assert.deepStrictEqual(DungeonDecoder.decode(toHex(texto)), decodeLegacy(texto));
  });
}

console.log('\n── Resultado del decodificado');

test('devuelve nombre, capa y color del jefe', () => {
  const [primero] = DungeonDecoder.decode(toHex('construct layer7'));
  assert.strictEqual(primero.name, bosses.construct.name);
  assert.strictEqual(primero.layer, 7);
  assert.strictEqual(primero.color, bosses.construct[7]);
  assert.strictEqual(primero.bossKey, 'construct');
});

test('ordena los jefes por su posición en el texto', () => {
  const res = DungeonDecoder.decode(toHex('archmage layer6 construct layer7'));
  assert.deepStrictEqual(res.map((b) => b.bossKey), ['archmage', 'construct']);
});

console.log('\n── Límite de tamaño');

test('acepta una entrada hexadecimal normal', () => {
  assert.strictEqual(DungeonDecoder.isValidHexData(toHex('construct layer7')), true);
});

test('rechaza una entrada por encima del máximo', () => {
  const gigante = 'ab'.repeat(DungeonDecoder.MAX_HEX_LENGTH); // el doble del tope
  assert.strictEqual(DungeonDecoder.isValidHexData(gigante), false);
});

test('el tope no invalida una entrada justo por debajo', () => {
  const alRas = 'ab'.repeat(DungeonDecoder.MAX_HEX_LENGTH / 2);
  assert.strictEqual(alRas.length, DungeonDecoder.MAX_HEX_LENGTH);
  assert.strictEqual(DungeonDecoder.isValidHexData(alRas), true);
});

test('sigue rechazando lo que no es hexadecimal', () => {
  assert.strictEqual(DungeonDecoder.isValidHexData('zzzzzzzzzz'), false);
  assert.strictEqual(DungeonDecoder.isValidHexData('abc'), false); // longitud impar
  assert.strictEqual(DungeonDecoder.isValidHexData(''), false);
});

console.log('\n── Coste');

test('un texto largo sin capas no se dispara en tiempo', () => {
  // El patrón antiguo recorría el texto entero desde cada aparición del jefe.
  const texto = `${'construct '.repeat(3000)}fin`;
  const inicio = Date.now();
  DungeonDecoder.decode(toHex(texto));
  const ms = Date.now() - inicio;
  assert.ok(ms < 1000, `tardó ${ms}ms`);
});

console.log(`\n${process.exitCode ? '❌ Fallos detectados' : `✅ ${passed} comprobaciones OK`}\n`);
