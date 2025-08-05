const fs = require('fs');
const path = require('path');
const sequelize = require('./db');

async function loadModelsIntoClient(client) {
    const modelsDir = path.join(__dirname, 'model');
    const modelFiles = fs.readdirSync(modelsDir).filter(file => file.endsWith('.js'));

    client.db = {
        sequelize, // ✅ Adiciona a instância do Sequelize aqui
    };

    for (const file of modelFiles) {
        const modelPath = path.join(modelsDir, file);
        const defineModel = require(modelPath);

        if (typeof defineModel !== 'function') {
            console.warn(`⚠️ O arquivo ${file} não exporta uma função. Verifique o modelo.`);
            continue;
        }

        const model = defineModel(sequelize);
        client.db[model.name] = model;
    }

    // Sincronizar todos os modelos
    await sequelize.sync();
    console.log('📦 Todos os modelos foram sincronizados com o banco de dados.');
}

module.exports = { loadModelsIntoClient };
