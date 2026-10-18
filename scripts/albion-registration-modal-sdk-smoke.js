const assert = require('node:assert/strict');
const {
  Client, ComponentType, InteractionType, MessageFlags, ModalSubmitInteraction,
  PermissionFlagsBits, RoleSelectMenuInteraction,
} = require('discord.js');
const registration = require('../src/services/albionRegistrationService');
const api = require('../src/services/albionApiService');
const setup = require('../src/commands/utility/setup_registro');
const { wrapInteractionMethods } = require('../src/utils/interaction');

const originals = {
  getConfig: registration.getConfig, getRules: registration.getRules,
  saveGuildRule: registration.saveGuildRule, findGuildByName: api.findGuildByName,
  error: console.error, info: console.info,
};
const client = new Client({ intents: [] });
const userId = '111111111111111111';
const guildId = '222222222222222222';
const panelId = '333333333333333333';
const roleId = '888888888888888888';
const user = { id: userId, username: 'Offline', discriminator: '0', avatar: null };
const guild = { id: guildId, members: { me: { permissions: { has: () => true } } } };
const requests = [];
const warnings = [];
const rules = [];
let failPendingOnce = false;
let sequence = 0;

const sourceMessage = (id = panelId) => ({
  id, channel_id: '666666666666666666', author: { ...user, bot: true },
  timestamp: new Date().toISOString(), edited_timestamp: null, content: '',
  tts: false, mention_everyone: false, mentions: [], mention_roles: [],
  attachments: [], embeds: [], reactions: [], pinned: false, type: 0,
  components: [], flags: MessageFlags.Ephemeral,
});

const baseData = (type, message) => ({
  application_id: '444444444444444444', guild_id: guildId,
  id: String(555555555555555555n + BigInt(sequence++)), token: 'offline-test-token',
  type, version: 1, entitlements: [], user, channel: { id: message.channel_id },
  authorizing_integration_owners: {}, message,
});

const decorate = (interaction) => {
  Object.defineProperty(interaction, 'guild', { value: guild });
  interaction.member = { permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } };
  return wrapInteractionMethods(interaction);
};

const modalSubmit = (name, id = panelId) => decorate(new ModalSubmitInteraction(client, {
  ...baseData(InteractionType.ModalSubmit, sourceMessage(id)),
  data: {
    custom_id: `regcfg:add-submit:${userId}:${guildId}`,
    components: [
      { type: ComponentType.ActionRow, components: [{ type: ComponentType.TextInput, custom_id: 'name', value: name }] },
      { type: ComponentType.ActionRow, components: [{ type: ComponentType.TextInput, custom_id: 'tag', value: 'BBB' }] },
    ],
  },
}));

const roleSelect = (id = panelId, values = [roleId]) => decorate(new RoleSelectMenuInteraction(client, {
  ...baseData(InteractionType.MessageComponent, sourceMessage(id)),
  data: {
    custom_id: `regcfg:create-role:${userId}:${guildId}`,
    component_type: ComponentType.RoleSelect, values,
    resolved: {
      roles: Object.fromEntries([...values].reverse().map((id, index) => [id, {
        id, name: `Rol ${index + 1}`, position: index + 1, permissions: '0',
      }])),
    },
  },
}));

const hasRoleSelect = (body) => body.components?.some((row) => (
  row.components?.some((component) => component.type === ComponentType.RoleSelect)
));

