const Server = require('../database/models/Server');
const Template = require('../database/models/Template');
const AuthorizedRole = require('../database/models/AuthorizedRole');
const RaidEvent = require('../database/models/RaidEvent');
const Weapon = require('../database/models/Weapon');
const NotifyEvent = require('../database/models/NotifyEvent');
const EconomyBalance = require('../database/models/economy/EconomyBalance');
const EconomyTransaction = require('../database/models/economy/EconomyTransaction');
const EconomyRole = require('../database/models/economy/EconomyRole');
const EconomyLogChannel = require('../database/models/economy/EconomyLogChannel');
const EconomyContext = require('../database/models/economy/EconomyContext');
const AuthorizedUser = require('../database/models/AuthorizedUser');
const UserCategory = require('../database/models/UserCategory');
const MemberLogConfig = require('../database/models/MemberLogConfig');
const MemberIdentity = require('../database/models/MemberIdentity');
const TemporaryVoiceConfig = require('../database/models/TemporaryVoiceConfig');
const TemporaryVoiceChannel = require('../database/models/TemporaryVoiceChannel');
const AlbionRegistrationConfig = require('../database/models/AlbionRegistrationConfig');
const AlbionMembershipRule = require('../database/models/AlbionMembershipRule');
const AlbionRegistration = require('../database/models/AlbionRegistration');
const UtcClockConfig = require('../database/models/UtcClockConfig');

/**
 * Crea las colecciones en MongoDB si no existen.
 * Útil para entornos nuevos y para asegurar índices iniciales.
 */
const ensureCollections = async () => {
  const models = [
    Server,
    Template,
    AuthorizedRole,
    RaidEvent,
    Weapon,
    NotifyEvent,
    EconomyBalance,
    EconomyTransaction,
    EconomyRole,
    EconomyLogChannel,
    EconomyContext,
    AuthorizedUser,
    UserCategory,
    MemberLogConfig,
    MemberIdentity,
    TemporaryVoiceConfig,
    TemporaryVoiceChannel,
    AlbionRegistrationConfig,
    AlbionMembershipRule,
    AlbionRegistration,
    UtcClockConfig,
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

  // Las entradas antiguas no incluyen canal y no se pueden asignar con
  // seguridad a uno. Se conservan en MongoDB, pero las consultas nuevas siempre
  // exigen channelId. Retirar índices globales permite el mismo usuario o
  // contexto en varios canales sin colisiones.
  const legacyIndexes = [
    [EconomyBalance, [['guildId', 'userId'], ['guildId', 'contextId', 'userId']]],
    [EconomyContext, [['guildId', 'slug']]],
    [EconomyLogChannel, [['guildId']]],
  ];
  for (const [model, legacyKeySets] of legacyIndexes) {
    for (const index of await model.collection.indexes()) {
      if (!index.unique) continue;
      if (legacyKeySets.some((keys) => JSON.stringify(Object.keys(index.key)) === JSON.stringify(keys))) {
        await model.collection.dropIndex(index.name);
      }
    }
  }
  await EconomyBalance.createIndexes();
  await EconomyTransaction.createIndexes();
  await EconomyContext.createIndexes();
  await EconomyLogChannel.createIndexes();
  await MemberLogConfig.createIndexes();
  await MemberIdentity.createIndexes();
  await TemporaryVoiceConfig.createIndexes();
  await TemporaryVoiceChannel.createIndexes();
  await AlbionRegistrationConfig.createIndexes();
  await AlbionMembershipRule.createIndexes();
  await AlbionRegistration.createIndexes();
  await UtcClockConfig.createIndexes();
};

module.exports = { ensureCollections };
