const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('AnnounceData', 'attachments', {
            type: DataTypes.TEXT,
            allowNull: true,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('AnnounceData', 'attachments');
    }
};
