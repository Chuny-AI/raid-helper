/**
 * Script para eliminar todos los comandos globales del bot de Discord
 * Esto evitará que aparezcan comandos duplicados en servidores específicos
 */

const { REST, Routes } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

const rest = new REST({ version: '10' }).setToken(token);

async function deleteGlobalCommands() {
  try {
    console.log('🔄 Obteniendo comandos globales actuales...');

    const globalCommands = await rest.get(
      Routes.applicationCommands(clientId)
    );

    console.log(`📋 Comandos globales encontrados: ${globalCommands.length}`);

    if (globalCommands.length === 0) {
      console.log('✅ No hay comandos globales para eliminar.');
      return;
    }

    console.log('\n📝 Comandos que serán eliminados:');
    globalCommands.forEach((command, index) => {
      console.log(`   ${index + 1}. ${command.name} - ${command.description}`);
    });

    console.log('\n⚠️  ADVERTENCIA: Esto eliminará TODOS los comandos globales del bot');
    console.log('🔄 Iniciando eliminación...');

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }
    );

    console.log('✅ ¡Todos los comandos globales han sido eliminados exitosamente!');
    console.log('📝 Notas importantes:');
    console.log('   • Los comandos del servidor específico seguirán funcionando');
    console.log('   • Ya no verás comandos duplicados');
    console.log('   • Los cambios pueden tardar hasta 1 hora en aplicarse completamente');

  } catch (error) {
    console.error('❌ Error eliminando comandos globales:', error);

    if (error.code === 50001) {
      console.error('💡 Error: El bot no tiene permisos. Verifica el token y CLIENT_ID.');
    } else if (error.code === 10002) {
      console.error('💡 Error: CLIENT_ID inválido.');
    }
  }
}

if (!token) {
  console.error('❌ Error: Variable DISCORD_TOKEN o TOKEN no encontrada');
  console.error('💡 Asegúrate de tener un archivo .env con DISCORD_TOKEN configurado');
  process.exit(1);
}

if (!clientId) {
  console.error('❌ Error: Variable CLIENT_ID no encontrada');
  console.error('💡 Asegúrate de tener un archivo .env con CLIENT_ID configurado');
  process.exit(1);
}

deleteGlobalCommands();
