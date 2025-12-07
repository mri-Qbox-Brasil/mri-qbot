const fs = require('fs');
const path = require('path');
const db = require('./db');

async function loadModelsIntoClient(client) {
    client.logger.info('Carregando modelos do banco de dados no client...');
    const modelsDir = path.join(__dirname, 'model');
    const modelFiles = fs.readdirSync(modelsDir).filter(file => file.endsWith('.js'));
    const sequelize = db.sequelize;

    try {
        await db.initDatabase(); // Inicializa o banco de dados (autentica e opcionalmente sync)
        await db.runMigrations(); // Executa as migrations pendentes e aguarda conclusão
    } catch (err) {
        throw new Error(`Falha ao inicializar banco/migrations: ${err?.stack || err?.message || err}`);
    }

    client.db = {
        sequelize: sequelize, // ✅ Adiciona a instância do Sequelize aqui
    };


    for (const file of modelFiles) {
        const modelPath = path.join(modelsDir, file);
        const defineModel = require(modelPath);

        if (typeof defineModel !== 'function') {
            client.logger.warn(`⚠️ O arquivo ${file} não exporta uma função. Verifique o modelo.`);
            continue;
        }

        const model = defineModel(sequelize);
        client.logger.debug(`✅ Modelo carregado: ${model.name}`);
        client.db[model.name] = model;
    }

    client.logger.info('📦 Modelos carregados; migrations/sync delegados ao initDatabase.');
}

module.exports = { loadModelsIntoClient };
