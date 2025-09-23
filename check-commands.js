/**
 * Script para verificar todos los comandos registrados del bot
 * Muestra comandos globales y comandos de servidor específico
 */

const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const rest = new REST({ version: '10' }).setToken(token);

async function checkCommands() {
  try {
    console.log('🔍 Verificando comandos del bot...');
    console.log('='.repeat(50));

    console.log('\n📡 COMANDOS GLOBALES:');
    const globalCommands = await rest.get(
      Routes.applicationCommands(clientId)
    );

    if (globalCommands.length === 0) {
      console.log('   ✅ No hay comandos globales registrados');
    } else {
      console.log(`   📊 Total: ${globalCommands.length} comandos`);
      globalCommands.forEach((command, index) => {
        console.log(`   ${index + 1}. ${command.name} - ${command.description}`);
      });
    }

    if (guildId) {
      console.log('\n🏠 COMANDOS DEL SERVIDOR ESPECÍFICO:');
      const guildCommands = await rest.get(
        Routes.applicationGuildCommands(clientId, guildId)
      );

      if (guildCommands.length === 0) {
        console.log('   ✅ No hay comandos del servidor registrados');
      } else {
        console.log(`   📊 Total: ${guildCommands.length} comandos`);
        guildCommands.forEach((command, index) => {
          console.log(`   ${index + 1}. ${command.name} - ${command.description}`);
        });
      }
    } else {
      console.log('\n🏠 COMANDOS DEL SERVIDOR ESPECÍFICO:');
      console.log('   ⚠️  GUILD_ID no configurado en .env');
    }

    console.log('\n📋 RESUMEN:');
    console.log(`   • Comandos Globales: ${globalCommands.length}`);
    if (guildId) {
      const guildCommands = await rest.get(
        Routes.applicationGuildCommands(clientId, guildId)
      );
      console.log(`   • Comandos de Servidor: ${guildCommands.length}`);

      if (globalCommands.length > 0 && guildCommands.length > 0) {
        console.log('\n⚠️  ADVERTENCIA: Tienes comandos duplicados!');
        console.log('💡 Considera eliminar los comandos globales con: npm run delete-global');
      }
    }

    console.log('\n💡 Información adicional:');
    console.log('   • Los comandos globales aparecen en TODOS los servidores');
    console.log('   • Los comandos de servidor solo aparecen en ese servidor específico');
    console.log('   • Si tienes ambos, verás comandos duplicados');

  } catch (error) {
    console.error('❌ Error verificando comandos:', error);

    if (error.code === 50001) {
      console.error('💡 Error: El bot no tiene permisos. Verifica el token y CLIENT_ID.');
    } else if (error.code === 10002) {
      console.error('💡 Error: CLIENT_ID inválido.');
    } else if (error.code === 50035) {
      console.error('💡 Error: GUILD_ID inválido.');
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

checkCommands();
