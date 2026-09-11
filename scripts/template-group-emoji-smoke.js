const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const weaponService = require('../src/services/weaponService');
const editor = require('../src/features/templates/application/template-editor-service');
const sessions = require('../src/features/templates/application/template-edit-session-store');

const readCatalog = (file) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '../src/weapons', file),
  'utf8',
));

const originalGuildId = process.env.GUILD_ID;
const prod = readCatalog('weapons.json');
const dev = readCatalog('weapons_dev.json');

const run = async () => {
  delete process.env.GUILD_ID;
  const prodWeapons = await weaponService.getWeaponsByCategory('sword');
  const prodIds = new Set(prod.weapons.sword.data.map((weapon) => String(weapon.emoji)));
  assert.deepEqual(new Set(prodWeapons.map((weapon) => weapon.emojiId)), prodIds);

  process.env.GUILD_ID = 'development-guild';
  const devWeapons = await weaponService.getWeaponsByCategory('sword');
  const devIds = new Set(dev.weapons.sword.data.map((weapon) => String(weapon.emoji)));
  assert.deepEqual(new Set(devWeapons.map((weapon) => weapon.emojiId)), devIds);
  assert.equal(await weaponService.getWeaponByEmojiId(prodWeapons[0].emojiId), null);

  const categories = await weaponService.getWeaponCategories();
  const sword = categories.find((category) => category.key === 'sword');
  assert.equal(sword.defaultEmoji, String(dev.weapons.sword.defaultEmoji));

  const selected = await weaponService.getWeaponsByEmojiIds([
    devWeapons[0].emojiId,
    prodWeapons[0].emojiId,
  ]);
  assert.deepEqual(selected.map((weapon) => weapon.emojiId), [devWeapons[0].emojiId]);

  const sessionId = sessions.createDraftSession({
    userId: 'user-1',
    guildId: 'guild-1',
    data: {
      title: 'Raid', description: 'Raid',
      weapons: {
        DPS: {
          displayName: 'DPS',
          defaultEmoji: devWeapons[0].emojiId,
          max_players: 1,
          data: [],
        },
      },
    },
  });
  editor.stageGroupChange({
    sessionId, userId: 'user-1', guildId: 'guild-1', groupIndex: 0,
    displayName: 'DPS principal', maxPlayers: '5',
  });
  await assert.rejects(
    editor.applyStagedGroupEmoji({
      sessionId, userId: 'user-1', guildId: 'guild-1', mode: 'edit', groupIndex: 0,
      emojiId: prodWeapons[0].emojiId,
    }),
    /entorno actual/,
  );
  assert.equal(sessions.getValidSession(sessionId, 'user-1', 'guild-1').session.data.weapons.DPS.displayName, 'DPS');

  await editor.applyStagedGroupEmoji({
    sessionId, userId: 'user-1', guildId: 'guild-1', mode: 'edit', groupIndex: 0,
    emojiId: devWeapons[1].emojiId,
  });
  const updated = sessions.getValidSession(sessionId, 'user-1', 'guild-1').session.data.weapons.DPS;
  assert.equal(updated.displayName, 'DPS principal');
  assert.equal(updated.defaultEmoji, devWeapons[1].emojiId);
  assert.equal(updated.max_players, 5);

  console.log('Template group emoji catalog smoke tests passed.');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  sessions.clearAllSessions();
  if (originalGuildId === undefined) delete process.env.GUILD_ID;
  else process.env.GUILD_ID = originalGuildId;
});
