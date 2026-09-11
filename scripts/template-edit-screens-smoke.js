const assert = require('node:assert/strict');
const { ComponentType } = require('discord.js');
const screens = require('../src/features/templates/presentation/template-edit-screens');
const groupScreens = require('../src/features/templates/presentation/template-group-screens');
const sessions = require('../src/features/templates/application/template-edit-session-store');
const templateCommand = require('../src/commands/utility/template');

const groups = {};
for (let index = 0; index < 30; index += 1) {
  groups[`group_${index}`] = {
    displayName: `Grupo ${index}`,
    defaultEmoji: '⚔️',
    data: [{ name: `Arma ${index}`, units: 1 }],
  };
}

const sessionId = sessions.createEditSession({
  userId: 'user-1',
  guildId: 'guild-1',
  template: {
    _id: 'template-1',
    title: 'Avalon',
    description: 'Descripción',
    roles: ['111111111111111'],
    weapons: groups,
  },
});

const payloads = [];
const modals = [];
const interaction = {
  user: { id: 'user-1' },
  guild: {
    id: 'guild-1',
    roles: { cache: new Map([['111111111111111', { id: '111111111111111' }]]) },
    emojis: { cache: new Map() },
  },
  member: { permissions: { has: () => true } },
  deferred: false,
  replied: false,
  isMessageComponent: () => true,
  async update(payload) { payloads.push(payload); },
  async reply(payload) { payloads.push(payload); },
  async showModal(modal) { modals.push(modal); },
};

(async () => {
  await screens.showOverview(interaction, sessionId);
  const overviewButtons = payloads.at(-1).components.flatMap((row) => row.components);
  assert(overviewButtons.some((button) => button.data.custom_id === `te:roles:${sessionId}`));
  assert(overviewButtons.some((button) => button.data.custom_id === `te:groups:0:${sessionId}`));

  await screens.showRoles(interaction, sessionId);
  assert.equal(payloads.at(-1).components[0].components[0].data.type, ComponentType.RoleSelect);
  assert(payloads.at(-1).components[1].components.some((button) => button.data.custom_id === `te:home:${sessionId}`));

  await screens.showWeapons(interaction, sessionId);
  const weaponSelect = payloads.at(-1).components[0].components[0];
  assert.equal(weaponSelect.data.type, ComponentType.StringSelect);
  assert.equal(weaponSelect.options.length, 25, 'el selector nunca supera el límite de Discord');
  assert.match(payloads.at(-1).embeds[0].data.footer.text, /Página 1\/2/);
  const nextButton = payloads.at(-1).components.at(-1).components.find((button) => button.data.label === 'Siguiente');
  assert(nextButton, 'la lista ofrece navegación cuando hay más de 25 grupos');

  await screens.showWeapons(interaction, sessionId, 1);
  assert.equal(payloads.at(-1).components[0].components[0].options[0].data.value, '25');
  assert(payloads.at(-1).components.at(-1).components.some((button) => button.data.label === 'Anterior'));

  interaction.customId = `te:roles-select:${sessionId}`;
  interaction.values = ['111111111111111'];
  await templateCommand.handleInteraction(interaction);
  assert.deepEqual(sessions.getValidSession(sessionId, 'user-1', 'guild-1').session.data.roles, ['111111111111111']);
  assert.equal(payloads.at(-1).components[0].components[0].data.type, ComponentType.RoleSelect);

  await screens.showBasicInfo(interaction, sessionId);
  assert.equal(modals.length, 1);
  assert.equal(modals[0].data.custom_id, `te:basic-submit:${sessionId}`);

  sessions.mutateOwnedSession(sessionId, 'user-1', 'guild-1', (session) => {
    session.data.weapons.group_0.data = Array.from({ length: 40 }, (_, index) => ({
      name: `Arma ${index} ${'larga '.repeat(20)}`, units: 1, emoji: '⚔️',
    }));
  });
  await groupScreens.showGroup(interaction, sessionId, 0);
  assert(payloads.at(-1).embeds[0].data.fields.every((field) => field.value.length <= 1024));

  const categories = Array.from({ length: 30 }, (_, index) => ({
    key: `category_${index}`,
    displayName: `Familia ${index}`,
    defaultEmoji: String(90000000000000000n + BigInt(index)),
  }));
  await groupScreens.showGroupEmojiCategories(interaction, sessionId, 'edit', 0, categories, 0);
  assert.equal(payloads.at(-1).components[0].components[0].options.length, 25);
  assert(payloads.at(-1).components[1].components.some((button) => button.data.label === 'Siguiente'));
  await groupScreens.showGroupEmojiCategories(interaction, sessionId, 'edit', 0, categories, 1);
  assert.equal(payloads.at(-1).components[0].components[0].options[0].data.value, 'category_25');

  const catalogWeapons = Array.from({ length: 30 }, (_, index) => ({
    name: `Arma de catálogo ${index}`,
    emojiId: String(91000000000000000n + BigInt(index)),
  }));
  await groupScreens.showGroupEmojiWeapons(
    interaction,
    sessionId,
    'edit',
    0,
    'category_0',
    catalogWeapons,
    0,
  );
  assert.equal(payloads.at(-1).components[0].components[0].options.length, 25);
  assert(payloads.at(-1).components[1].components.some((button) => button.data.label === 'Siguiente'));

  sessions.clearAllSessions();
  console.log('Template edit screens smoke tests passed.');
})().catch((error) => {
  sessions.clearAllSessions();
  console.error(error);
  process.exitCode = 1;
});
