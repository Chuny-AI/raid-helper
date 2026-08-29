#!/usr/bin/env node
/**
 * Reapunta los emojis de un template a los del catálogo del entorno actual.
 *
 * Los emojis personalizados pertenecen a la aplicación de Discord que los subió,
 * así que un template creado con los IDs de otra aplicación hace que Discord
 * rechace el panel de armas entero con COMPONENT_INVALID_EMOJI y `/raid create`
 * falle. El emparejamiento se hace por NOMBRE de arma, que es lo único estable
 * entre catálogos: los IDs no se parecen en nada de un entorno a otro.
 *
 * Funciona sobre un template ya guardado en Mongo o sobre el archivo JSON que se
 * usa para importarlo, para que el archivo no vuelva a meter los IDs viejos.
 *
 * Uso:
 *   node --env-file=.env scripts/remap-template-emojis.js "<titulo>" [--apply]
 *   node scripts/remap-template-emojis.js --file <ruta.json> --catalog dev [--apply]
 *   node scripts/remap-template-emojis.js --file <ruta.json> --catalog prod --out <nuevo.json> --apply
 *
 * --out escribe una copia nueva en vez de modificar el original (se niega a
 * sobrescribir), y --title le cambia el título de paso.
 *
 * Sin --apply solo enseña los cambios. El modo --file no necesita BD, pero sí
 * saber a qué catálogo apuntar: sin `.env` cargado el entorno se detecta como
 * producción, que es justo el error que este script existe para arreglar, así
 * que ahí `--catalog dev|prod` es obligatorio.
 */
const fs = require('node:fs');
const path = require('node:path');

const { getWeaponsPath, isProd, PROD_FILE, DEV_FILE } = require('../src/weapons/weaponsSource');

const args = process.argv.slice(2);
const aplicar = args.includes('--apply');
const indiceArchivo = args.indexOf('--file');
const archivo = indiceArchivo !== -1 ? args[indiceArchivo + 1] : null;
const indiceCatalogo = args.indexOf('--catalog');
const catalogoPedido = indiceCatalogo !== -1 ? args[indiceCatalogo + 1] : null;
const indiceSalida = args.indexOf('--out');
const salida = indiceSalida !== -1 ? args[indiceSalida + 1] : null;
const indiceTitulo = args.indexOf('--title');
const nuevoTitulo = indiceTitulo !== -1 ? args[indiceTitulo + 1] : null;
const consumidos = new Set([indiceArchivo + 1, indiceCatalogo + 1, indiceSalida + 1, indiceTitulo + 1]);
const titulo = args.find((arg, i) => !arg.startsWith('--') && !consumidos.has(i));

const USO =
  '  node --env-file=.env scripts/remap-template-emojis.js "Avalonianas Chuny" [--apply]\n' +
  '  node scripts/remap-template-emojis.js --file t.json --catalog dev [--apply]\n' +
  '  node scripts/remap-template-emojis.js --file t.json --catalog prod --out t-prod.json [--title "..."] --apply';

if (!archivo && !titulo) {
  console.error(`Falta el template.\n${USO}`);
  process.exit(1);
}

if (catalogoPedido && !['dev', 'prod'].includes(catalogoPedido)) {
  console.error(`--catalog admite "dev" o "prod", no "${catalogoPedido}".`);
  process.exit(1);
}

if (archivo && !catalogoPedido && !process.env.GUILD_ID) {
  console.error(
    'Sin `.env` cargado no se puede saber el entorno y se asumiría producción.\n' +
      `Indica el catálogo con --catalog dev|prod.\n${USO}`,
  );
  process.exit(1);
}

/** Ruta del catálogo elegido: --catalog manda sobre la detección del entorno. */
const rutaCatalogo = () => {
  if (!catalogoPedido) return getWeaponsPath();
  return path.join(__dirname, '../src/weapons', catalogoPedido === 'prod' ? PROD_FILE : DEV_FILE);
};

/** Normaliza un nombre de arma para compararlo entre catálogos. */
const norm = (valor) =>
  String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Índice nombre de arma -> emoji, sobre el catálogo del entorno actual. */
function buildIndex() {
  const catalogo = JSON.parse(fs.readFileSync(rutaCatalogo(), 'utf8')).weapons;
  const porNombre = new Map();
  for (const [categoria, grupo] of Object.entries(catalogo)) {
    for (const arma of grupo.data || []) {
      porNombre.set(norm(arma.name), { emoji: String(arma.emoji), categoria });
    }
  }
  return porNombre;
}

/**
 * Reescribe in situ los emojis de un objeto `weapons` de template.
 * @returns {{ cambios: number, sinResolver: string[] }}
 */
