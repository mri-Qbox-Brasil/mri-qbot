const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Supporters = sequelize.define('Supporters', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.STRING,
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
        },
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    });

    return Supporters;
};
