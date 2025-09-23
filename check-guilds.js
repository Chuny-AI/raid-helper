const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

async function checkGuilds() {
  try {
    console.log('[INFO] Iniciando verificación de servidores...');
    
    const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
    await client.login(token);
    
    await new Promise(resolve => {
      client.once('ready', resolve);
    });
    
    console.log(`[SUCCESS] Bot conectado como ${client.user.tag}`);
    console.log(`[INFO] Servidores donde el bot está presente:`);
    
    client.guilds.cache.forEach((guild, id) => {
      console.log(`  - ${guild.name} (ID: ${id})`);
    });
    
    console.log(`\n[INFO] Total de servidores: ${client.guilds.cache.size}`);
    
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        console.log(`\n[SUCCESS] El servidor configurado (${guildId}) está disponible: ${guild.name}`);
        
        const botMember = guild.members.cache.get(client.user.id);
        if (botMember) {
          console.log(`[INFO] Permisos del bot en ${guild.name}:`);
          console.log(`  - Administrador: ${botMember.permissions.has('Administrator')}`);
          console.log(`  - Gestionar Servidor: ${botMember.permissions.has('ManageGuild')}`);
          console.log(`  - Enviar Mensajes: ${botMember.permissions.has('SendMessages')}`);
        }
      } else {
        console.log(`\n[ERROR] El servidor configurado (${guildId}) NO está disponible`);
        console.log(`[INFO] Servidores disponibles:`);
        client.guilds.cache.forEach((guild, id) => {
          console.log(`  - ${guild.name} (ID: ${id})`);
        });
      }
    }
    
  } catch (error) {
    console.error('[ERROR] Error verificando servidores:', error);
  } finally {
    client.destroy();
  }
}

checkGuilds();
