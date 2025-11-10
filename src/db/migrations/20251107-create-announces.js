const { DataTypes } = require('sequelize');
const announce = require('../../commands/utility/announce');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('Announces', {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },
            guildId: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            channelId: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            channelName: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            expiryDate: {
                type: DataTypes.DATE,
                allowNull: false,
            },
        });
        await queryInterface.createTable('AnnounceData', {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },
            guildId: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            channelId: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            ownerId: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            cmdChannelId: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            cmdMessageId: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            announceChannelId: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            content: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        });
    }
}