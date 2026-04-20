const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('InstallerActivities', {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },
            discordId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            sessionId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            event: {
                type: DataTypes.ENUM('start', 'finish', 'error', 'cancel'),
                allowNull: false
            },
            details: {
                type: DataTypes.STRING(255),
                allowNull: true
            },
            timestamp: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            createdAt: {
                type: DataTypes.DATE,
                allowNull: false
            },
            updatedAt: {
                type: DataTypes.DATE,
                allowNull: false
            }
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('InstallerActivities');
        // Note: ENUM types in PostgreSQL might need separate handling, 
        // but for SQLite/MySQL it's usually fine.
    }
};
