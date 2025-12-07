const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = 'AnnounceData';
        try {
            const desc = await queryInterface.describeTable(tableName);
            if (!desc || !desc.attachments) {
                await queryInterface.addColumn(tableName, 'attachments', {
                    type: DataTypes.TEXT,
                    allowNull: true,
                });
            }
        } catch (err) {
            if (err && err.name === 'SequelizeDatabaseError') throw err;
            await queryInterface.addColumn(tableName, 'attachments', {
                type: DataTypes.TEXT,
                allowNull: true,
            });
        }
    },

    down: async (queryInterface, Sequelize) => {
        const tableName = 'AnnounceData';
        try {
            const desc = await queryInterface.describeTable(tableName);
            if (desc && desc.attachments) {
                await queryInterface.removeColumn(tableName, 'attachments');
            }
        } catch (err) {
        }
    }
};