function remapWeapons(weapons, porNombre) {
  const sinResolver = [];
  let cambios = 0;

  for (const [clave, grupo] of Object.entries(weapons || {})) {
    let emojiPrincipal = null;

    for (const arma of grupo.data || []) {
      const equivalente = porNombre.get(norm(arma.name));
      if (!equivalente) {
        sinResolver.push(`${clave} / ${arma.name}`);
        continue;
      }
      if (emojiPrincipal === null) emojiPrincipal = equivalente.emoji;
      if (String(arma.emoji) !== equivalente.emoji) {
        console.log(`  ${clave.padEnd(20)} arma "${arma.name}": ${arma.emoji} -> ${equivalente.emoji}`);
        arma.emoji = equivalente.emoji;
        cambios++;
      }
    }

    // El emoji del grupo sigue la convención del template: el del arma principal.
    if (emojiPrincipal && String(grupo.defaultEmoji) !== emojiPrincipal) {
      console.log(`  ${clave.padEnd(20)} grupo "${grupo.displayName}": ${grupo.defaultEmoji} -> ${emojiPrincipal}`);
      grupo.defaultEmoji = emojiPrincipal;
      cambios++;
    }
  }

  return { cambios, sinResolver };
}

/** Informe común a los dos modos. */
function report({ cambios, sinResolver }) {
  console.log(`\ncambios: ${cambios}`);
  if (sinResolver.length) {
    console.log(`sin equivalencia en el catálogo (${sinResolver.length}):`);
    for (const entrada of sinResolver) console.log(`  - ${entrada}`);
  }
  if (!aplicar) console.log('\n(dry run: no se escribió nada. Añade --apply para guardar)');
}

/**
 * Modo archivo: deja el JSON listo para importar, sin tocar la BD.
 *
 * Con --out escribe una copia aparte y no toca el original, que es lo que se
 * quiere para tener el mismo template en los dos entornos.
 */
function runFile(porNombre) {
  const ruta = path.resolve(archivo);
  const original = fs.readFileSync(ruta, 'utf8');
  const template = JSON.parse(original);

  console.log(`archivo:  ${ruta}`);
  if (salida) console.log(`salida:   ${path.resolve(salida)}`);
  console.log(`template: "${template.title}" (${Object.keys(template.weapons || {}).length} grupos)\n`);

  if (nuevoTitulo) template.title = nuevoTitulo;

  const resultado = remapWeapons(template.weapons, porNombre);
  report(resultado);

  if (!aplicar) return;

  if (salida) {
    const destino = path.resolve(salida);
    if (fs.existsSync(destino)) {
      console.error(`\nYa existe ${destino}. Bórralo o elige otro nombre.`);
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(destino, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    console.log(`\n✅ Template escrito y listo para importar: ${destino}`);
    console.log(`   el original no se tocó.`);
    return;
  }

  if (resultado.cambios === 0) return;

  const backup = `${ruta.replace(/\.json$/i, '')}.bak.json`;
  fs.writeFileSync(backup, original, 'utf8');
  fs.writeFileSync(ruta, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  console.log(`\n✅ Archivo actualizado y listo para importar.`);
  console.log(`   copia previa: ${backup}`);
}

/** Modo BD: corrige el template ya guardado. */
async function runDb(porNombre) {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const Template = require('../src/database/models/Template');

  const doc = await Template.findOne({ title: titulo });
  if (!doc) {
    console.error(`No existe ningún template con el título "${titulo}".`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`template: "${doc.title}" (${Object.keys(doc.weapons || {}).length} grupos)\n`);

  const weapons = JSON.parse(JSON.stringify(doc.weapons || {}));
  const resultado = remapWeapons(weapons, porNombre);
  report(resultado);

  if (aplicar && resultado.cambios > 0) {
    const backup = path.join(__dirname, `../.template-backup-${doc._id}.json`);
    fs.writeFileSync(backup, JSON.stringify(doc.toObject(), null, 2), 'utf8');
    await Template.updateOne({ _id: doc._id }, { $set: { weapons } });
    console.log(`\n✅ Template "${doc.title}" actualizado.`);
    console.log(`   copia previa: ${path.resolve(backup)}`);
  } else if (aplicar) {
    console.log('\nNada que guardar.');
  }

  await mongoose.disconnect();
}

(async () => {
  const porNombre = buildIndex();
  const origen = catalogoPedido ? '--catalog' : `entorno ${isProd() ? 'PRODUCCIÓN' : 'DESARROLLO'}`;
  console.log(`catálogo: ${path.basename(rutaCatalogo())} (${porNombre.size} armas, por ${origen})\n`);

  if (archivo) runFile(porNombre);
  else await runDb(porNombre);
})().catch((error) => {
  console.error('fallo:', error.message);
  process.exit(1);
});
