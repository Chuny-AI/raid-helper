const assert = require('node:assert/strict');
const templateService = require('../src/services/templateService');
const sessions = require('../src/features/templates/application/template-edit-session-store');
const controller = require('../src/features/templates/presentation/template-editor-controller');

const originals = {
  getTemplateByName: templateService.getTemplateByName,
  updateTemplate: templateService.updateTemplate,
};

const source = {
  _id: 'template-1',
  title: 'Avalon',
  description: 'Descripción',
  weapons: {
    dps: {
      displayName: 'DPS',
      defaultEmoji: '⚔️',
      data: [{ name: 'Arco', units: 1, emoji: '🏹' }],
    },
  },
};

const adminGuild = {
  id: 'guild-1',
  name: 'Guild',
  roles: { cache: new Map() },
  emojis: { cache: new Map() },
};

(async () => {
  sessions.clearAllSessions();
  const calls = [];
  const slash = {
    user: { id: 'owner' },
    guild: adminGuild,
    member: { permissions: { has: () => true } },
    deferred: false,
    replied: false,
    options: { getString: () => 'Avalon' },
    async deferReply() { this.deferred = true; calls.push('deferReply'); },
    async editReply(payload) { calls.push({ type: 'editReply', payload }); },
  };

  templateService.getTemplateByName = async () => {
    assert.equal(slash.deferred, true, 'el editor debe confirmar el slash command antes de consultar Mongo');
    return source;
  };
  await controller.executeEdit(slash);
  assert.equal(calls[0], 'deferReply');
  assert.equal(calls[1].type, 'editReply');
  const saveButton = calls[1].payload.components
    .flatMap((row) => row.components)
    .find((button) => button.data.custom_id.startsWith('te:save:'));
  assert(saveButton, 'el panel de edición debe mostrarse tras abrir el comando');

  const sessionId = saveButton.data.custom_id.split(':').at(-1);
  const saveCalls = [];
  const saveInteraction = {
    user: { id: 'owner' },
    guild: adminGuild,
    member: { permissions: { has: () => true } },
    customId: `te:save:${sessionId}`,
    deferred: false,
    replied: false,
    isMessageComponent: () => true,
    isModalSubmit: () => false,
    async deferUpdate() { this.deferred = true; saveCalls.push('deferUpdate'); },
    async editReply(payload) { saveCalls.push({ type: 'editReply', payload }); },
  };

  templateService.getTemplateByName = async () => null;
  templateService.updateTemplate = async () => {
    assert.equal(saveInteraction.deferred, true, 'el botón Guardar debe confirmarse antes de escribir en Mongo');
    return source;
  };
  await controller.handleInteraction(saveInteraction);
  assert.equal(saveCalls[0], 'deferUpdate');
  assert.equal(saveCalls[1].type, 'editReply');
  assert.match(saveCalls[1].payload.embeds[0].data.title, /Plantilla actualizada/);
  assert.equal(sessions.getValidSession(sessionId, 'owner', 'guild-1'), null);

  console.log('Template edit interaction smoke tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  templateService.getTemplateByName = originals.getTemplateByName;
  templateService.updateTemplate = originals.updateTemplate;
  sessions.clearAllSessions();
});
