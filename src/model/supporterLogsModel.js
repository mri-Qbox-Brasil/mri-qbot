const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const SupporterLogs = sequelize.define('SupporterLogs', {
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
        allowNull: false,
    },
    actionType: {
        type: DataTypes.ENUM('added', 'removed', 'expired'),
        allowNull: false,
    },
    performedBy: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    actionDate: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    }
});

SupporterLogs.sync();

module.exports = SupporterLogs;
