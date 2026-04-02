const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const ScriptSnapshot = sequelize.define('ScriptSnapshot', {
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
            defaultValue: {},
        },
        protected: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: [],
        },
        lastUpdate: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    }, {
        tableName: 'ScriptSnapshots',
        timestamps: true,
    });

    return ScriptSnapshot;
};
