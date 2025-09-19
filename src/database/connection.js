const mongoose = require('mongoose');

/**
 * Conecta a la base de datos MongoDB
 */
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      console.error('[ERROR] MONGODB_URI no está definido en las variables de entorno');
      process.exit(1);
    }
    
    await mongoose.connect(mongoURI);
    console.log('[INFO] Conectado a MongoDB exitosamente');
  } catch (error) {
    console.error('[ERROR] Error conectando a MongoDB:', error);
    process.exit(1);
  }
};

module.exports = { connectDB };
