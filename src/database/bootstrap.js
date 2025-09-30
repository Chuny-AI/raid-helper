const Server = require('../database/models/Server');
const Template = require('../database/models/Template');
const AuthorizedRole = require('../database/models/AuthorizedRole');
const AuthorizedUser = require('../database/models/AuthorizedUser');
const EconomyRole = require('../database/models/EconomyRole');
const UserBalance = require('../database/models/UserBalance');
const Claim = require('../database/models/Claim');
const ClaimChannelConfig = require('../database/models/ClaimChannelConfig');
const RaidEvent = require('../database/models/RaidEvent');
const Weapon = require('../database/models/Weapon');
const UserCategory = require('../database/models/UserCategory');

/**
 * Crea las colecciones en MongoDB si no existen.
 * Útil para entornos nuevos y para asegurar índices iniciales.
 */
const ensureCollections = async () => {
  const models = [
    Server,
    Template,
    AuthorizedRole,
    AuthorizedUser,
    EconomyRole,
    UserBalance,
    Claim,
    ClaimChannelConfig,
    RaidEvent,
    Weapon,
    UserCategory
  ];

  for (const model of models) {
    try {
      await model.createCollection();
      // Nota: createCollection no recrea si existe; asegura la presencia.
      // Opcionalmente se pueden crear índices aquí si fuese necesario.
    } catch (err) {
      // Si la colección ya existe o no se puede crear, continuar sin romper.
      if (err && err.codeName !== 'NamespaceExists') {
        console.warn(`[BOOTSTRAP] No se pudo asegurar colección ${model.collection.name}: ${err.message}`);
      }
    }
  }
};

module.exports = { ensureCollections };