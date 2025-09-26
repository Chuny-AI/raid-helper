/**
 * Ejemplo de integración del sistema de templates en el bot principal
 * Este archivo muestra cómo integrar todos los components del sistema
 */

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { handleTemplateInteractions } = require('./src/middleware/templateInteractionMiddleware');

// Crear el cliente
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Colección de comandos
client.commands = new Collection();

// Cargar comandos de templates
const templateCommands = [
  require('./src/commands/utility/template-create'),
  require('./src/commands/utility/template-edit'),
  require('./src/commands/utility/template-delete'),
  require('./src/commands/utility/template-clone'),
  // ... otros comandos existentes
];

// Registrar comandos
for (const command of templateCommands) {
  client.commands.set(command.data.name, command);
}

// Event handler principal para interactions
client.on('interactionCreate', async (interaction) => {
  try {
    // 1. PRIORIDAD: Manejar interactions de templates
    const templateHandled = await handleTemplateInteractions(interaction);
    if (templateHandled) {
      return; // Si fue manejada por templates, terminar aquí
    }

    // 2. Manejar comandos slash
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      await command.execute(interaction);
      return;
    }

    // 3. Manejar autocomplete
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);

      if (command && command.autocomplete) {
        await command.autocomplete(interaction);
      }
      return;
    }

    // 4. Otros tipos de interactions (botones, modales, etc. no relacionados con templates)
    if (interaction.isButton()) {
      await handleOtherButtons(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleOtherModals(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleOtherSelectMenus(interaction);
    }

  } catch (error) {
    console.error('[ERROR] Error in interactionCreate:', error);

    // Manejo de errores robusto
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: 'Ocurrió un error al procesar tu solicitud.',
          ephemeral: true
        });
      } catch (replyError) {
        console.error('[ERROR] Could not reply to interaction:', replyError);
      }
    }
  }
});

// Handlers para otras interactions no relacionadas con templates
async function handleOtherButtons(interaction) {
  // Tu lógica existente para botones
  console.log('Handling non-template button:', interaction.customId);
}

async function handleOtherModals(interaction) {
  // Tu lógica existente para modales
  console.log('Handling non-template modal:', interaction.customId);
}

async function handleOtherSelectMenus(interaction) {
  // Tu lógica existente para select menus
  console.log('Handling non-template select menu:', interaction.customId);
}

// Ready event
client.once('ready', () => {
  console.log('✅ Bot is ready!');
  console.log('📝 Template system integrated and ready');
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// Error handling
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Login (reemplazar con tu token)
// client.login(process.env.DISCORD_TOKEN);

module.exports = { client };