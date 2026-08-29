/**
 * Prueba de humo del guardado de raids en `raidRegistry`.
 *
 * Cubre el fallo que se veía en producción:
 *   ParallelSaveError: Can't save() the same doc multiple times in parallel
 * Un solo click encadena varias mutaciones (apuntarse -> promover de la lista
 * de espera -> avisar de raid lleno) y cada una pedía persistir, lanzando
 * varios `save()` a la vez sobre el mismo documento de mongoose.
 *
 * No requiere BD ni conexión a Discord.
 */
const assert = require('node:assert');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${error.message}`);
    process.exitCode = 1;
  }
}

const raidRegistry = require('../src/services/raidRegistry');

/**
 * Documento falso que imita a mongoose: si se llama a `save()` mientras otro
 * `save()` sigue en vuelo, lanza igual que `ParallelSaveError`.
 * `value` simula el estado que se está persistiendo.
 */
function fakeDoc({ failTimes = 0 } = {}) {
  const doc = {
    value: 0,
    saved: [],       // valores efectivamente escritos, en orden
    inFlight: false,
    calls: 0,
    async save() {
      if (doc.inFlight) {
        const e = new Error("Can't save() the same doc multiple times in parallel");
        e.name = 'ParallelSaveError';
        throw e;
      }
      doc.inFlight = true;
      doc.calls++;
      const snapshot = doc.value;
      try {
        await new Promise((r) => setTimeout(r, 5));
        if (doc.calls <= failTimes) throw new Error('fallo simulado de BD');
        doc.saved.push(snapshot);
      } finally {
        doc.inFlight = false;
      }
    },
  };
  return doc;
}

function registerFake(raidId, doc) {
  raidRegistry.register({ raidId, raid: doc, message: null, templateName: 'T' });
  return doc;
}

/** Espera a que se vacíe la cola de `setImmediate` unas cuantas veces. */
const drain = async (rondas = 6) => {
  for (let i = 0; i < rondas; i++) {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));
  }
};

(async () => {
  console.log('\n— Guardado serializado —');

  await test('dos guardados a la vez no se solapan (sin ParallelSaveError)', async () => {
    const doc = registerFake('P1', fakeDoc());
    doc.value = 1;
    const a = raidRegistry.saveRaid('P1');
    doc.value = 2;
    const b = raidRegistry.saveRaid('P1');
    await Promise.all([a, b]);
    assert.ok(doc.calls >= 1, 'debería haber guardado al menos una vez');
    raidRegistry.unregister('P1');
  });

  await test('el último estado siempre acaba persistido', async () => {
    const doc = registerFake('P2', fakeDoc());
    doc.value = 1;
    const a = raidRegistry.saveRaid('P2');
    doc.value = 2;                      // cambia mientras el primer save está en vuelo
    const b = raidRegistry.saveRaid('P2');
    await Promise.all([a, b]);
    assert.strictEqual(doc.saved[doc.saved.length - 1], 2, `último guardado: ${doc.saved}`);
    raidRegistry.unregister('P2');
  });

  await test('tres mutaciones encadenadas se coalescen en pocas escrituras', async () => {
    const doc = registerFake('P3', fakeDoc());
    const promesas = [];
    for (let i = 1; i <= 3; i++) {
      doc.value = i;
      promesas.push(raidRegistry.saveRaid('P3'));
    }
    await Promise.all(promesas);
    assert.ok(doc.calls <= 2, `esperaba como mucho 2 escrituras, hubo ${doc.calls}`);
    assert.strictEqual(doc.saved[doc.saved.length - 1], 3);
    raidRegistry.unregister('P3');
  });

  await test('un guardado que falla no bloquea el siguiente', async () => {
    const doc = registerFake('P4', fakeDoc({ failTimes: 1 }));
    doc.value = 7;
    await raidRegistry.saveRaid('P4');   // este falla y se traga el error
    doc.value = 9;
    await raidRegistry.saveRaid('P4');
    assert.deepStrictEqual(doc.saved, [9]);
    raidRegistry.unregister('P4');
  });

  await test('saveRaid sobre un raid no registrado no lanza', async () => {
    await raidRegistry.saveRaid('NO-EXISTE');
  });

  console.log('\n— persistRaid (no bloqueante) —');

  await test('persistRaid acaba guardando sin solaparse', async () => {
    const doc = registerFake('P5', fakeDoc());
    doc.value = 1;
    raidRegistry.persistRaid('P5');
    doc.value = 2;
    raidRegistry.persistRaid('P5');
    doc.value = 3;
    raidRegistry.persistRaid('P5');
    await drain();
    assert.strictEqual(doc.saved[doc.saved.length - 1], 3, `guardados: ${doc.saved}`);
    raidRegistry.unregister('P5');
  });

  await test('persistRaid no lanza si el raid ya no está registrado', async () => {
    raidRegistry.persistRaid('TAMPOCO-EXISTE');
    await drain(2);
  });

  await test('un guardado en vuelo termina aunque se desregistre el raid', async () => {
    const doc = registerFake('P6', fakeDoc());
    doc.value = 4;
    const p = raidRegistry.saveRaid('P6');
    raidRegistry.unregister('P6');
    await p;
    assert.deepStrictEqual(doc.saved, [4]);
  });

  console.log(`\n${passed} comprobaciones OK`);
})();