(async () => {
  console.error = (...args) => warnings.push(args);
  console.info = () => {};
  registration.getConfig = async () => ({ enabled: true, region: 'americas' });
  registration.getRules = async () => rules;
  registration.saveGuildRule = async ({ entity, tag, primaryRoleId, additionalRoleIds = [] }) => {
    const saved = { entityId: entity.id, entityName: entity.name, entityTag: tag, primaryRoleId, additionalRoleIds };
    rules.push(saved);
    return saved;
  };
  api.findGuildByName = async (_region, name) => {
    assert.equal(requests.at(-1)?.method, 'PATCH', 'el progreso se publica antes de consultar Albion');
    return { id: `albion-${name}`, name };
  };
  client.rest.post = async (_route, options) => {
    assert.equal(options.body.type, 6, 'el SDK confirma el modal/componente con DeferredMessageUpdate');
    assert.equal(options.auth, false);
    requests.push({ method: 'POST', body: options.body });
    return {};
  };
  client.rest.patch = async (route, options) => {
    assert(decodeURIComponent(route).endsWith('/messages/@original'), 'el SDK actualiza el panel original mediante el webhook');
    assert.equal(options.auth, false);
    assert.equal(options.body.flags, undefined, 'la edición no serializa flags de respuesta');
    assert.deepEqual(options.body.allowed_mentions.parse, []);
    requests.push({ method: 'PATCH', body: options.body });
    if (failPendingOnce && hasRoleSelect(options.body)) {
      failPendingOnce = false;
      throw Object.assign(new Error('Invalid Form Body (offline)'), { code: 50035 });
    }
    return { ...sourceMessage(), ...JSON.parse(JSON.stringify(options.body)) };
  };

  const modal = modalSubmit('BonBonBum');
  assert(modal.isModalSubmit());
  assert(modal.isFromMessage(), 'un modal abierto por el botón conserva el mensaje de origen');
  assert.equal(modal.message.id, panelId);
  await setup.handleInteraction(modal);
  assert.equal(requests[0].body.type, 6);
  assert(hasRoleSelect(requests.at(-1).body), 'la respuesta serializada contiene un selector real de roles');
  const serializedSelect = requests.at(-1).body.components.flatMap((row) => row.components)
    .find((component) => component.type === ComponentType.RoleSelect);
  assert.equal(serializedSelect.min_values, 1, 'el selector requiere al menos un rol');
  assert.equal(serializedSelect.max_values, 25, 'el selector admite el principal y hasta 24 roles adicionales');

  const role = roleSelect();
  assert(role.isRoleSelectMenu());
  assert.equal(role.message.id, modal.message.id, 'el pending pertenece al mismo panel en ambas interacciones');
  await setup.handleInteraction(role);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].entityName, 'BonBonBum');
  assert.equal(rules[0].primaryRoleId, roleId);
  assert.deepEqual(rules[0].additionalRoleIds, [], 'seleccionar solo un rol sigue siendo válido');

  const multiPanelId = '333333333333333334';
  await setup.handleInteraction(modalSubmit('Gremio multirrol', multiPanelId));
  const selectedRoleIds = ['999999999999999998', roleId, '777777777777777778'];
  const multiRole = roleSelect(multiPanelId, selectedRoleIds);
  assert.deepEqual(multiRole.values, selectedRoleIds, 'el SDK conserva el orden de los IDs recibido en values');
  assert.deepEqual([...multiRole.roles.keys()], [...selectedRoleIds].reverse(),
    'el orden de las entidades resueltas es distinto al array de selección');
  await setup.handleInteraction(multiRole);
  assert.equal(rules.length, 2);
  assert.equal(rules[1].entityName, 'Gremio multirrol');
  assert.equal(rules[1].primaryRoleId, selectedRoleIds[0], 'el primer ID del payload es el rol principal');
  assert.deepEqual(rules[1].additionalRoleIds, selectedRoleIds.slice(1),
    'los demás IDs se guardan como roles adicionales sin perder ninguno');

  failPendingOnce = true;
  await setup.handleInteraction(modalSubmit('Otro gremio', '999999999999999999'));
  assert.equal(failPendingOnce, false, 'se simuló el rechazo del panel de selección');
  assert(warnings.some(([, detail]) => detail.action === 'add-submit' && detail.code === 50035),
    'el rechazo asíncrono queda en el diagnóstico específico de registro');
  assert.match(requests.at(-1).body.content, /Discord rechazó la actualización del panel/,
    'el mismo panel muestra el error de Discord después del rechazo');
  assert.equal(rules.length, 2, 'una actualización rechazada no guarda un gremio incompleto');
  console.log('Albion registration modal SDK smoke: OK (modal real, wrapper, webhook, selección de 1 a 25 roles y rechazo 50035)');
})().catch((error) => {
  originals.error(error);
  if (warnings.length) originals.error('Registration test diagnostics:', warnings);
  process.exitCode = 1;
}).finally(() => {
  registration.getConfig = originals.getConfig;
  registration.getRules = originals.getRules;
  registration.saveGuildRule = originals.saveGuildRule;
  api.findGuildByName = originals.findGuildByName;
  console.error = originals.error;
  console.info = originals.info;
  client.destroy();
});
