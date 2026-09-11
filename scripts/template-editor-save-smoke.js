const assert = require('node:assert/strict');
const templateService = require('../src/services/templateService');
const Template = require('../src/database/models/Template');
const Server = require('../src/database/models/Server');
const sessions = require('../src/features/templates/application/template-edit-session-store');
const editor = require('../src/features/templates/application/template-editor-service');

const originals = {
  getTemplateByName: templateService.getTemplateByName,
  updateTemplate: templateService.updateTemplate,
  createTemplate: templateService.createTemplate,
  serverFindOne: Server.findOne,
  templateFindOneAndUpdate: Template.findOneAndUpdate,
};

const validData = {
  title: 'Avalon',
  description: 'Descripción',
  weapons: { dps: { displayName: 'DPS', defaultEmoji: '⚔️', max_players: 2, data: [{ name: 'Arco', units: 2, emoji: '🏹' }] } },
};

const titleIndex = Template.schema.indexes().find(([, options]) =>
  options.name === 'uniq_template_server_title_ci');
assert.deepEqual(titleIndex?.[0], { serverId: 1, title: 1 });
assert.equal(titleIndex?.[1].unique, true);
assert.deepEqual(titleIndex?.[1].collation, { locale: 'es', strength: 2 });

(async () => {
  sessions.clearAllSessions();
  const updatedAt = new Date('2026-01-01T00:00:00.000Z');
  const editId = sessions.createEditSession({
    userId: 'owner', guildId: 'guild',
    template: { _id: 'template-1', updatedAt, ...validData },
  });
  let updateArgs;
  templateService.getTemplateByName = async () => null;
  templateService.updateTemplate = async (...args) => {
    updateArgs = args;
    return { _id: args[0], ...args[1] };
  };
  const edited = await editor.save({ sessionId: editId, userId: 'owner', guildId: 'guild', guildName: 'Guild' });
  assert.equal(edited.created, false);
  assert.equal(updateArgs[0], 'template-1');
  assert.equal(updateArgs[2], 'guild');
  assert.equal(new Date(updateArgs[3]).toISOString(), updatedAt.toISOString(), 'el guardado debe usar control de concurrencia');
  assert.equal(sessions.getValidSession(editId, 'owner', 'guild'), null);

  let atomicUpdate;
  Template.findOneAndUpdate = async (filter, update, options) => {
    atomicUpdate = { filter, update, options };
    return { _id: filter._id, ...update };
  };
  await originals.updateTemplate('template-atomic', { title: 'Atómica' }, 'guild', updatedAt);
  assert.equal(atomicUpdate.filter.serverId, 'guild');
  assert.equal(atomicUpdate.filter.updatedAt.toISOString(), updatedAt.toISOString());
  assert(atomicUpdate.update.updatedAt instanceof Date);
  assert.equal(atomicUpdate.options.runValidators, true);

  const createId = await editor.startCreate({ userId: 'owner', guildId: 'guild', title: 'Nueva', description: 'Descripción', image: '' });
  sessions.mutateOwnedSession(createId, 'owner', 'guild', (session) => { session.data.weapons = validData.weapons; });
  Server.findOne = async () => ({ guildId: 'guild' });
  templateService.createTemplate = async (payload, guildId) => ({ _id: 'new-id', serverId: guildId, ...payload });
  const created = await editor.save({ sessionId: createId, userId: 'owner', guildId: 'guild', guildName: 'Guild' });
  assert.equal(created.created, true);
  assert.equal(created.template.title, 'Nueva');
  assert.equal(sessions.getValidSession(createId, 'owner', 'guild'), null);

  console.log('Template editor save smoke tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  templateService.getTemplateByName = originals.getTemplateByName;
  templateService.updateTemplate = originals.updateTemplate;
  templateService.createTemplate = originals.createTemplate;
  Server.findOne = originals.serverFindOne;
  Template.findOneAndUpdate = originals.templateFindOneAndUpdate;
  sessions.clearAllSessions();
});
