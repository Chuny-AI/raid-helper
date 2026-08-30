const mongoose = require('mongoose');

const RaidEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true
  },
  guildId: {
    type: String,
    required: true
  },
  channelId: {
    type: String,
    required: true
  },
  messageId: {
    type: String,
    required: false
  },
  templateName: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  time: String,
  // Unix timestamp (segundos) resuelto UNA vez a partir de `time` al publicar el raid.
  // `parseUTCTime(time)` no es idempotente (si la hora ya pasó, salta al día siguiente
  // relativo a "ahora"), así que no puede recalcularse en cada render sin que la hora
  // mostrada se vaya corriendo. Este campo es la fuente de verdad para renderizar.
  eventTimestamp: Number,
  color: String,
  image: String,
  reminder: String,
  rolesToNotify: [String],
  leaderId: {
    type: String,
    required: false
  },

  // Hilo privado de coordinación pedido en `/raid create` (opción `thread`).
  // `threadId` es la fuente de verdad de si el hilo existe ahora mismo: se pone
  // a null al finalizar el raid, cuando el hilo se borra.
  threadEnabled: {
    type: Boolean,
    default: false
  },
  threadId: {
    type: String,
    default: null
  },

  // --- Estado estructurado (stateVersion 2) ---
  // Versión del formato de estado. 1 = legacy (solo embedSnapshot de texto).
  // 2 = estado estructurado por slot (groups/slots/waitlist/cannotGo/looters).
  stateVersion: {
    type: Number,
    default: 1
  },
  // Un grupo = una sección del embed (ej. "DPS"). Congelado al publicar el raid.
  groups: [{
    groupKey: String,
    displayName: String,
    emoji: String,
    maxPlayers: Number,
    order: Number
  }],
  // Un slot = una entrada de arma dentro de un grupo. slotId = "{groupKey}~{itemIndex}",
  // el mismo valor que usan las opciones del select. Congela weaponName/label/emoji/units/url
  // tal como estaban al publicar, así el raid no se ve afectado si el template se edita después.
  slots: [{
    slotId: String,
    groupKey: String,
    itemIndex: Number,
    weaponName: String,
    label: String,
    emoji: String,
    units: Number,
    url: String,
    disabled: { type: Boolean, default: false },
    users: [{
      userId: String,
      username: String,
      joinedAt: { type: Date, default: Date.now }
    }]
  }],
  waitlist: [{
    userId: String,
    username: String,
    // slotIds vacío = comodín (acepta cualquier arma liberada)
    slotIds: [String],
    createdAt: { type: Date, default: Date.now }
  }],
  cannotGo: [{
    userId: String,
    username: String,
    at: { type: Date, default: Date.now }
  }],
  looters: {
    max: { type: Number, default: 0 },
    users: [{
      userId: String,
      username: String,
      at: { type: Date, default: Date.now }
    }]
  },
  fullNotificationSent: {
    type: Boolean,
    default: false
  },

  // Asistencia real, registrada por el líder DESPUÉS de finalizar el raid.
  // Se guardan SOLO los ausentes: quien participó y no está en esta lista se
  // considera que asistió. Así el informe existe desde el instante del cierre
  // (todos presentes) y el líder solo tiene que marcar las excepciones.
  // No confundir con `cannotGo`, que es quien avisó ANTES y liberó su plaza:
  // ese ni siquiera entra en el reparto de asistencia.
  attendance: {
    absent: [{
      userId: String,
      username: String,
      at: { type: Date, default: Date.now }
    }],
    updatedBy: String,
    updatedAt: Date
  },
  closedBy: String,
  closedAt: Date,

  // Estado del raid: 'active' | 'closed'
  status: {
    type: String,
    default: 'active',
    enum: ['active', 'closed']
  },
  // Snapshot del embed serializado (formato de texto legacy). Se sigue escribiendo
  // solo para raids en stateVersion 1; en stateVersion 2 se conserva de solo lectura
  // como referencia histórica y ya no se actualiza.
  embedSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // Armas deshabilitadas al crear el raid (valores tipo "group~group_1" o "weapon~group_1~0").
  // Vista derivada de `weaponOverrides`; se conserva para raids antiguos y para diagnóstico.
  disabledWeapons: [{ type: String }],
  // Configuración de armas elegida por el líder en /raid create: grupos y armas
  // deshabilitados, cupo del grupo y cupos por arma. Se aplica al construir el estado
  // inicial (groups/slots); se guarda como referencia de lo que se pidió al publicar.
  // Estructura: { groups: { [groupKey]: { disabled, maxPlayers, weapons: { [idx]: { disabled, units } } } } }
  weaponOverrides: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

RaidEventSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('RaidEvent', RaidEventSchema);
