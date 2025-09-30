const { shouldShowAdminCommand } = require('./commandVisibility');
const { checkAuthorizedRole, checkAuthorizedUserAccess, checkEconomyPermission } = require('./roleCheck');
const { isServerPremium } = require('../services/serverService');
const { isMemberInGuildRoles } = require('../services/guildRoleService');

// Checkers por política estándar
const policyCheckers = {
  premium: async (interaction) => {
    try { return await isServerPremium(interaction.guild.id); } catch (_) { return false; }
  },
  admin: async (interaction) => {
    try { return await shouldShowAdminCommand(interaction); } catch (_) { return false; }
  },
  authorizedroles: async (interaction) => {
    try { return await checkAuthorizedRole(interaction); } catch (_) { return false; }
  },
  guildsroles: async (interaction) => {
    try { return await isMemberInGuildRoles(interaction.member); } catch (_) { return false; }
  },
  authorizedusers: async (interaction) => {
    try { return await checkAuthorizedUserAccess(interaction); } catch (_) { return false; }
  },
  economyroles: async (interaction) => {
    try { return await checkEconomyPermission(interaction); } catch (_) { return false; }
  },
  all: async () => true,
};

// Evalúa una política: strings = AND; arrays anidadas = OR
const evaluatePolicy = async (interaction, policyDef) => {
  if (!policyDef) return true;

  if (typeof policyDef === 'string') {
    const checker = policyCheckers[policyDef];
    return checker ? await checker(interaction) : true;
  }

  if (Array.isArray(policyDef)) {
    for (const item of policyDef) {
      if (Array.isArray(item)) {
        let any = false;
        for (const inner of item) {
          const checker = policyCheckers[inner];
          if (checker && await checker(interaction)) { any = true; break; }
        }
        if (!any) return false;
      } else {
        const checker = policyCheckers[item];
        if (checker && !await checker(interaction)) return false;
      }
    }
    return true;
  }

  return true;
};

// Etiquetas legibles
const labels = {
  premium: 'Permisos de premium',
  admin: 'Administradores del servidor',
  authorizedroles: 'Creadores de contenido',
  guildsroles: 'Permisos de gremios y alianzas',
  authorizedusers: 'Permisos de scanner',
  economyroles: 'Permisos de economía',
  all: 'Permisos para todo el mundo si hay premium',
};

const formatPolicyRequirement = (policyDef) => {
  if (!policyDef) return 'Sin restricciones';
  if (typeof policyDef === 'string') return labels[policyDef] || policyDef;
  if (Array.isArray(policyDef)) {
    const parts = policyDef.map(item => {
      if (Array.isArray(item)) {
        return `(${item.map(i => labels[i] || i).join(' o ')})`;
      } else {
        return labels[item] || item;
      }
    });
    return parts.join(' + ');
  }
  return 'Política desconocida';
};

module.exports = { evaluatePolicy, formatPolicyRequirement };