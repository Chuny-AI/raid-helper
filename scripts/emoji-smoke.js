/** Prueba de humo de utils/emoji.js. No requiere BD ni bot. */
const assert = require('node:assert');
const { StringSelectMenuOptionBuilder } = require('discord.js');
const {
  isCustomEmojiId,
  parseCustomEmoji,
  formatEmoji,
  toComponentEmoji,
  applyEmoji,
} = require('../src/utils/emoji');

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

const ID = '1286453402837975040';    // 19 dígitos, caso normal
const ID20 = '12864534028379750401'; // 20 dígitos, snowflake futuro

console.log('\n── Detección de IDs');
test('Un ID de 19 dígitos es un emoji personalizado', () => {
  assert.strictEqual(isCustomEmojiId(ID), true);
});
test('Un ID de 20 dígitos también (snowflakes futuros)', () => {
  assert.strictEqual(isCustomEmojiId(ID20), true);
});
test('Un número corto no es un ID de emoji', () => {
  assert.strictEqual(isCustomEmojiId('123'), false);
});
test('Un emoji Unicode no es un ID', () => {
  assert.strictEqual(isCustomEmojiId('⚔️'), false);
});
test('parseCustomEmoji extrae el ID de un tag', () => {
  assert.deepStrictEqual(parseCustomEmoji(`<a:baile:${ID}>`), {
    id: ID, name: 'baile', animated: true,
  });
});
test('parseCustomEmoji devuelve null para Unicode', () => {
  assert.strictEqual(parseCustomEmoji('⚔️'), null);
});

console.log('\n── Formato para texto');
test('Un ID suelto se envuelve en un tag válido', () => {
  assert.strictEqual(formatEmoji(ID), `<:weapon:${ID}>`);
});
test('Un tag ya válido se respeta tal cual', () => {
  assert.strictEqual(formatEmoji(`<:daga:${ID}>`), `<:daga:${ID}>`);
});
test('Un tag animado conserva la marca de animación', () => {
  assert.strictEqual(formatEmoji(`<a:baile:${ID}>`), `<a:baile:${ID}>`);
});
test('Un emoji Unicode pasa sin tocarse', () => {
  assert.strictEqual(formatEmoji('⚔️'), '⚔️');
});
test('Sin emoji se devuelve el fallback', () => {
  assert.strictEqual(formatEmoji(null, '•'), '•');
  assert.strictEqual(formatEmoji('', '•'), '•');
  assert.strictEqual(formatEmoji(undefined, '•'), '•');
});
test('Una entrada no-string no revienta', () => {
  // Antes se llamaba a .length/.match/.startsWith directamente sobre el valor.
  assert.doesNotThrow(() => formatEmoji(12345678901234567890));
  assert.doesNotThrow(() => formatEmoji([]));
});

console.log('\n── Regresión: tags con nombre de 1 carácter');
// Discord exige \w{2,32} en el nombre del emoji. Los formatos <:w:ID> y
// <:e:ID> que usaba el bot se mostraban literales en los embeds y hacían
// reventar setEmoji() con "Expected the value to not be null".
test('Un tag <:w:ID> se rescata a un tag válido', () => {
  assert.strictEqual(formatEmoji(`<:w:${ID}>`), `<:weapon:${ID}>`);
});
test('Un tag <:e:ID> se rescata a un tag válido', () => {
  assert.strictEqual(formatEmoji(`<:e:${ID}>`), `<:weapon:${ID}>`);
});
test('El tag generado siempre cumple el formato de Discord', () => {
  for (const input of [ID, `<:w:${ID}>`, `<:e:${ID}>`, `<:${ID}:${ID}>`]) {
    assert.match(formatEmoji(input), /^<a?:\w{2,32}:\d{17,20}>$/, `entrada: ${input}`);
  }
});

console.log('\n── Objetos de emoji de discord.js');
test('Un objeto {id} se formatea como tag válido', () => {
  assert.strictEqual(formatEmoji({ id: ID }), `<:weapon:${ID}>`);
});
test('Un objeto animado conserva la animación y su nombre', () => {
  assert.strictEqual(formatEmoji({ id: ID, name: 'baile', animated: true }), `<a:baile:${ID}>`);
});
test('Un nombre inválido se sustituye por uno válido', () => {
  assert.strictEqual(formatEmoji({ id: ID, name: 'x' }), `<:weapon:${ID}>`);
});
test('Un objeto solo con nombre Unicode se respeta', () => {
  assert.strictEqual(formatEmoji({ name: '⚔️' }), '⚔️');
});
test('Un objeto vacío cae al fallback, no a [object Object]', () => {
  assert.strictEqual(formatEmoji({}, '•'), '•');
});

console.log('\n── Valor para componentes');
test('Un ID suelto se convierte a objeto {id}', () => {
  assert.deepStrictEqual(toComponentEmoji(ID), { id: ID, animated: false });
});
test('Un ID de 20 dígitos no se degrada a nombre', () => {
  // setEmoji('<20 dígitos>') lo trataba como nombre Unicode en silencio.
  assert.deepStrictEqual(toComponentEmoji(ID20), { id: ID20, animated: false });
});
test('Un emoji Unicode se pasa como string', () => {
  assert.strictEqual(toComponentEmoji('⚔️'), '⚔️');
});
test('Sin emoji se devuelve undefined', () => {
  assert.strictEqual(toComponentEmoji(null), undefined);
  assert.strictEqual(toComponentEmoji(''), undefined);
});

console.log('\n── Aplicación sobre builders reales');
const build = (emoji) => {
  const opt = new StringSelectMenuOptionBuilder().setLabel('x').setValue('x');
  applyEmoji(opt, emoji);
  return opt.toJSON().emoji;
};
test('Un ID suelto queda aplicado', () => {
  assert.strictEqual(build(ID).id, ID);
});
test('Un tag <:w:ID> ya no revienta el builder', () => {
  assert.strictEqual(build(`<:w:${ID}>`).id, ID);
});
test('Un emoji Unicode queda aplicado por nombre', () => {
  assert.strictEqual(build('⚔️').name, '⚔️');
});
test('Sin emoji el builder queda sin emoji, no falla', () => {
  assert.strictEqual(build(null), undefined);
});
test('Una entrada corrupta no tumba la construcción', () => {
  assert.doesNotThrow(() => build('<:::>'));
  assert.doesNotThrow(() => build({}));
});

console.log(`\n✅ ${passed} comprobaciones OK\n`);
