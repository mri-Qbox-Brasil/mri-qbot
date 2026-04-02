const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('ScriptSnapshots', {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            repoName: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            version: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            files: {
                type: DataTypes.JSON,
                allowNull: false,
            },
            protected: {
                type: DataTypes.JSON,
                allowNull: false,
            },
            lastUpdate: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            createdAt: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            updatedAt: {
                type: DataTypes.DATE,
                allowNull: false,
            },
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('ScriptSnapshots');
    },
};
