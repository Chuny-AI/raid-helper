#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Configurando Avalon Raid Helper...\n');

// Verificar si existe .env
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('📝 Creando archivo .env...');
  const envExample = fs.readFileSync(path.join(__dirname, 'env.example'), 'utf8');
  fs.writeFileSync(envPath, envExample);
  console.log('✅ Archivo .env creado. Por favor, edita las variables de entorno.');
} else {
  console.log('✅ Archivo .env ya existe.');
}

// Verificar dependencias
console.log('\n📦 Verificando dependencias...');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const requiredDeps = ['discord.js', 'mongoose'];

for (const dep of requiredDeps) {
  if (packageJson.dependencies[dep]) {
    console.log(`✅ ${dep} está instalado`);
  } else {
    console.log(`❌ ${dep} no está instalado`);
  }
}

console.log('\n🎯 Próximos pasos:');
console.log('1. Edita el archivo .env con tu TOKEN y CLIENT_ID de Discord');
console.log('2. Asegúrate de que MongoDB esté ejecutándose');
console.log('3. Ejecuta: npm run commands (para registrar comandos globales)');
console.log('4. Ejecuta: npm start (para iniciar el bot)');
console.log('\n✨ ¡Configuración completada!');
