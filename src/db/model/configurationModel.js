const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Configuration = sequelize.define('Configuration', {
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

    // Métodos auxiliares acoplados no modelo
    Configuration.getConfig = async function (guildId, key) {
        const config = await this.findOne({ where: { guildId, key } });
        return config ? config.value : null;
    };

    Configuration.setConfig = async function (guildId, key, value) {
        await this.upsert({ guildId, key, value });
    };

    Configuration.removeConfig = async function (guildId, key) {
        await this.destroy({ where: { guildId, key } });
    };

    return Configuration;
};
