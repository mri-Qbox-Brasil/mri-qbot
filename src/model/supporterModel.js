const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const Supporters = sequelize.define('supporters', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4
    },
    userId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    roleId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    expirationDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    supportUserId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    guildId: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

Supporters.sync();

module.exports = Supporters;
