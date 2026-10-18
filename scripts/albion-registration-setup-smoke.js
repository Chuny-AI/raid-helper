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
  apiFind: api.findGuildByName, error: console.error, info: console.info, now: Date.now,
};

(async () => {
  const guildId = '222222222222222222';
  const userId = '111111111111111111';
  const roleId = '333333333333333333';
  const invalidRoleId = '444444444444444444';
  const additionalRoleIds = Array.from({ length: 24 }, (_, index) => String(600000000000000000n + BigInt(index)));
  const roles = new Map([
    [roleId, { id: roleId, position: 1, name: 'Miembro' }],
    [invalidRoleId, { id: invalidRoleId, position: 15, name: 'Administrador' }],
    ...additionalRoleIds.map((id, index) => [id, { id, position: 2, name: `Adicional ${index + 1}` }]),
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
  const delayedLookups = new Map();
  const panels = new Map();
  const delayLookup = (name) => {
    const delayed = {};
    delayed.started = new Promise((resolve) => { delayed.markStarted = resolve; });
    delayed.result = new Promise((resolve, reject) => { delayed.resolve = resolve; delayed.reject = reject; });
    delayedLookups.set(name, delayed);
    return delayed;
  };
  const warnings = [];
  const stages = [];
  console.error = (...args) => warnings.push(args);
  console.info = (...args) => stages.push(args);
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
    assert(searchingInteraction.events.some(([type, payload]) => type === 'edit'
      && payload.embeds?.[0]?.toJSON().title.includes('Buscando gremio')), 'el panel muestra progreso antes de consultar Albion');
    assert.equal(region, config.region);
    apiCalls += 1;
    if (delayedLookups.has(name)) {
      const delayed = delayedLookups.get(name);
      delayed.markStarted();
      return delayed.result;
    }
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
    editReply: async function editReply(payload) { this.events.push(['edit', payload]); panels.set(this.message.id, payload); return payload; },
    reply: async function reply(payload) { this.replied = true; this.events.push(['reply', payload]); return payload; },
    followUp: async function followUp(payload) { this.events.push(['followUp', payload]); return payload; },
    ...overrides,
  });
  const startSubmit = (name, tag, messageId = 'panel-a', overrides = {}) => {
    const current = interaction('add-submit', { message: { id: messageId }, isModalSubmit: () => true,
      fields: { getTextInputValue: (id) => id === 'name' ? name : tag }, ...overrides });
    searchingInteraction = current;
    return { current, completion: setup.handleInteraction(current) };
  };
  const submit = async (name, tag, messageId = 'panel-a') => {
    const { current, completion } = startSubmit(name, tag, messageId);
    await completion;
    return current;
  };
  const chooseRole = async (selectedRole = roleId, messageId = 'panel-a') => {
    const current = interaction('create-role', { message: { id: messageId }, isRoleSelectMenu: () => true,
      values: Array.isArray(selectedRole) ? selectedRole : [selectedRole] });
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
  assert.match(lastPayload(pending).embeds[0].toJSON().title, /Gremio encontrado: Bon Bon Bum/);
  assert(!JSON.stringify(lastPayload(pending).embeds.map((embed) => embed.toJSON())).includes('Aún no hay gremios'), 'el primer estado destaca que falta seleccionar el rol');
  assert.equal(lastPayload(pending).components[0].toJSON().components[0].type, 6);
  assert.equal(lastPayload(pending).components[0].toJSON().components[0].min_values, 1);
  assert.equal(lastPayload(pending).components[0].toJSON().components[0].max_values, 25);
  assert.match(lastPayload(pending).embeds[0].toJSON().description, /entre 1 y 25 roles/);
  const invalidRole = await chooseRole(invalidRoleId);
  assert.match(lastPayload(invalidRole).content, /debajo del rol/);
  assert.equal(lastPayload(invalidRole).components[0].toJSON().components[0].type, 6, 'un rol inválido permite seleccionar otro en el mismo panel');
  assert(!invalidRole.events.some(([type]) => type === 'followUp'));
  assert.equal(rules.length, 0, 'un rol superior al bot no guarda el gremio');
  const invalidSelections = [
    { values: [], expected: /entre 1 y 25 roles/ },
    { values: [roleId, ...additionalRoleIds, invalidRoleId], expected: /entre 1 y 25 roles/ },
    { values: [roleId, roleId], expected: /roles distintos/ },
    { values: [roleId, invalidRoleId], expected: /debajo del rol/ },
    { values: [roleId, '999999999999999999'], expected: /roles existentes/ },
  ];
  for (const { values, expected } of invalidSelections) {
    const invalid = await chooseRole(values);
    assert.match(lastPayload(invalid).content, expected);
    const selector = lastPayload(invalid).components[0].toJSON().components[0];
    assert.equal(selector.type, 6, 'las selecciones inválidas conservan el selector para corregirlas');
    assert.equal(selector.min_values, 1);
    assert.equal(selector.max_values, 25);
    assert.equal(rules.length, 0, 'una selección inválida no guarda parte de los roles');
    assert.equal(rescheduled, 0);
  }
  const saved = await chooseRole();
  assert.match(lastPayload(saved).content, /Bon Bon Bum.*guardado con el rol principal/);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].entityName, 'Bon Bon Bum');
  assert.equal(rules[0].entityTag, 'BBB');
  assert.equal(rules[0].primaryRoleId, roleId);
  assert.deepEqual(rules[0].additionalRoleIds, []);
  assert.deepEqual(rules[0].roleIds, [roleId], 'la selección de un rol conserva el comportamiento anterior');
  assert.equal(rescheduled, 1);
  assert.match(lastPayload(await chooseRole()).content, /expiró/, 'un rol seleccionado dos veces no duplica el alta');
  assert.match(lastPayload(await submit('Bon Bon Bum', 'OTRO')).content, /ya está configurado/);
  assert.equal(rules[0].entityTag, 'BBB', 'Añadir no sobrescribe un gremio existente');
  for (const [name, roleIds] of [
    ['Dos roles', [additionalRoleIds[0], roleId]],
    ['Tres roles', [additionalRoleIds[1], roleId, additionalRoleIds[0]]],
    ['Máximo de roles', [roleId, ...additionalRoleIds]],
  ]) {
    await submit(name, 'MULTI');
    const multiple = await chooseRole(roleIds);
    const stored = rules.find((item) => item.entityName === name);
    assert.equal(stored.primaryRoleId, roleIds[0], 'el primer ID recibido queda como rol principal');
    assert.deepEqual(stored.additionalRoleIds, roleIds.slice(1), 'todos los demás roles se guardan como adicionales');
    assert.deepEqual(stored.roleIds, roleIds);
    assert.match(lastPayload(multiple).content, /guardado con el rol principal/);
    for (const id of roleIds) assert(lastPayload(multiple).content.includes(`<@&${id}>`), 'la confirmación muestra todos los roles guardados');
    assert.deepEqual(lastPayload(multiple).allowedMentions, { parse: [] });
  }
  const callsBeforeTag = apiCalls;
  assert.match(lastPayload(await submit('Otro', 'mal tag')).content, /etiqueta/);
  assert.equal(apiCalls, callsBeforeTag, 'la etiqueta se valida antes de consultar Albion');
  const apiFailure = await submit('Falla API', 'FAIL');
  assert.match(lastPayload(apiFailure).content, /Albion no está disponible/);
  assert.deepEqual(lastPayload(apiFailure).allowedMentions, { parse: [] });
  assert.equal(apiFailure.events.at(-1)[0], 'edit', 'los errores se muestran en el panel original');
  assert.deepEqual(lastPayload(apiFailure).components[0].toJSON().components.map((item) => item.label), ['Reintentar', 'Volver']);

  const slowLookup = delayLookup('Consulta lenta');
  const slow = startSubmit('Consulta lenta', 'L', 'panel-slow');
  let slowFinished = false;
  slow.completion.then(() => { slowFinished = true; });
  await slowLookup.started;
  assert.equal(slowFinished, false, 'la consulta permanece pendiente durante la comprobación de progreso');
  assert.match(lastPayload(slow.current).embeds[0].toJSON().title, /Buscando gremio/);
  assert.match(lastPayload(slow.current).embeds[0].toJSON().description, /selecciona al menos un rol para guardar/);
  assert.equal(lastPayload(slow.current).components[0].toJSON().components[0].label, 'Cancelar');
  slowLookup.resolve({ id: 'albion-lento', name: 'Consulta lenta' });
  await slow.completion;
  assert.equal(lastPayload(slow.current).components[0].toJSON().components[0].type, 6);
  await chooseRole(roleId, 'panel-slow');
  assert(rules.some((item) => item.entityId === 'albion-lento'), 'la selección de rol guarda el resultado de la búsqueda lenta en el mismo panel');

  const timeoutLookup = delayLookup('Consulta agotada');
  const timedOut = startSubmit('Consulta agotada', 'T', 'panel-timeout');
  await timeoutLookup.started;
  assert.match(panels.get('panel-timeout').embeds[0].toJSON().title, /Buscando gremio/);
  timeoutLookup.reject(new api.AlbionApiError('Albion tardó demasiado en responder.', 'timeout'));
  await timedOut.completion;
  assert.match(panels.get('panel-timeout').content, /Albion tardó demasiado/);
  assert.equal(timedOut.current.events.at(-1)[0], 'edit');
  const readsBeforeRetry = configReads;
  const retry = interaction('add', { message: { id: 'panel-timeout' }, isButton: () => true });
  await setup.handleInteraction(retry);
  assert.equal(retry.events[0][0], 'modal', 'Reintentar abre el formulario sin esperar Albion ni la base de datos');
  assert.equal(configReads, readsBeforeRetry);
  await submit('Reintento correcto', 'R', 'panel-timeout');
  await chooseRole(roleId, 'panel-timeout');
  assert(rules.some((item) => item.entityName === 'Reintento correcto'));
  assert.match(panels.get('panel-timeout').content, /Reintento correcto.*guardado/, 'el reintento exitoso confirma el guardado y elimina el error anterior');
  assert(!panels.get('panel-timeout').content.includes('tardó demasiado'));

  const canceledLookup = delayLookup('Cancelación lenta');
  const canceled = startSubmit('Cancelación lenta', 'C', 'panel-cancel');
  await canceledLookup.started;
  await setup.handleInteraction(interaction('home', { message: { id: 'panel-cancel' } }));
  const canceledPanel = panels.get('panel-cancel');
  canceledLookup.resolve({ id: 'albion-cancelado', name: 'Cancelación lenta' });
  await canceled.completion;
  assert.equal(panels.get('panel-cancel'), canceledPanel, 'una respuesta tardía no reemplaza el panel después de cancelar');
  assert.match(lastPayload(await chooseRole(roleId, 'panel-cancel')).content, /expiró/);

  const staleLookup = delayLookup('Búsqueda anterior');
  const stale = startSubmit('Búsqueda anterior', 'V', 'panel-retry');
  await staleLookup.started;
  await setup.handleInteraction(interaction('add', { message: { id: 'panel-retry' }, isButton: () => true }));
  const replacementLookup = delayLookup('Búsqueda nueva');
  const replacement = startSubmit('Búsqueda nueva', 'N', 'panel-retry');
  await replacementLookup.started;
  const replacementPanel = panels.get('panel-retry');
  staleLookup.reject(new api.AlbionApiError('Error de una búsqueda descartada.', 'timeout'));
  await stale.completion;
  assert.equal(panels.get('panel-retry'), replacementPanel, 'un error tardío no interrumpe una búsqueda nueva');
  replacementLookup.resolve({ id: 'albion-nuevo', name: 'Búsqueda nueva' });
  await replacement.completion;
  await chooseRole(roleId, 'panel-retry');
  assert(rules.some((item) => item.entityId === 'albion-nuevo' && item.entityTag === 'N'));
  assert(!rules.some((item) => item.entityId === 'albion-cancelado'));

  let rejectedPending = false;
  const rejected = startSubmit('Panel rechazado', 'P', 'panel-rejected', {
    editReply: async function editReply(payload) {
      if (!rejectedPending && payload.embeds[0]?.toJSON().title.includes('Gremio encontrado')) {
        rejectedPending = true;
        throw Object.assign(new Error('Invalid Form Body: https://discord.com/api/webhooks/id/SECRET_TOKEN'), { code: 50035 });
      }
      this.events.push(['edit', payload]); panels.set(this.message.id, payload); return payload;
    },
  });
  await rejected.completion;
  assert(rejectedPending);
  assert.match(lastPayload(rejected.current).content, /Discord rechazó la actualización del panel/);
  assert.equal(rejected.current.events.at(-1)[0], 'edit', 'el rechazo asíncrono al mostrar el rol se captura y se informa en el panel');
  assert(!JSON.stringify(warnings).includes('SECRET_TOKEN'), 'los diagnósticos no registran URLs ni tokens de Discord');
  assert.match(lastPayload(await chooseRole(roleId, 'panel-rejected')).content, /expiró/);

  await submit('Guardado sin resumen', 'G', 'panel-saved-rejected');
  let rejectedSummary = false;
  const savedWithoutSummary = interaction('create-role', { message: { id: 'panel-saved-rejected' }, isRoleSelectMenu: () => true, values: [roleId],
    editReply: async function editReply(payload) {
      if (!rejectedSummary) {
        rejectedSummary = true;
        throw Object.assign(new Error('Invalid Form Body'), { code: 50035 });
      }
      this.events.push(['edit', payload]); panels.set(this.message.id, payload); return payload;
    },
  });
  await setup.handleInteraction(savedWithoutSummary);
  assert(rules.some((item) => item.entityName === 'Guardado sin resumen'));
  assert.match(lastPayload(savedWithoutSummary).embeds[0].toJSON().title, /Gremio guardado/);
  assert.match(lastPayload(savedWithoutSummary).content, /El gremio se guardó, pero no se pudo actualizar/);
  assert.deepEqual(lastPayload(savedWithoutSummary).components[0].toJSON().components.map((item) => item.label), ['Volver']);
  assert.deepEqual(stages.filter(([, detail]) => detail.messageId === 'panel-slow').map(([, detail]) => detail.stage),
    ['submit-received', 'search-start', 'search-success', 'role-selected', 'guild-saved']);

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
  for (const count of [1, 4, 5, 25]) for (const screen of ['home', 'detail', 'pending', 'confirm', 'search', 'error']) {
    const payload = setup.render({ config, rules: worstRules.slice(0, count), guild, userId, screen, entityId: 'g0',
      candidate: { entity: { name: '*'.repeat(100) }, tag: 'A'.repeat(12) }, query: { name: '*'.repeat(100) },
      errorMessage: screen === 'error' ? 'E'.repeat(3000) : '' });
    assert(payload.embeds.reduce((total, embed) => total + embed.length, 0) <= 6000, `límite total de embeds: ${count}/${screen}`);
    assert(payload.components.length <= 5);
    assert(payload.content.length <= 2000);
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
  console.error = originals.error; console.info = originals.info; Date.now = originals.now;
});
