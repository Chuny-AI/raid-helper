const UserBalance = require('../database/models/UserBalance');

/**
 * Servicio para gestionar la economía de usuarios por servidor
 */
class EconomyService {
  /**
   * Obtiene o crea el balance de un usuario en un servidor
   */
  static async getUserBalance(userId, serverId) {
    try {
      return await UserBalance.findOrCreateBalance(userId, serverId);
    } catch (error) {
      throw new Error(`Error al obtener balance: ${error.message}`);
    }
  }

  /**
   * Añade dinero a un usuario en un servidor específico
   */
  static async addMoney(userId, serverId, amount) {
    try {
      if (amount <= 0) {
        throw new Error('La cantidad debe ser mayor a 0');
      }

      const userBalance = await this.getUserBalance(userId, serverId);
      await userBalance.addMoney(amount);

      return {
        success: true,
        newBalance: userBalance.balance,
        amountAdded: amount
      };
    } catch (error) {
      throw new Error(`Error al añadir dinero: ${error.message}`);
    }
  }

  /**
   * Elimina dinero de un usuario en un servidor específico
   */
  static async removeMoney(userId, serverId, amount) {
    try {
      if (amount <= 0) {
        throw new Error('La cantidad debe ser mayor a 0');
      }

      const userBalance = await this.getUserBalance(userId, serverId);

      if (userBalance.balance < amount) {
        throw new Error(`Saldo insuficiente. Balance actual: ${userBalance.balance.toLocaleString()}`);
      }

      await userBalance.removeMoney(amount);

      return {
        success: true,
        newBalance: userBalance.balance,
        amountRemoved: amount
      };
    } catch (error) {
      throw new Error(`Error al eliminar dinero: ${error.message}`);
    }
  }

  /**
   * Obtiene el balance de un usuario en un servidor
   */
  static async getBalance(userId, serverId) {
    try {
      const userBalance = await this.getUserBalance(userId, serverId);
      return {
        balance: userBalance.balance,
        lastUpdated: userBalance.lastUpdated
      };
    } catch (error) {
      throw new Error(`Error al obtener balance: ${error.message}`);
    }
  }

  /**
   * Obtiene el top de usuarios con más dinero en un servidor
   */
  static async getTopBalances(serverId, limit = 10) {
    try {
      return await UserBalance.getTopBalances(serverId, limit);
    } catch (error) {
      throw new Error(`Error al obtener top de balances: ${error.message}`);
    }
  }

  /**
   * Transfiere dinero entre usuarios en el mismo servidor
   */
  static async transferMoney(fromUserId, toUserId, serverId, amount) {
    try {
      if (amount <= 0) {
        throw new Error('La cantidad debe ser mayor a 0');
      }

      if (fromUserId === toUserId) {
        throw new Error('No puedes transferir dinero a ti mismo');
      }

      const fromBalance = await this.getUserBalance(fromUserId, serverId);
      const toBalance = await this.getUserBalance(toUserId, serverId);

      if (fromBalance.balance < amount) {
        throw new Error(`Saldo insuficiente. Balance actual: ${fromBalance.balance.toLocaleString()}`);
      }

      await fromBalance.removeMoney(amount);
      await toBalance.addMoney(amount);

      return {
        success: true,
        fromNewBalance: fromBalance.balance,
        toNewBalance: toBalance.balance,
        amountTransferred: amount
      };
    } catch (error) {
      throw new Error(`Error en transferencia: ${error.message}`);
    }
  }

  /**
   * Formatea un número como moneda
   */
  static formatCurrency(amount) {
    return amount.toLocaleString('es-ES') + ' 🪙';
  }

  /**
   * Obtiene estadísticas del servidor
   */
  static async getServerStats(serverId) {
    try {
      const totalUsers = await UserBalance.countDocuments({ serverId });
      const totalMoney = await UserBalance.aggregate([
        { $match: { serverId } },
        { $group: { _id: null, total: { $sum: '$balance' } } }
      ]);

      const averageBalance = totalUsers > 0 ? Math.round((totalMoney[0]?.total || 0) / totalUsers) : 0;

      return {
        totalUsers,
        totalMoney: totalMoney[0]?.total || 0,
        averageBalance
      };
    } catch (error) {
      throw new Error(`Error al obtener estadísticas: ${error.message}`);
    }
  }
}

module.exports = EconomyService;