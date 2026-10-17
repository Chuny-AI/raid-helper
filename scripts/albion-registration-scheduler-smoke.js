const assert = require('node:assert/strict');
const schedule = require('node-schedule');
const registration = require('../src/services/albionRegistrationService');
const scheduler = require('../src/services/albionRegistrationScheduler');

const original = { schedule: schedule.scheduleJob, sweep: registration.sweepAllRegistrations, log: console.log, error: console.error };
const logs = [];
const errors = [];
let callback;
let scheduledRule;
let scheduled = 0;
let cancelled = 0;
let checked = 0;
const client = { guilds: { cache: new Map() } };

(async () => {
  console.log = (...args) => logs.push(args);
  console.error = (...args) => errors.push(args);
  const fakeJob = { cancel: () => { cancelled += 1; } };
  schedule.scheduleJob = (name, rule, handler) => {
    assert.equal(name, 'albion-membership-daily');
    assert(rule instanceof schedule.RecurrenceRule);
    scheduledRule = rule;
    callback = handler;
    scheduled += 1;
    return fakeJob;
  };
  registration.sweepAllRegistrations = async (receivedClient) => {
    assert.equal(receivedClient, client);
    checked += 1;
    return 47;
  };
  assert.equal(scheduler.startDailyRegistrationCheck(client), fakeJob);
  assert.equal(scheduler.startDailyRegistrationCheck(client), fakeJob);
  assert.equal(scheduled, 1, 'Repetir el inicio no duplica el proceso diario');
  assert.equal(scheduledRule.tz, 'America/Bogota');
  assert.equal(scheduledRule.hour, 1);
  assert.equal(scheduledRule.minute, 0);
  assert.equal(scheduledRule.second, 0);
  for (const [base, expected] of [
    ['2026-10-17T05:59:59.000Z', '2026-10-17T06:00:00.000Z'],
    ['2026-10-17T06:00:00.000Z', '2026-10-18T06:00:00.000Z'],
    ['2026-12-31T23:00:00.000Z', '2027-01-01T06:00:00.000Z'],
  ]) {
    assert.equal(scheduledRule.nextInvocationDate(new Date(base)).toISOString(), expected, 'La hora de Colombia se respeta independientemente de la zona del servidor');
  }
  assert.equal(await callback(), 47);
  assert.equal(checked, 1);
  assert(logs.some(([message]) => message.includes('47 registro(s)')));

  let release;
  registration.sweepAllRegistrations = async () => {
    checked += 1;
    return new Promise((resolve) => { release = resolve; });
  };
  const first = callback();
  const duplicate = callback();
  assert.equal(first, duplicate, 'Invocaciones superpuestas comparten la misma revisión');
  await Promise.resolve();
  assert.equal(checked, 2);
  release(25);
  assert.equal(await first, 25);

  registration.sweepAllRegistrations = async () => { throw new Error('Mongo temporalmente inaccesible'); };
  assert.equal(await callback(), 0, 'Un error del proceso diario se captura sin detener el bot');
  assert(errors.some(([, message]) => message.includes('Mongo temporalmente inaccesible')));
  registration.sweepAllRegistrations = async () => 12;
  assert.equal(await callback(), 12, 'El siguiente día vuelve a ejecutar después de un error');
  scheduler.stopDailyRegistrationCheck();
  assert.equal(cancelled, 1);
  scheduler.startDailyRegistrationCheck(client);
  assert.equal(scheduled, 2, 'Al reiniciar se vuelve a programar');
  scheduler.stopDailyRegistrationCheck();
  schedule.scheduleJob = () => null;
  assert.throws(() => scheduler.startDailyRegistrationCheck(client), /No se pudo programar/);
  original.log('✅ Revisión diaria Albion a la 01:00 de Colombia, duplicados, reinicio y recuperación de errores verificados');
})().catch((error) => { original.error(error); process.exitCode = 1; }).finally(() => {
  scheduler.stopDailyRegistrationCheck();
  schedule.scheduleJob = original.schedule;
  registration.sweepAllRegistrations = original.sweep;
  console.log = original.log;
  console.error = original.error;
});
