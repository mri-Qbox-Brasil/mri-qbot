const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Configuration = sequelize.define("Configuration", {
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
      // Garantir que o valor seja sempre serializado corretamente
      get() {
        const rawValue = this.getDataValue("value");
        // Se for string, fazer parse
        if (typeof rawValue === "string") {
          try {
            return JSON.parse(rawValue);
          } catch (e) {
            console.error(
              "[Configuration] Erro ao fazer parse do valor JSON:",
              e
            );
            return rawValue;
          }
        }
        return rawValue;
      },
      set(value) {
        // Garantir que sempre salvamos um objeto válido
        if (typeof value === "object" && value !== null) {
          this.setDataValue("value", value);
        } else if (typeof value === "string") {
          try {
            const parsed = JSON.parse(value);
            this.setDataValue("value", parsed);
          } catch (e) {
            console.error(
              "[Configuration] Erro ao fazer parse do valor antes de salvar:",
              e
            );
            this.setDataValue("value", value);
          }
        } else {
          this.setDataValue("value", value);
        }
      },
    },
  });

  // Métodos auxiliares acoplados no modelo
  Configuration.getConfig = async function (guildId, key) {
    const config = await this.findOne({ where: { guildId, key } });
    if (!config) return null;

    // Garantir que o valor seja um objeto válido
    const value = config.value;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (e) {
        console.error(
          "[Configuration] Erro ao fazer parse do valor no getConfig:",
          e
        );
        return null;
      }
    }
    return value;
  };

  Configuration.setConfig = async function (guildId, key, value) {
    // Garantir que o valor seja um objeto JavaScript válido, não uma string JSON
    let cleanValue = value;
    if (typeof value === "string") {
      try {
        cleanValue = JSON.parse(value);
      } catch (e) {
        console.error(
          "[Configuration] Erro ao fazer parse do valor no setConfig:",
          e
        );
        // Se não conseguir fazer parse, tentar salvar como está
        cleanValue = value;
      }
    }

    // Garantir que não é um objeto com índices numéricos (corrompido)
    if (
      typeof cleanValue === "object" &&
      cleanValue !== null &&
      !Array.isArray(cleanValue)
    ) {
      const keys = Object.keys(cleanValue);
      if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
        console.warn(
          "[Configuration] Configuração corrompida detectada, tentando reconstruir..."
        );
        // Tentar reconstruir a string JSON a partir dos caracteres
        try {
          const jsonString = keys
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map((k) => cleanValue[k])
            .join("");
          cleanValue = JSON.parse(jsonString);
          console.log("[Configuration] Configuração reconstruída com sucesso");
        } catch (e) {
          console.error(
            "[Configuration] Não foi possível reconstruir a configuração corrompida:",
            e
          );
          // Se não conseguir reconstruir, usar o valor como está (pode causar problemas, mas melhor que quebrar)
        }
      }
    }

    await this.upsert({ guildId, key, value: cleanValue });
  };

  Configuration.removeConfig = async function (guildId, key) {
    await this.destroy({ where: { guildId, key } });
  };

  return Configuration;
};
