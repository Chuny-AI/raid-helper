const AuthorizedUser = require('../database/models/AuthorizedUser');

const normalizeUserId = (value) => String(value || '').trim();
const validUserId = (value) => /^\d{15,22}$/.test(value);

async function getAuthorizedUsers(activeOnly = false) {
  const query = activeOnly ? { active: true } : {};
  return AuthorizedUser.find(query).sort({ authorizedAt: 1 });
}

async function authorizeUser(userId, authorizedBy, username = null, reason = null) {
  const normalized = normalizeUserId(userId);
  if (!validUserId(normalized)) return { success: false, message: 'ID de Discord inválido.' };

  const existing = await AuthorizedUser.findOne({ userId: normalized });
  if (existing?.active) return { success: false, message: 'El usuario ya está autorizado.' };

  const user = await AuthorizedUser.findOneAndUpdate(
    { userId: normalized },
    {
      $set: {
        username: String(username || ''),
        reason: String(reason || ''),
        active: true,
        authorizedBy: String(authorizedBy || 'cli'),
        authorizedAt: new Date(),
        revokedBy: null,
        revokedAt: null,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
  return { success: true, user };
}

async function revokeUser(userId, revokedBy) {
  const normalized = normalizeUserId(userId);
  if (!validUserId(normalized)) return { success: false, message: 'ID de Discord inválido.' };

  const user = await AuthorizedUser.findOneAndUpdate(
    { userId: normalized, active: true },
    { $set: { active: false, revokedBy: String(revokedBy || 'cli'), revokedAt: new Date() } },
    { new: true }
  );
  return user
    ? { success: true, user }
    : { success: false, message: 'El usuario no estaba autorizado.' };
}

async function importUsers(userIds, authorizedBy, reason = '') {
  const result = { success: 0, existing: 0, failed: 0, errors: [] };
  for (const rawUserId of [...new Set(userIds.map(normalizeUserId))]) {
    try {
      const response = await authorizeUser(rawUserId, authorizedBy, null, reason);
      if (response.success) result.success += 1;
      else if (response.message === 'El usuario ya está autorizado.') result.existing += 1;
      else {
        result.failed += 1;
        result.errors.push(`${rawUserId || '(vacío)'}: ${response.message}`);
      }
    } catch (error) {
      result.failed += 1;
      result.errors.push(`${rawUserId || '(vacío)'}: ${error.message}`);
    }
  }
  return result;
}

module.exports = { getAuthorizedUsers, authorizeUser, revokeUser, importUsers };
