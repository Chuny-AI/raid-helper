const assert = require('node:assert/strict');
const transfer = require('../src/features/templates/domain/template-transfer');
const crud = require('../src/features/templates/application/template-crud');

const parsed = transfer.parseTemplateImport(JSON.stringify({
  description: 'Raid seguro',
  image: 'https://example.com/image.png',
  roles: ['123456789012345', '123456789012345', 'not-a-role'],
  weapons: { dps: { data: [{ name: 'Arco', units: 1 }], __proto__: { polluted: true } } },
  serverId: 'foreign-guild',
  _id: 'foreign-id',
}), '  Mi plantilla  ');
assert.equal(parsed.title, 'Mi plantilla');
assert.deepEqual(parsed.roles, ['123456789012345']);
assert.equal(parsed.serverId, undefined);
assert.equal(parsed._id, undefined);
assert.equal({}.polluted, undefined);

assert.throws(() => transfer.parseTemplateImport('{', 'Nombre'), /JSON válido/);
assert.throws(() => transfer.parseTemplateImport('[]', 'Nombre'), /objeto de plantilla/);
assert.throws(() => transfer.parseTemplateImport('{"image":"file:\/\/secret"}', 'Nombre'), /HTTP o HTTPS/);
assert.throws(() => transfer.parseTemplateImport('{"weapons":{"$where":"bad"}}', 'Nombre'), /no está permitida/);
assert.equal(transfer.safeExportFileName('Ávalon / semanal'), 'Avalon_semanal.json');

const attachment = {
  name: 'template.JSON',
  size: 20,
  url: 'https://cdn.discordapp.com/attachments/1/2/template.json?token=signed',
};
assert.doesNotThrow(() => crud.validateAttachment(attachment));
assert.throws(() => crud.validateAttachment({ ...attachment, url: 'https://example.com/attachments/template.json' }), /Discord/);
assert.throws(() => crud.validateAttachment({ ...attachment, size: transfer.MAX_IMPORT_BYTES + 1 }), /8 MB/);

(async () => {
  const downloaded = await crud.downloadAttachment(attachment, async () => ({
    ok: true,
    arrayBuffer: async () => Buffer.from('{"description":"ok"}'),
  }));
  assert.equal(downloaded, '{"description":"ok"}');
  console.log('Template transfer smoke tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
