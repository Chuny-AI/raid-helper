const assert = require('node:assert/strict');
const domain = require('../src/features/templates/domain/template-editor');
const sessions = require('../src/features/templates/application/template-edit-session-store');
const editorService = require('../src/features/templates/application/template-editor-service');

const template = { weapons: {} };
const groupIndex = domain.addGroup(template, { displayName: 'DPS', defaultEmoji: '⚔️', max_players: 4 });
assert.equal(groupIndex, 0);
assert.equal(template.weapons.DPS.displayName, 'DPS');
assert.equal(domain.addWeaponsToGroup(template, 0, [
  { name: 'Arco', quantity: 2, emojiId: '123' },
  { name: 'Espada', units: 1, emoji: '🗡️' },
]), 2);
assert.equal(template.weapons.DPS.data[0].units, 2);
assert.equal(domain.updateGroup(template, 0, { displayName: 'Daño', max_players: 3 }), true);
assert.equal(template.weapons.DPS.displayName, 'Daño');
assert.equal(domain.updateWeapon(template, 0, 1, { name: 'Espada real', units: 2 }), true);
assert.equal(template.weapons.DPS.data[1].name, 'Espada real');
assert.equal(domain.removeWeapons(template, 0, [0]), 1);
assert.equal(template.weapons.DPS.data.length, 1);
assert.equal(domain.removeGroup(template, 0).displayName, 'Daño');
assert.equal(domain.getGroupEntries(template.weapons).length, 0);
assert.equal(domain.normalizeEmoji('texto inválido'), '⚔️');
assert.equal(domain.normalizeEmoji('123456789012345678'), '123456789012345678');
assert.equal(domain.normalizeWeapon({ name: 'Falce', label: 'Falce (A)', private: true }).label, 'Falce (A)');

const arrayTemplate = { weapons: [] };
domain.addGroup(arrayTemplate, { displayName: 'Tanques', data: [{ name: 'Maza', units: 1 }] });
assert.equal(Array.isArray(arrayTemplate.weapons), true);
assert.equal(domain.updateWeapon(arrayTemplate, 0, 0, { units: 3 }), true);
assert.equal(arrayTemplate.weapons[0].data[0].units, 3);

sessions.clearAllSessions();
const draftId = sessions.createDraftSession({
  userId: 'creator', guildId: 'guild',
  data: { title: 'Nueva', description: 'Descripción', image: '', weapons: {} },
});
const draft = sessions.getValidSession(draftId, 'creator', 'guild').session;
assert.equal(draft.mode, 'create');
assert.equal(draft.data.title, 'Nueva');
assert.equal(sessions.getValidSession(draftId, 'intruder', 'guild'), null);
sessions.clearAllSessions();

const source = {
  _id: 'template-id',
  title: 'Original',
  description: 'Descripción',
  weapons: { heal: { displayName: 'Healers', data: [{ name: 'Sagrado', units: 1 }] } },
};
const sessionId = sessions.createEditSession({ userId: 'owner', guildId: 'guild', template: source });
assert.equal('templateEditSessions' in sessions, false, 'el Map interno no debe formar parte de la API pública');
sessions.mutateOwnedSession(sessionId, 'owner', 'guild', (session) => { session.data.weapons.heal.data[0].name = 'Naturaleza'; });
assert.equal(source.weapons.heal.data[0].name, 'Sagrado', 'la sesión debe clonar el documento original');
assert.equal(sessions.mutateOwnedSession(sessionId, 'intruder', 'guild', () => {}), null);

assert.throws(() => editorService.validateBeforeSave({ title: 'Vacía', description: 'x', weapons: {} }), /al menos un grupo/);
assert.throws(() => editorService.validateBeforeSave({
  title: 'Vacía', description: 'x', weapons: { dps: { displayName: 'DPS', data: [] } },
}), /al menos un arma/);
assert.doesNotThrow(() => editorService.validateBeforeSave({
  title: 'Lista', description: 'x', weapons: { dps: { displayName: 'DPS', data: [{ name: 'Arco' }] } },
}));

sessions.clearAllSessions();
console.log('Template editor domain smoke tests passed.');
