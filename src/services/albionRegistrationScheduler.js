const schedule = require('node-schedule');
const registration = require('./albionRegistrationService');

const DAILY_CHECK_TIMEZONE = 'America/Bogota';
let dailyJob = null;
let runningCheck = null;

const runDailyRegistrationCheck = (client) => {
  if (runningCheck) return runningCheck;
  runningCheck = Promise.resolve().then(async () => {
    try {
      console.log('[INFO] Iniciando revisión diaria de miembros Albion.');
      const checked = await registration.sweepAllRegistrations(client);
      console.log(`[INFO] Revisión diaria Albion completada: ${checked} registro(s) revisados sin error.`);
      return checked;
    } catch (error) {
      console.error('[WARN] No se pudo completar la revisión diaria Albion:', error?.message);
      return 0;
    }
  }).finally(() => { runningCheck = null; });
  return runningCheck;
};

const startDailyRegistrationCheck = (client) => {
  if (dailyJob) return dailyJob;
  const rule = new schedule.RecurrenceRule();
  rule.tz = DAILY_CHECK_TIMEZONE;
  rule.hour = 1;
  rule.minute = 0;
  rule.second = 0;
  dailyJob = schedule.scheduleJob('albion-membership-daily', rule, () => runDailyRegistrationCheck(client));
  if (!dailyJob) throw new Error('No se pudo programar la revisión diaria Albion.');
  console.log(`[INFO] Revisión diaria Albion programada a las 01:00 (${DAILY_CHECK_TIMEZONE}).`);
  return dailyJob;
};

const stopDailyRegistrationCheck = () => {
  if (!dailyJob) return;
  dailyJob.cancel();
  dailyJob = null;
};

module.exports = {
  DAILY_CHECK_TIMEZONE,
  runDailyRegistrationCheck,
  startDailyRegistrationCheck,
  stopDailyRegistrationCheck,
};
