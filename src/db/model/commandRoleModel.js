// src/db/CommandRoles.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('CommandRoles', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        commandName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        roleId: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        guildId: {
            type: DataTypes.STRING,
            allowNull: false
        }
    });
};
