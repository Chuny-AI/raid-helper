const { SlashCommandBuilder } = require("discord.js");

/**
 * Comando básico de ping para verificar la latencia del bot
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("latency")
    .setDescription("Verifica la latencia del bot"),

  async execute(interaction) {
    const sent = await interaction.reply({ 
      content: 'Pinging...', 
      fetchReply: true 
    });
    
    const roundtripLatency = sent.createdTimestamp - interaction.createdTimestamp;
    const websocketHeartbeat = interaction.client.ws.ping;

    await interaction.editReply(
      `🏓 **Pong!**\n` +
      `📡 **Latencia de ida y vuelta:** ${roundtripLatency}ms\n` +
      `💓 **Latencia del WebSocket:** ${websocketHeartbeat}ms`
    );
  },
};
