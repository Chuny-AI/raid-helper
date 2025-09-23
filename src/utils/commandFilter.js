const { shouldShowPremiumCommand, shouldShowOwnerCommand, shouldShowAdminCommand } = require('../middleware/commandVisibility');
const { checkAuthorizedUserAccess } = require('../middleware/roleCheck');
const { createPremiumEmbed, createErrorEmbed, safeReply } = require('./errorEmbeds');

const commandVisibilityMap = {
  'raid': 'premium_roles_admin',
  'templates': 'premium_roles_admin',
  'create_template': 'premium_roles_admin',
  'edit_template': 'premium_roles_admin',
  'upload_weapons': 'owner',
  'show_all_weapons': 'premium_roles_admin',
  'show_all_categories': 'premium_roles_admin',
  'roles': 'admin_owner',
  'premium': 'owner',
  'status': 'all',
  'migrate': 'premium_roles_admin',
  'economy': 'premium_roles_admin',
  'split': 'premium_only',
  'claim': 'premium_only',
  'claim-config': 'premium_roles_admin',
  'decode-file': 'decode_roles',
  'decode-users': 'owner'
};

const filterCommand = async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) {
      return true;
    }

    const commandName = interaction.commandName;
    const commandType = commandVisibilityMap[commandName];

    console.log(`[FILTER] Comando: ${commandName}, Tipo: ${commandType}`);

    if (!commandType) {
      console.log(`[FILTER] Comando ${commandName} no está en el mapa, permitiendo ejecución`);
      return true;
    }

    if (commandType === 'all') {
      console.log(`[FILTER] Comando ${commandName} es tipo 'all', permitiendo ejecución`);
      return true;
    }

    if (commandType === 'premium_only') {
      const hasPremium = await shouldShowPremiumCommand(interaction);
      console.log(`[FILTER] Comando ${commandName} es premium_only, ¿tiene premium?: ${hasPremium}`);
      if (!hasPremium) {
        const embed = createPremiumEmbed();
        await safeReply(interaction, { embeds: [embed], ephemeral: true });
        console.log(`[FILTER] Comando ${commandName} BLOQUEADO por falta de premium`);
        return false;
      }
      console.log(`[FILTER] Comando ${commandName} PERMITIDO (tiene premium)`);
      return true;
    }

    if (commandType === 'premium_roles_admin') {
      const hasPremium = await shouldShowPremiumCommand(interaction);
      console.log(`[FILTER] Comando ${commandName} es premium_roles_admin, ¿tiene premium?: ${hasPremium}`);

      // PRIMERA PRIORIDAD: Si NO tiene premium, mostrar SOLO mensaje de premium y BLOQUEAR
      if (!hasPremium) {
        try {
          const embed = createPremiumEmbed();
          await safeReply(interaction, { embeds: [embed], ephemeral: true });
          console.log(`[FILTER] Comando ${commandName} BLOQUEADO por falta de premium - mostrando mensaje premium`);
        } catch (error) {
          console.error(`[FILTER] Error enviando mensaje premium para ${commandName}:`, error);
        }
        // SIEMPRE bloquear independientemente de si el mensaje se envió o no
        return false;
      }

      // SEGUNDA PRIORIDAD: Si tiene premium, verificar admin/roles
      const isAdmin = await shouldShowAdminCommand(interaction);
      console.log(`[FILTER] Tiene premium, ¿es admin?: ${isAdmin}`);
      if (!isAdmin) {
        try {
          const embed = createErrorEmbed(
            "❌ Permisos Insuficientes",
            "Tienes acceso premium, pero este comando requiere permisos de administrador."
          );
          await safeReply(interaction, { embeds: [embed], ephemeral: true });
          console.log(`[FILTER] Comando ${commandName} BLOQUEADO por falta de roles de admin (pero tiene premium)`);
        } catch (error) {
          console.error(`[FILTER] Error enviando mensaje de admin para ${commandName}:`, error);
        }
        // SIEMPRE bloquear independientemente de si el mensaje se envió o no
        return false;
      }

      console.log(`[FILTER] Comando ${commandName} PERMITIDO (tiene premium y admin)`);
      return true;
    }

    if (commandType === 'decode_roles') {
      // Comandos de decode NO validan premium. Solo owner o usuarios autorizados.
      const hasDecodeAccess = await checkAuthorizedUserAccess(interaction);
      console.log(`[FILTER] Comando ${commandName} decode_roles, ¿autorizado?: ${hasDecodeAccess}`);
      if (!hasDecodeAccess) {
        const embed = createErrorEmbed(
          '❌ Acceso Denegado',
          'Este comando está restringido al propietario del bot o usuarios autorizados.'
        );
        await safeReply(interaction, { embeds: [embed], ephemeral: true });
        console.log(`[FILTER] Comando ${commandName} BLOQUEADO por falta de autorización decode`);
        return false;
      }
      console.log(`[FILTER] Comando ${commandName} PERMITIDO (decode autorizado)`);
      return true;
    }

    if (commandType === 'admin_owner') {
      console.log(`[FILTER] Comando ${commandName} es admin_owner`);

      // Verificar si es owner primero (acceso total)
      const isOwner = await shouldShowOwnerCommand(interaction);
      console.log(`[FILTER] ¿Es owner?: ${isOwner}`);
      if (isOwner) {
        console.log(`[FILTER] Comando ${commandName} PERMITIDO (es owner)`);
        return true;
      }

      // Si no es owner, verificar admin
      const isAdmin = await shouldShowAdminCommand(interaction);
      console.log(`[FILTER] No es owner, ¿es admin?: ${isAdmin}`);
      if (!isAdmin) {
        const embed = createErrorEmbed(
          "❌ Acceso Denegado",
          "Solo el propietario del bot y los administradores pueden usar este comando."
        );
        await safeReply(interaction, { embeds: [embed], ephemeral: true });
        console.log(`[FILTER] Comando ${commandName} BLOQUEADO por falta de permisos admin/owner`);
        return false;
      }

      console.log(`[FILTER] Comando ${commandName} PERMITIDO (es admin)`);
      return true;
    }

    if (commandType === 'owner') {
      console.log(`[FILTER] Comando ${commandName} es owner (solo propietario)`);
      const isOwner = await shouldShowOwnerCommand(interaction);
      console.log(`[FILTER] ¿Es owner?: ${isOwner}`);
      if (!isOwner) {
        const embed = createErrorEmbed(
          "❌ Acceso Denegado",
          "Solo el propietario del bot puede usar este comando."
        );
        await safeReply(interaction, { embeds: [embed], ephemeral: true });
        console.log(`[FILTER] Comando ${commandName} BLOQUEADO por no ser owner`);
        return false;
      }
      console.log(`[FILTER] Comando ${commandName} PERMITIDO (es owner)`);
      return true;
    }

    return true;

  } catch (error) {
    console.error('[ERROR] Error en filterCommand:', error);
    return true;
  }
};

module.exports = {
  filterCommand,
  commandVisibilityMap
};