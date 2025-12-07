const { DataTypes } = require('sequelize');
const { SupportActionType } = require('../../utils/constants');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('SupporterLogs', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      supportId: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
      },
      userId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      guildId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      roleId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      actionType: {
        type: DataTypes.ENUM(...Object.values(SupportActionType)),
        allowNull: false,
      },
      performedBy: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      actionDate: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  down: async (queryInterface /* , Sequelize */) => {
    // remove enum type if needed by dialect (some dialects need explicit drop)
    try {
      await queryInterface.dropTable('SupporterLogs');
    } catch (e) {
      // best-effort
      throw e;
    }
  },
};
