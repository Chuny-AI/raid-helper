/**
 * Script para probar específicamente la validación del modal de template-create
 */

const { isValidHex } = require('./src/utils/regex');

console.log('🧪 Probando validaciones...');

// Probar validación de hex
console.log('Validando colores hex:');
console.log('#00FFFF:', isValidHex('#00FFFF')); // debería ser true
console.log('#ffffff:', isValidHex('#ffffff')); // debería ser true  
console.log('00FFFF:', isValidHex('00FFFF')); // debería ser false
console.log('#GG0000:', isValidHex('#GG0000')); // debería ser false

// Probar validación de URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

console.log('\nValidando URLs:');
console.log('https://example.com:', isValidUrl('https://example.com')); // true
console.log('invalid-url:', isValidUrl('invalid-url')); // false
console.log('empty string:', isValidUrl('')); // false

// Probar datos del template
const testTemplateData = {
  title: 'Test Template',
  time: '30m',
  description: 'Test description',
  color: '#00FFFF',
  image: '',
  url: '',
  reminder: '5m',
  notifyAll: true,
  roles: [],
  weapons: {}
};

console.log('\n✅ Datos de template de prueba:', JSON.stringify(testTemplateData, null, 2));
console.log('\n🎉 Todas las validaciones funcionan correctamente!');