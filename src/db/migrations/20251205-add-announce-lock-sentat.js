const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('AnnounceData', 'lockedUntil', {
            type: DataTypes.DATE,
            allowNull: true,
        });

        await queryInterface.addColumn('AnnounceData', 'sentAt', {
            type: DataTypes.DATE,
            allowNull: true,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('AnnounceData', 'lockedUntil');
        await queryInterface.removeColumn('AnnounceData', 'sentAt');
    }
};
