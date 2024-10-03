const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const SupporterLogs = sequelize.define('supporter_logs', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    guildId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    roleId: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    actionType: {
        type: DataTypes.ENUM('added', 'removed', 'expired'),
        allowNull: false,
    },
    performedBy: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    actionDate: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    }
});

SupporterLogs.sync();

module.exports = SupporterLogs;
