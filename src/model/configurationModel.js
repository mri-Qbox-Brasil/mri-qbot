const { DataTypes } = require('sequelize');
const sequelize = require('../database/sequelize');

const Configuration = sequelize.define('configurations', {
    guildId: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
    },
    key: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
    },
    value: {
        type: DataTypes.JSON,
        allowNull: false,
    },
});

Configuration.sync();

async function getConfig(guildId, key) {
    const config = await Configuration.findOne({ where: { guildId, key } });
    return config ? JSON.parse(config.value) : null;
}

async function setConfig(guildId, key, value) {
    await Configuration.upsert({ guildId, key, value });
}

async function removeConfig(guildId, key) {
    await Configuration.destroy({ where: { guildId, key } });
}

module.exports = { getConfig, setConfig, removeConfig };
