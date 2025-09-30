const mongoose = require('mongoose');

/**
 * Conecta a la base de datos MongoDB
 * Usa MONGODB_URI_PROD si IS_PROD=TRUE, sino usa MONGODB_URI
 */
const connectDB = async () => {
  try {
    // Determinar qué URI usar basado en IS_PROD
    const isProd = process.env.IS_PROD === 'TRUE' || process.env.IS_PROD === 'true';
    const mongoURI = isProd ? process.env.MONGODB_URI_PROD : process.env.MONGODB_URI;
    
    if (!mongoURI) {
      const envVar = isProd ? 'MONGODB_URI_PROD' : 'MONGODB_URI';
      console.error(`[ERROR] ${envVar} no está definido en las variables de entorno`);
      console.error(`[INFO] Modo actual: ${isProd ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
      process.exit(1);
    }
    
    await mongoose.connect(mongoURI);
    console.log(`[INFO] Conectado a MongoDB exitosamente (${isProd ? 'PRODUCCIÓN' : 'DESARROLLO'})`);
  } catch (error) {
    console.error('[ERROR] Error conectando a MongoDB:', error);
    process.exit(1);
  }
};

module.exports = { connectDB };
