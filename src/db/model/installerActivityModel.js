const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const InstallerActivity = sequelize.define('InstallerActivity', {
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
            defaultValue: DataTypes.NOW
        }
    }, { 
        timestamps: true,
        tableName: 'InstallerActivities'
    });

    return InstallerActivity;
};
