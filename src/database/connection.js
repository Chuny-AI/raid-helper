const mongoose = require('mongoose');
const { environmentName } = require('../config/environment');

/**
 * Conecta a la base de datos MongoDB.
 *
 * Hay una sola URI, MONGODB_URI: cada entorno apunta a su propia base desde su
 * propio .env. Así el entorno no puede elegir la base equivocada, y el bot de
 * desarrollo nunca escribe en la de producción.
 */
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      console.error('[ERROR] MONGODB_URI no está definido en las variables de entorno');
      console.error(`[INFO] Modo actual: ${environmentName()}`);
      process.exit(1);
    }

    await mongoose.connect(mongoURI);
    console.log(`[INFO] Conectado a MongoDB exitosamente (${environmentName()})`);
  } catch (error) {
    console.error('[ERROR] Error conectando a MongoDB:', error);
    process.exit(1);
  }
};

module.exports = { connectDB };
