/**
 * Configuración de bosses de Avalon para decoder
 */
const bosses = {
  construct: {
    name: 'Constructor',
    6: 'Doble dorado',
    7: 'Morado',
    9: 'Azul',
    8: 'Verde',
  },
  knightcaptain: {
    name: 'Caballero',
    8: 'Doble dorado',
    9: 'Morado',
    11: 'Azul',
    10: 'Verde',
  },
  archmage: {
    name: 'Bailarina',
    8: 'Doble dorado',
    9: 'Morado',
    10: 'Verde',
    11: 'Azul',
  },
  priest: {
    name: 'Suicida',
    8: 'Doble dorado',
    9: 'Morado',
    10: 'Verde',
    11: 'Azul',
  },
  basiliskrider: {
    name: 'Basilisco',
    8: 'Doble dorado',
    9: 'Morado',
    10: 'Verde',
    11: 'Azul',
  },
  legendarybossgrail: {
    name: 'Jefe final',
    2: 'Doble dorado',
    4: 'Morado',
    5: 'Azul',
  },
};

/**
 * Mapeo de colores de cofres a colores de embed de Discord
 */
const colorMap = {
  'Doble dorado': '#FFD700', // Dorado
  'Morado': '#8A2BE2',       // Morado
  'Azul': '#0066FF',         // Azul
  'Verde': '#00FF00',        // Verde
};

/**
 * Emojis para cada tipo de cofre
 */
const chestEmojis = {
  'Doble dorado': '💰',
  'Morado': '🟣',
  'Azul': '🔵',
  'Verde': '🟢',
};

/**
 * Prioridad de cofres (mayor número = mayor prioridad)
 */
const chestPriority = {
  'Doble dorado': 4,
  'Morado': 3,
  'Azul': 2,
  'Verde': 1,
};

/**
 * Imágenes de fondo aleatorias de Albion Online
 */
const albionBackgrounds = [
  'https://media.discordapp.net/attachments/1289065983071223864/1419911950954926201/hNAKGAl.jpeg?ex=68d37b8d&is=68d22a0d&hm=435ef11c958095628f61f84f85e2ddfb4d4d2829698d623ae26ac8eee012886a&=&format=webp&width=2156&height=1216'
];

module.exports = {
  bosses,
  colorMap,
  chestEmojis,
  chestPriority,
  albionBackgrounds
};