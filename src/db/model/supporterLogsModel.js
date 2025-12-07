const { DataTypes } = require('sequelize');
const { SupportActionType } = require('../../utils/constants');

module.exports = (sequelize) => {
    const SupporterLogs = sequelize.define('SupporterLogs', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        supportId: {
            type: DataTypes.UUID,
            allowNull: false,
            defaultValue: DataTypes.UUIDV4,
        },
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
            type: DataTypes.ENUM(...Object.values(SupportActionType)),
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
    }, { timestamps: true });

    return SupporterLogs;
};
