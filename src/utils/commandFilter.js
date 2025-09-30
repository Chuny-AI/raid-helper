const { createErrorEmbed, safeReply, createPremiumEmbed, getPremiumCTAComponents } = require('./errorEmbeds');
const { evaluatePolicy, formatPolicyRequirement } = require('../middleware/permissionPolicy');
const { isServerPremium } = require('../services/serverService');

// Política dinámica: ['a','b'] = a AND b; [['a','b']] = a OR b
const permissionsConfig = {
  raid: ['premium', ['admin', 'authorizedroles']],
  template: { default: ['premium', ['admin', 'authorizedroles']] },
  roles: ['premium', 'admin'],
  guilds: ['premium', 'admin'],
  status: ['premium', ['admin', 'guildsroles']],
  economy: { default: ['premium', ['admin', 'economyroles']], subcommands: { balance: ['premium', ['admin', 'guildsroles']], top: ['premium', ['admin', 'guildsroles']] } },
  'economy-roles': ['premium', 'admin'],
  split: ['premium', ['admin', 'guildsroles']],
  claim: { default: ['premium', ['admin', 'guildsroles']], subcommands: { setup: ['premium', 'admin'] } },
  'decode': ['premium', 'authorizedusers'],
  show_all_weapons: ['premium', ['admin', 'guildsroles']],
  show_all_categories: ['premium', ['admin', 'guildsroles']]
};

const filterCommand = async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) {
      return true;
    }

    const commandName = interaction.commandName;

    // Pre-chequeo universal de premium (todos los comandos lo requieren)
    const hasPremium = await isServerPremium(interaction.guild.id);
    if (!hasPremium) {
      const embed = createPremiumEmbed();
      const components = getPremiumCTAComponents();
      await safeReply(interaction, { embeds: [embed], components, ephemeral: true });
      console.log(`[FILTER] Comando ${commandName} BLOQUEADO: servidor sin premium`);
      return false;
    }

    // Evaluación dinámica basada en configuración
    let policy = permissionsConfig[commandName];
    let subcommand = null;
    try { subcommand = interaction.options.getSubcommand(); } catch (_) {}

    if (policy && typeof policy === 'object' && !Array.isArray(policy)) {
      const { default: defaultPolicy, subcommands } = policy;
      policy = (subcommands && subcommands[subcommand]) || defaultPolicy;
    }

    if (!policy) {
      console.log(`[FILTER] Comando ${commandName} sin política definida, permitiendo ejecución`);
      return true;
    }

    const allowed = await evaluatePolicy(interaction, policy);
    if (!allowed) {
      const requirementText = formatPolicyRequirement(policy);
      const embed = createErrorEmbed('Acceso Denegado', `Requiere: ${requirementText}`);
      await safeReply(interaction, { embeds: [embed], ephemeral: true });
      console.log(`[FILTER] Comando ${commandName}${subcommand ? ' ' + subcommand : ''} BLOQUEADO. Requiere: ${requirementText}`);
      return false;
    }

    console.log(`[FILTER] Comando ${commandName}${subcommand ? ' ' + subcommand : ''} PERMITIDO por política dinámica`);
    return true;
  } catch (error) {
    console.error('[FILTER] Error en filterCommand:', error);
    return true; // Permitir por defecto para evitar bloquear todo por un error
  }
};

module.exports = { filterCommand };