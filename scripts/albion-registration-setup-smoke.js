const assert = require('node:assert/strict');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const Config = require('../src/database/models/AlbionRegistrationConfig');
const Rule = require('../src/database/models/AlbionMembershipRule');
const Registration = require('../src/database/models/AlbionRegistration');
const api = require('../src/services/albionApiService');
const setup = require('../src/commands/utility/setup_registro');

const originals = {
  configFind: Config.findOne, configUpdate: Config.findOneAndUpdate,
  ruleFind: Rule.find, ruleFindOne: Rule.findOne, ruleCount: Rule.countDocuments, ruleUpdate: Rule.findOneAndUpdate,
  registrationCount: Registration.countDocuments, registrationUpdate: Registration.updateMany,
  apiFind: api.findGuildByName, error: console.error, now: Date.now,
};

(async () => {
  const guildId = '222222222222222222';
  const userId = '111111111111111111';
  const roleId = '333333333333333333';
  const invalidRoleId = '444444444444444444';
  const roles = new Map([
    [roleId, { id: roleId, position: 1, name: 'Miembro' }],
    [invalidRoleId, { id: invalidRoleId, position: 15, name: 'Administrador' }],
  ]);
  const bot = { permissions: { has: () => true }, roles: { highest: { position: 10 } } };
  const audit = { id: '555555555555555555', send: async () => {}, permissionsFor: () => ({ has: () => true }) };
  const guild = { id: guildId, members: { me: bot }, roles: { cache: roles }, channels: { cache: new Map([[audit.id, audit]]) } };
  let config = null;
  let rules = [];
  let configReads = 0;
  let apiCalls = 0;
  let rescheduled = 0;
  let searchingInteraction;
  const warnings = [];
  console.error = (...args) => warnings.push(args);
  Config.findOne = async () => { configReads += 1; return config; };
  Config.findOneAndUpdate = async (_query, update) => { config = { ...config, ...update.$set }; return config; };
  Rule.find = () => ({ sort: async () => rules });
  Rule.findOne = async (query) => rules.find((item) => item.entityId === query.entityId) || null;
  Rule.countDocuments = async () => rules.length;
  Rule.findOneAndUpdate = async (query, update) => {
    const saved = { ...query, ...update.$set };
    const index = rules.findIndex((item) => item.entityId === query.entityId);
    if (index === -1) rules.push(saved); else rules[index] = saved;
    return saved;
  };
  Registration.countDocuments = async () => 0;
  Registration.updateMany = async () => { rescheduled += 1; return { modifiedCount: 0 }; };
  api.findGuildByName = async (region, name) => {
    assert(searchingInteraction.deferred, 'la búsqueda lenta empieza después de confirmar la interacción');
    assert.equal(region, config.region);
    apiCalls += 1;
    if (name === 'Falla API') throw new api.AlbionApiError('Albion no está disponible. Inténtalo de nuevo.', 'timeout');
    return { id: `albion-${name.replaceAll(' ', '-')}`, name };
  };

  const interaction = (action, overrides = {}) => ({
    customId: `regcfg:${action}:${userId}:${guildId}`, guildId, guild, user: { id: userId },
    message: { id: 'panel-a' }, member: { permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } },
    isButton: () => false, isModalSubmit: () => false, isRoleSelectMenu: () => false,
    isStringSelectMenu: () => false, isChannelSelectMenu: () => false,
    events: [],
    deferReply: async function deferReply(payload) { this.deferred = true; this.events.push(['deferReply', payload]); },
    deferUpdate: async function deferUpdate() { this.deferred = true; this.events.push(['deferUpdate']); },
    showModal: async function showModal(payload) { this.replied = true; this.events.push(['modal', payload.toJSON()]); },
    editReply: async function editReply(payload) { this.events.push(['edit', payload]); return payload; },
    reply: async function reply(payload) { this.replied = true; this.events.push(['reply', payload]); return payload; },
    followUp: async function followUp(payload) { this.events.push(['followUp', payload]); return payload; },
    ...overrides,
  });
  const submit = async (name, tag, messageId = 'panel-a') => {
    const current = interaction('add-submit', { message: { id: messageId }, isModalSubmit: () => true,
      fields: { getTextInputValue: (id) => id === 'name' ? name : tag } });
    searchingInteraction = current;
    await setup.handleInteraction(current);
    return current;
  };
  const chooseRole = async (selectedRole = roleId, messageId = 'panel-a') => {
    const current = interaction('create-role', { message: { id: messageId }, isRoleSelectMenu: () => true, values: [selectedRole] });
    await setup.handleInteraction(current);
    return current;
  };
  const lastPayload = (current) => current.events.at(-1)[1];

  const initial = interaction('home');
  await setup.execute(initial);
  assert.equal(initial.events[0][1].flags, MessageFlags.Ephemeral);
  assert(lastPayload(initial).components.at(-1).toJSON().components[0].disabled);
  for (const action of ['add', 'tag', 'unlink']) {
    const before = configReads;
    const current = interaction(action);
    if (action === 'tag') current.customId = `regcfg:tag:${userId}:${guildId}:guild-id`;
    current.isButton = () => true;
    await setup.handleInteraction(current);
    assert.equal(configReads, before, 'abrir el formulario no consulta la base de datos');
    assert.equal(current.events[0][0], 'modal');
    for (const row of current.events[0][1].components) {
      assert(!Object.hasOwn(row.components[0], 'value'), 'los campos vacíos no envían un valor prellenado');
    }
  }
  const modalFailure = interaction('add', { isButton: () => true,
    showModal: async () => { throw Object.assign(new Error('Invalid Form Body'), { code: 50035 }); } });
  await setup.handleInteraction(modalFailure);
  assert.match(lastPayload(modalFailure).content, /Discord rechazó el formulario/);
  assert.equal(modalFailure.events.at(-1)[0], 'reply');
  const expiredModal = interaction('add', { isButton: () => true,
    showModal: async () => { throw Object.assign(new Error('Unknown interaction'), { code: 10062 }); } });
  await setup.handleInteraction(expiredModal);
  assert.equal(expiredModal.events.length, 0, 'un token caducado no se vuelve a utilizar para responder');
  assert(warnings.some(([, detail]) => detail.action === 'add' && detail.code === 10062), 'la caducidad conserva acción y código para diagnóstico');

  const missingRegion = await submit('Bon Bon Bum', 'BBB');
  assert.match(lastPayload(missingRegion).content, /servidor de Albion/);
  const region = interaction('region', { isStringSelectMenu: () => true, values: ['americas'] });
  await setup.handleInteraction(region);
  assert.equal(config.region, 'americas');
  const channel = interaction('audit', { isChannelSelectMenu: () => true, values: [audit.id] });
  await setup.handleInteraction(channel);
  assert.equal(config.auditChannelId, audit.id);

  const pending = await submit(' Bon Bon Bum ', 'bbb');
  assert.equal(lastPayload(pending).components[0].toJSON().components[0].type, 6);
  const invalidRole = await chooseRole(invalidRoleId);
  assert.match(lastPayload(invalidRole).content, /debajo del rol/);
  assert.equal(rules.length, 0, 'un rol superior al bot no guarda el gremio');
  await chooseRole();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].entityName, 'Bon Bon Bum');
  assert.equal(rules[0].entityTag, 'BBB');
  assert.equal(rules[0].primaryRoleId, roleId);
  assert.equal(rescheduled, 1);
  assert.match(lastPayload(await chooseRole()).content, /expiró/, 'un rol seleccionado dos veces no duplica el alta');
  assert.match(lastPayload(await submit('Bon Bon Bum', 'OTRO')).content, /ya está configurado/);
  assert.equal(rules[0].entityTag, 'BBB', 'Añadir no sobrescribe un gremio existente');
  const callsBeforeTag = apiCalls;
  assert.match(lastPayload(await submit('Otro', 'mal tag')).content, /etiqueta/);
  assert.equal(apiCalls, callsBeforeTag, 'la etiqueta se valida antes de consultar Albion');
  const apiFailure = await submit('Falla API', 'FAIL');
  assert.match(lastPayload(apiFailure).content, /Albion no está disponible/);
  assert.deepEqual(lastPayload(apiFailure).allowedMentions, { parse: [] });

  await submit('Panel A', 'A', 'panel-a');
  await submit('Panel B', 'B', 'panel-b');
  await chooseRole(roleId, 'panel-a');
  await chooseRole(roleId, 'panel-b');
  assert(rules.some((item) => item.entityName === 'Panel A' && item.entityTag === 'A'));
  assert(rules.some((item) => item.entityName === 'Panel B' && item.entityTag === 'B'));
  await submit('Cancelado', 'C');
  await setup.handleInteraction(interaction('home'));
  assert.match(lastPayload(await chooseRole()).content, /expiró/);
  await submit('Caducado', 'C');
  Date.now = () => originals.now() + 11 * 60_000;
  assert.match(lastPayload(await chooseRole()).content, /expiró/);
  Date.now = originals.now;
  await submit('Otra region', 'R');
  config.region = 'europe';
  assert.match(lastPayload(await chooseRole()).content, /Cambió el servidor/);
  config.region = 'americas';

  const worstRules = Array.from({ length: 25 }, (_, index) => ({
    entityId: `g${index}`, entityName: '*'.repeat(100), entityTag: 'A'.repeat(12),
    primaryRoleId: '1'.repeat(20), additionalRoleIds: Array.from({ length: 24 }, (_, roleIndex) => String(roleIndex + 2).padStart(20, '0')),
  }));
  for (const count of [1, 4, 5, 25]) for (const screen of ['home', 'detail', 'pending', 'confirm']) {
    const payload = setup.render({ config, rules: worstRules.slice(0, count), guild, userId, screen, entityId: 'g0',
      candidate: { entity: { name: '*'.repeat(100) }, tag: 'A'.repeat(12) } });
    assert(payload.embeds.reduce((total, embed) => total + embed.length, 0) <= 6000, `límite total de embeds: ${count}/${screen}`);
    assert(payload.components.length <= 5);
    for (const row of payload.components) for (const component of row.toJSON().components) {
      assert(component.custom_id.length <= 100);
      assert((component.options || []).length <= 25);
    }
    payload.embeds.forEach((embed) => embed.toJSON());
  }
  rules = worstRules;
  const beforeLimit = apiCalls;
  assert.match(lastPayload(await submit('Sin espacio', 'S')).content, /límite de 25/);
  assert.equal(apiCalls, beforeLimit);
  const denied = interaction('add', { isButton: () => true, user: { id: '999999999999999999' } });
  await setup.handleInteraction(denied);
  assert.match(lastPayload(denied).content, /otro administrador/);
  assert(warnings.some(([, detail]) => detail.action === 'add' && detail.code === 50035), 'el rechazo de Discord conserva acción y código para diagnóstico');
  console.log('Albion registration setup smoke: OK (modales, región, auditoría, búsqueda, roles, errores y límites Discord)');
})().catch((error) => { console.error = originals.error; console.error(error); process.exitCode = 1; }).finally(() => {
  Config.findOne = originals.configFind; Config.findOneAndUpdate = originals.configUpdate;
  Rule.find = originals.ruleFind; Rule.findOne = originals.ruleFindOne; Rule.countDocuments = originals.ruleCount;
  Rule.findOneAndUpdate = originals.ruleUpdate; Registration.countDocuments = originals.registrationCount;
  Registration.updateMany = originals.registrationUpdate; api.findGuildByName = originals.apiFind;
  console.error = originals.error; Date.now = originals.now;
});
