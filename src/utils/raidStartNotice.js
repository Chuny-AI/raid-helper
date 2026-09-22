/** Avisa solo a los miembros con acceso al canal al iniciar el evento. */
async function sendRaidStartNotice(textChannel, raidId, voiceChannelId, memberIds) {
  const ids = [...new Set(memberIds || [])].filter((id) => /^\d{17,20}$/.test(id));
  const prefix = `🔊 Raid **#${raidId}** iniciado. Ir al evento: <#${voiceChannelId}>\n`;
  let batch = [];
  let sent = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await textChannel.send({
      content: prefix + batch.map((id) => `<@${id}>`).join(' '),
      allowedMentions: { parse: [], users: batch },
    });
    sent += batch.length;
    batch = [];
  };

  for (const id of ids) {
    const next = [...batch, id];
    if (next.length > 100 || prefix.length + next.map((userId) => `<@${userId}>`).join(' ').length > 1900) {
      await flush();
    }
    batch.push(id);
  }
  await flush();
  return sent;
}

module.exports = { sendRaidStartNotice };
