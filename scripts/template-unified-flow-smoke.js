const assert = require('node:assert/strict');
const command = require('../src/commands/utility/template');
const sessions = require('../src/features/templates/application/template-edit-session-store');
const templateService = require('../src/services/templateService');

const originalGetTemplateByName = templateService.getTemplateByName;

const payloads = [];
const modals = [];
const base = {
  user: { id: 'user-1' },
  guild: {
    id: 'guild-1', name: 'Guild',
    roles: { cache: new Map() },
    emojis: { cache: new Map() },
  },
  member: { permissions: { has: () => true } },
  deferred: false,
  replied: false,
  async reply(payload) { payloads.push(payload); },
  async update(payload) { payloads.push(payload); },
  async editReply(payload) { payloads.push(payload); },
  async showModal(modal) { modals.push(modal); },
};

const modalInteraction = (customId, values) => ({
  ...base,
  customId,
  fields: { getTextInputValue: (key) => values[key] || '' },
  isModalSubmit: () => true,
  isFromMessage: () => true,
  isMessageComponent: () => false,
  isButton: () => false,
  isStringSelectMenu: () => false,
  isRoleSelectMenu: () => false,
});

const buttonInteraction = (customId) => ({
  ...base,
  customId,
  isModalSubmit: () => false,
  isMessageComponent: () => true,
  isButton: () => true,
  isStringSelectMenu: () => false,
  isRoleSelectMenu: () => false,
});

(async () => {
  sessions.clearAllSessions();
  templateService.getTemplateByName = async () => null;
  const createSlash = {
    ...base,
    options: { getSubcommand: () => 'create' },
  };
  await command.execute(createSlash);
  assert.equal(modals.at(-1).data.custom_id, 'template_create_basic');

  await command.handleInteraction(modalInteraction('template_create_basic', {
    title: 'Raid semanal', description: 'Descripción', image: '',
  }));
  const overview = payloads.at(-1);
  const saveButton = overview.components.flatMap((row) => row.components)
    .find((button) => button.data.custom_id.startsWith('te:save:'));
  assert(saveButton, 'la creación debe abrir el editor unificado');
  const sessionId = saveButton.data.custom_id.split(':').at(-1);
  assert.equal(sessions.getValidSession(sessionId, 'user-1', 'guild-1').session.mode, 'create');

  await command.handleInteraction(buttonInteraction(`te:group-new:${sessionId}`));
  assert.equal(modals.at(-1).data.custom_id, `te:group-new-submit:${sessionId}`);

  await command.handleInteraction(modalInteraction(`te:group-new-submit:${sessionId}`, {
    displayName: 'DPS', defaultEmoji: '⚔️', maxPlayers: '5',
  }));
  const session = sessions.getValidSession(sessionId, 'user-1', 'guild-1').session;
  assert.equal(session.data.weapons.DPS.displayName, 'DPS');
  assert.match(payloads.at(-1).embeds[0].data.title, /DPS/);

  await command.handleInteraction(buttonInteraction(`te:cancel:${sessionId}`));
  assert.equal(sessions.getValidSession(sessionId, 'user-1', 'guild-1'), null);
  assert.match(payloads.at(-1).embeds[0].data.title, /Edición cancelada/);

  sessions.clearAllSessions();
  console.log('Template unified create/edit flow smoke tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  templateService.getTemplateByName = originalGetTemplateByName;
  sessions.clearAllSessions();
});
