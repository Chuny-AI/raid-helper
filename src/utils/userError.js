/**
 * Error cuyo mensaje está escrito para el usuario final.
 *
 * Existe para que los `catch` que envuelven un comando entero puedan distinguir
 * una validación ("La cantidad debe ser un numero entero positivo.") de un fallo
 * inesperado, cuyo mensaje puede traer rutas, nombres de colección o fragmentos
 * de una consulta de Mongo y no debe llegar a Discord.
 *
 * Uso: lánzalo en los servicios cuando el texto sea explicativo para quien
 * ejecuta el comando; para cualquier otra cosa, un `Error` normal.
 */
class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
  }
}

/** @returns {boolean} true si el mensaje del error se puede mostrar al usuario. */
const isUserError = (error) => error instanceof UserError;

module.exports = { UserError, isUserError };
