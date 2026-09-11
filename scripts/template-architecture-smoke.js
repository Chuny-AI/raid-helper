const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const editor = require('../src/features/templates/domain/template-editor');
const sessions = require('../src/features/templates/application/template-edit-session-store');
const { buildTemplateCommandDefinition } = require('../src/features/templates/presentation/template-command-definition');
const templateCommand = require('../src/commands/utility/template');

const command = buildTemplateCommandDefinition().toJSON();
assert.equal(command.name, 'template');
assert.deepEqual(command.options.map((option) => option.name), [
  'list',
  'create',
  'edit',
  'delete',
  'clone',
  'export',
  'import',
  'rename',
]);
assert.equal(command.contexts.length, 1, 'el comando debe limitarse a servidores');
assert.deepEqual(templateCommand.data.toJSON(), command, 'el comando público debe usar la nueva definición');
assert.equal(typeof templateCommand.handleInteraction, 'function', 'el comando debe exponer un único router de componentes');
assert.equal(templateCommand.canHandleInteraction({ customId: 'te:home:session' }), true);
assert.equal(templateCommand.canHandleInteraction({ customId: 'template_create_basic' }), true);
assert.equal(templateCommand.canHandleInteraction({ customId: 'raid:join:id' }), false);
const commandLines = fs.readFileSync(path.join(__dirname, '../src/commands/utility/template.js'), 'utf8').split(/\r?\n/).length;
assert(commandLines < 150, 'template.js debe ser solo una fachada de composición');
assert.equal(fs.existsSync(path.join(__dirname, '../src/lib/template/template-create-handlers.js')), false);

const objectSession = {
  data: {
    weapons: {
      tanks: { displayName: 'Tanques', data: [{ name: 'Maza', units: 2 }] },
    },
  },
};
assert.equal(editor.getWeaponGroupFromSession(objectSession, 0).displayName, 'Tanques');
assert.equal(editor.getWeaponFromGroup(objectSession.data.weapons.tanks, 0).name, 'Maza');
const originalWeapon = objectSession.data.weapons.tanks.data[0];
assert.equal(editor.updateWeaponInGroup(objectSession.data.weapons.tanks, 0, { units: 3 }), true);
assert.equal(objectSession.data.weapons.tanks.data[0].units, 3);
assert.notEqual(objectSession.data.weapons.tanks.data[0], originalWeapon, 'la actualización conserva la semántica legacy');

const categorizedGroup = {
  categories: [
    { weapons: [{ name: 'Arco' }] },
    { weapons: [{ name: 'Báculo' }] },
  ],
};
assert.equal(editor.getWeaponFromGroup(categorizedGroup, 1).name, 'Báculo');
assert.equal(editor.updateWeaponInGroup(categorizedGroup, 1, { units: 4 }), true);
assert.equal(categorizedGroup.categories[1].weapons[0].units, 4);

const cleaned = editor.cleanForMongoDB({
  _id: 'mongo-id',
  __v: 2,
  weapons: [{ name: 'DPS', weapons: [{ name: 'Arco', quantity: 2, link: 'https://example.test' }] }],
});
assert.equal(cleaned._id, undefined);
assert.equal(cleaned.__v, undefined);
assert.equal(cleaned.weapons.DPS.data[0].units, 2);
assert.equal(cleaned.weapons.DPS.data[0].url, 'https://example.test');

const now = 1_000_000;
sessions.clearAllSessions();
const createdSessionId = sessions.createEditSession({
  userId: 'creator',
  guildId: 'creator-guild',
  template: {
    _id: 'template-id', title: 'Template', description: 'Descripción',
    roles: ['role-1'], notifyAll: true, reminder: '10m', weapons: {},
  },
}, now);
assert.match(createdSessionId, /^[a-f0-9]{24}$/);
assert.deepEqual(sessions.getValidSession(createdSessionId, 'creator', 'creator-guild', now).session.data.roles, ['role-1']);
assert.equal(sessions.getValidSession(createdSessionId, 'creator', 'creator-guild', now).session.data.notifyAll, true);
const ownedId = sessions.createEditSession({
  userId: 'user-a', guildId: 'guild-a',
  template: { _id: 'owned-template', title: 'Owned', description: 'Owned', weapons: {} },
}, now - 10);
assert.equal(sessions.getValidSession(ownedId, 'user-a', 'guild-a', now).sessionId, ownedId);
assert.equal(sessions.getValidSession(ownedId, 'user-b', 'guild-a', now), null);
assert.equal(sessions.getValidSession(ownedId, 'user-a', 'guild-b', now), null);

sessions.createEditSession({
  userId: 'user-c', guildId: 'guild-c',
  template: { _id: 'older-template', title: 'Older', description: 'Older', weapons: {} },
}, now - 20);
const newerId = sessions.createEditSession({
  userId: 'user-c', guildId: 'guild-c',
  template: { _id: 'newer-template', title: 'Newer', description: 'Newer', weapons: {} },
}, now - 5);
assert.equal(sessions.getValidSession('legacy-id', 'user-c', 'guild-c', now), null);
assert.equal(sessions.getValidSession(newerId, 'user-c', 'guild-c', now).sessionId, newerId);

const expiredId = sessions.createEditSession({
  userId: 'user-d', guildId: 'guild-d',
  template: { _id: 'expired-template', title: 'Expired', description: 'Expired', weapons: {} },
}, now - sessions.SESSION_TIMEOUT_MS - 1);
assert.equal(sessions.getValidSession(expiredId, 'user-d', 'guild-d', now), null);
assert.equal(sessions.deleteOwnedSession(expiredId, 'user-d', 'guild-d'), false);
sessions.clearAllSessions();

console.log('Template architecture smoke tests passed.');
