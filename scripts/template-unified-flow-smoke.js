const assert = require('node:assert/strict');
const command = require('../src/commands/utility/template');
const sessions = require('../src/features/templates/application/template-edit-session-store');
const editor = require('../src/features/templates/application/template-editor-service');
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

const selectInteraction = (customId, values) => ({
  ...buttonInteraction(customId),
  values,
  isButton: () => false,
  isStringSelectMenu: () => true,
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
  assert.equal(
    modals.at(-1).components.some((row) => row.components[0].data.custom_id === 'defaultEmoji'),
    false,
    'el emoji ya no se escribe manualmente',
  );

  await command.handleInteraction(modalInteraction(`te:group-new-submit:${sessionId}`, {
    displayName: 'DPS', maxPlayers: '5',
  }));
  const categorySelect = payloads.at(-1).components[0].components[0];
  assert.equal(categorySelect.data.custom_id, `te:group-icon-category:create:new:${sessionId}`);
  assert(categorySelect.options.every((option) => /^\d{17,20}$/.test(option.data.emoji.id)));

  const selectedCategory = categorySelect.options[0].data.value;
  await command.handleInteraction(selectInteraction(categorySelect.data.custom_id, [selectedCategory]));
  const emojiSelect = payloads.at(-1).components[0].components[0];
  assert.equal(emojiSelect.data.custom_id, `te:group-icon-select:create:new:${sessionId}`);
  assert(emojiSelect.options.every((option) => /^\d{17,20}$/.test(option.data.emoji.id)));

  const selectedEmoji = emojiSelect.options[0].data.value;
  await command.handleInteraction(selectInteraction(emojiSelect.data.custom_id, [selectedEmoji]));
  const session = sessions.getValidSession(sessionId, 'user-1', 'guild-1').session;
  assert.equal(session.data.weapons.DPS.displayName, 'DPS');
  assert.equal(session.data.weapons.DPS.defaultEmoji, selectedEmoji);
  const firstWeaponModal = modals.at(-1);
  assert.equal(firstWeaponModal.data.custom_id, `te:catalog-add-submit:0:${sessionId}`);
  assert.equal(session.data.weapons.DPS.data.length, 0, 'el arma inicial espera la confirmación del modal');

  await command.handleInteraction(modalInteraction(firstWeaponModal.data.custom_id, {
    units: '3',
    url: 'https://example.com/build',
    label: 'Build principal',
  }));
  assert.equal(session.data.weapons.DPS.data.length, 1);
  assert.equal(session.data.weapons.DPS.data[0].units, 3);
  assert.equal(session.data.weapons.DPS.data[0].url, 'https://example.com/build');
  assert.equal(session.data.weapons.DPS.data[0].label, 'Build principal');
  assert.doesNotThrow(() => editor.validateBeforeSave(session.data));
  assert.match(payloads.at(-1).embeds[0].data.title, /DPS/);

  await command.handleInteraction(buttonInteraction(`te:catalog:0:${sessionId}`));
  const catalogCategorySelect = payloads.at(-1).components[0].components[0];
  await command.handleInteraction(selectInteraction(
    catalogCategorySelect.data.custom_id,
    [catalogCategorySelect.options[0].data.value],
  ));
  const catalogWeaponSelect = payloads.at(-1).components[0].components[0];
  assert.equal(catalogWeaponSelect.data.max_values, 1, 'cada arma debe configurarse individualmente');
  const catalogWeaponEmoji = catalogWeaponSelect.options[0].data.value;
  await command.handleInteraction(selectInteraction(catalogWeaponSelect.data.custom_id, [catalogWeaponEmoji]));

  const weaponModal = modals.at(-1);
  assert.equal(weaponModal.data.custom_id, `te:catalog-add-submit:0:${sessionId}`);
  assert.equal(session.data.weapons.DPS.data.length, 1, 'el arma no se añade antes de confirmar el modal');

  await command.handleInteraction(modalInteraction(weaponModal.data.custom_id, {
    units: '2',
    url: '',
    label: 'Build secundaria',
  }));
  assert.equal(session.data.weapons.DPS.data.length, 2);
  assert.equal(session.data.weapons.DPS.data[1].units, 2);
  assert.equal(session.data.weapons.DPS.data[1].label, 'Build secundaria');
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
