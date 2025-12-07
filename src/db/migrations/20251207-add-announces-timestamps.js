const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Adds createdAt and updatedAt to Announces
    await queryInterface.addColumn('Announces', 'createdAt', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await queryInterface.addColumn('Announces', 'updatedAt', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    });

    // Adds createdAt and updatedAt to AnnounceData
    await queryInterface.addColumn('AnnounceData', 'createdAt', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await queryInterface.addColumn('AnnounceData', 'updatedAt', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    });
  },

  down: async (queryInterface /* , Sequelize */) => {
    await queryInterface.removeColumn('Announces', 'createdAt');
    await queryInterface.removeColumn('Announces', 'updatedAt');
    await queryInterface.removeColumn('AnnounceData', 'createdAt');
    await queryInterface.removeColumn('AnnounceData', 'updatedAt');
  },
};
