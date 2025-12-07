const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('AnnounceData', {
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
        attachments: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        lockedUntil: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        sentAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, { timestamps: true });
}