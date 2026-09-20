const assert = require('node:assert');
const { GatewayIntentBits } = require('discord.js');

const Template = require('../src/database/models/Template');
const { parseMinutes } = require('../src/utils/time');
const { client } = require('../src/utils/client');
const limiter = require('../src/utils/notificationLimiter');

(async () => {
  const template = new Template({
    title: 'Avalon',
    description: 'Prueba',
    serverId: 'guild',
    color: '#123456',
    url: 'https://example.test',
    roles: ['role-1'],
    notifyAll: true,
    reminder: '1h',
  });
  assert.strictEqual(template.color, '#123456');
  assert.strictEqual(template.url, 'https://example.test');
  assert.deepStrictEqual(template.roles, ['role-1']);
  assert.strictEqual(template.notifyAll, true);
  assert.strictEqual(template.reminder, '1h');

  assert.strictEqual(parseMinutes('10'), 600_000);
  assert.strictEqual(parseMinutes('30m'), 1_800_000);
  assert.strictEqual(parseMinutes('1h'), 3_600_000);
  assert.throws(() => parseMinutes('mañana'));

  const enabled = client.options.intents;
  assert.ok(enabled.has(GatewayIntentBits.Guilds));
  assert.ok(enabled.has(GatewayIntentBits.GuildMembers));
  assert.ok(enabled.has(GatewayIntentBits.GuildMessages));
  assert.ok(enabled.has(GatewayIntentBits.GuildVoiceStates));
  assert.ok(enabled.has(GatewayIntentBits.MessageContent));
  assert.ok(!enabled.has(GatewayIntentBits.GuildPresences));

  assert.doesNotThrow(() => require('../src/services/authorizedUserService'));
  assert.doesNotThrow(() => require('../src/services/userCategoryService'));
  assert.doesNotThrow(() => require('../src/features/templates/presentation/template-editor-controller'));

  limiter.resetForTests();
  assert.strictEqual(limiter.consumeNotificationPermit('g1', 'u1', 1_000_000).ok, true);
  const blocked = limiter.consumeNotificationPermit('g1', 'u1', 1_000_001);
  assert.strictEqual(blocked.ok, false);
  assert.ok(blocked.retryAfterMs > 0);

  const order = [];
  const first = limiter.enqueueDmBatch('g2', async () => {
    order.push('a-start');
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push('a-end');
  });
  const second = limiter.enqueueDmBatch('g2', async () => order.push('b'));
  await Promise.all([first, second]);
  assert.deepStrictEqual(order, ['a-start', 'a-end', 'b']);

  client.destroy();
  console.log('✅ Regresiones de seguridad verificadas');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
