const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = 'AnnounceData';
        try {
            const desc = await queryInterface.describeTable(tableName);
            if (!desc || !desc.lockedUntil) {
                await queryInterface.addColumn(tableName, 'lockedUntil', {
                    type: DataTypes.DATE,
                    allowNull: true,
                });
            }
            if (!desc || !desc.sentAt) {
                await queryInterface.addColumn(tableName, 'sentAt', {
                    type: DataTypes.DATE,
                    allowNull: true,
                });
            }
        } catch (err) {
            // If describeTable fails (table missing), rethrow so migration runner can report
            if (err && err.name === 'SequelizeDatabaseError') throw err;
            // fallback: attempt to add columns and let DB report duplicates if present
            try { await queryInterface.addColumn(tableName, 'lockedUntil', { type: DataTypes.DATE, allowNull: true }); } catch(_){}
            try { await queryInterface.addColumn(tableName, 'sentAt', { type: DataTypes.DATE, allowNull: true }); } catch(_){}
        }
    },

    down: async (queryInterface, Sequelize) => {
        const tableName = 'AnnounceData';
        try {
            const desc = await queryInterface.describeTable(tableName);
            if (desc && desc.lockedUntil) {
                await queryInterface.removeColumn(tableName, 'lockedUntil');
            }
            if (desc && desc.sentAt) {
                await queryInterface.removeColumn(tableName, 'sentAt');
            }
        } catch (err) {
            // ignore if table doesn't exist or columns already removed
        }
    }
};
