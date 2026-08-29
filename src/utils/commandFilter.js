const { createErrorEmbed, safeReply } = require('./errorEmbeds');
const { evaluatePolicy, formatPolicyRequirement } = require('../middleware/permissionPolicy');

// Política dinámica: ['a','b'] = a AND b; [['a','b']] = a OR b
const permissionsConfig = {
  raid: [['admin', 'authorizedroles']],
  template: { default: [['admin', 'authorizedroles']] },
  roles: ['admin'],
  status: ['admin'],
  split: [['admin', 'authorizedroles']],
  notify: [['admin', 'authorizedroles']],
  show_all_weapons: [['admin', 'authorizedroles']],
  show_all_categories: [['admin', 'authorizedroles']]
};

// Comandos que gestionan sus propios permisos internamente (no requieren política en el filtro)
const selfManagedCommands = new Set(['eco']);

const filterCommand = async (interaction) => {
  let commandName = null;
  try {
    if (!interaction.isChatInputCommand()) {
      return true;
    }

    commandName = interaction.commandName;

    // Evaluación dinámica basada en configuración
    let policy = permissionsConfig[commandName];
    let subcommand = null;
    try { subcommand = interaction.options.getSubcommand(); } catch (_) {}

    if (policy && typeof policy === 'object' && !Array.isArray(policy)) {
      const { default: defaultPolicy, subcommands } = policy;
      policy = (subcommands && subcommands[subcommand]) || defaultPolicy;
    }

    if (!policy) {
      if (!selfManagedCommands.has(commandName)) {
        console.log(`[FILTER] Comando ${commandName} sin política definida, permitiendo ejecución`);
      }
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
    // Fail-closed en los comandos con política: si no se ha podido comprobar el
    // permiso, no se ejecuta. Antes se devolvía `true` siempre, con lo que
    // cualquier fallo (BD caída, error leyendo roles) se convertía en un bypass
    // de la política. Los comandos sin política siguen permitidos: son públicos
    // y bloquearlos aquí solo rompería el bot sin ganar nada.
    if (commandName && permissionsConfig[commandName]) {
      try {
        const embed = createErrorEmbed(
          'Acceso Denegado',
          'No se pudieron verificar tus permisos para este comando. Inténtalo de nuevo en unos segundos.'
        );
        await safeReply(interaction, { embeds: [embed], ephemeral: true });
      } catch (_) { /* la interacción puede haber expirado */ }
      return false;
    }
    return true;
  }
};

module.exports = { filterCommand };