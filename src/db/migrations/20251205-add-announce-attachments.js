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
            // If describeTable fails (table missing), rethrow so migration runner can report
            // For other errors, try to add the column and let DB raise duplicate error if it truly exists
            if (err && err.name === 'SequelizeDatabaseError') throw err;
            // fallback: attempt to add column
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
            // ignore if table doesn't exist or column already removed
        }
    }
};
