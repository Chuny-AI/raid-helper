const { shouldShowAdminCommand } = require('./commandVisibility');
const { checkAuthorizedRole } = require('./roleCheck');

// Checkers por política estándar
const policyCheckers = {
  admin: async (interaction) => {
    try { return await shouldShowAdminCommand(interaction); } catch (_) { return false; }
  },
  authorizedroles: async (interaction) => {
    try { return await checkAuthorizedRole(interaction); } catch (_) { return false; }
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
  admin: 'Administradores del servidor',
  authorizedroles: 'Creadores de contenido',
  all: 'Permisos para todo el mundo',
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