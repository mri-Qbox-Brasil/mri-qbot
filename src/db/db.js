require('dotenv').config();
const { Sequelize } = require('sequelize');
const { logger } = require('../utils/logger');
const { Umzug, SequelizeStorage } = require('umzug');
const path = require('path');
const fs = require('fs');

// Verificação inicial do dialeto
if (!process.env.DB_DIALECT) {
	logger.error('A variável de ambiente DB_DIALECT não está definida.');
	process.exit(1);
}
const dialect = process.env.DB_DIALECT;

// Monta a lista de variáveis obrigatórias dependendo do dialeto
const requiredEnvVars = ['DB_DIALECT'];
if (dialect === 'sqlite') {
	requiredEnvVars.push('DB_STORAGE'); // caminho do arquivo sqlite
} else {
	requiredEnvVars.push('DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT');
}

// Valida todas as variáveis obrigatórias de uma vez
requiredEnvVars.forEach((varName) => {
	if (!process.env[varName]) {
		logger.error(`A variável de ambiente ${varName} não está definida.`);
		process.exit(1);
	}
});

// Configuração base
const baseOptions = {
	dialect,
	// envia logs do sequelize para o logger.debug quando DEBUG_MODE=true
	logging: process.env.DEBUG_MODE === 'true' ? (msg) => logger.debug(msg) : false,
	pool: {
		max: 5,
		min: 0,
		acquire: 30000,
		idle: 10000,
	},
};

let sequelize;

// Configurações específicas para SQLite
if (dialect === 'sqlite') {
	// Cria instância Sequelize para sqlite usando a forma de options
	sequelize = new Sequelize({
		dialect: 'sqlite',
		storage: process.env.DB_STORAGE,
		logging: baseOptions.logging,
		pool: baseOptions.pool,
	});
} else {
	// Usa a assinatura (database, username, password, options) para outros dialetos
	sequelize = new Sequelize(
		process.env.DB_NAME,
		process.env.DB_USER,
		process.env.DB_PASSWORD,
		{
			host: process.env.DB_HOST,
			port: process.env.DB_PORT,
			dialect,
			logging: baseOptions.logging,
			pool: baseOptions.pool,
		}
	);
}

// Adiciona função para inicializar/autenticar e opcionalmente sincronizar o banco
async function initDatabase({ alter = (process.env.DB_SYNC_ALTER === 'true'), force = (process.env.DB_SYNC_FORCE === 'true') } = {}) {
	try {
		await sequelize.authenticate();
		logger.info('Conexão com o banco de dados estabelecida com sucesso.');
		// Se DB_SYNC estiver true, sincroniza modelos com o DB.
		if (process.env.DB_SYNC === 'true') {
			logger.info(`Sincronizando modelos com o banco (alter=${alter}, force=${force})...`);
			await sequelize.sync({ alter, force });
			logger.info('Sincronização concluída.');
		} else {
			logger.info('DB_SYNC não ativado: não será feito sync automático.');
		}
	} catch (err) {
		logger.error('Erro ao inicializar o banco de dados:', err);
		process.exit(1);
	}
}

// Adiciona função para executar migrations via Umzug
async function runMigrations() {
	try {
		// tenta localizar a pasta de migrations em local relativo a este arquivo
		const migrationsDir = path.join(__dirname, 'migrations');
		const globPattern = path.join(migrationsDir, '*.js').replace(/\\/g, '/'); // garante barras normais (compatibilidade com fast-glob no Windows)

		// Verifica se a pasta existe e lista arquivos .js para diagnóstico
		let migrationFiles = [];
		try {
			migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));
		} catch (err) {
			logger.warn(`Pasta de migrations não encontrada em: ${migrationsDir}`);
		}

		if (!migrationFiles || migrationFiles.length === 0) {
			logger.info(`Nenhuma migration encontrada em ${migrationsDir}. Padrão glob usado: ${globPattern}`);
			return;
		}

		logger.info(`Arquivos de migration encontrados em ${migrationsDir}: ${migrationFiles.join(', ')}`);
		logger.debug(`Usando glob para Umzug: ${globPattern}`);

		const umzug = new Umzug({
			migrations: {
				glob: globPattern,
				// resolve garante compatibilidade com diferentes formas de export (default ou named)
				resolve: ({ name, path: migrationPath, context }) => {
					const migrationModule = require(migrationPath);
					const migration = migrationModule && migrationModule.default ? migrationModule.default : migrationModule;
					const queryInterface = context; // será sequelize.getQueryInterface()

					const up = migration.up
						? async () => migration.up(queryInterface, Sequelize)
						: async () => Promise.resolve();
					const down = migration.down
						? async () => migration.down(queryInterface, Sequelize)
						: async () => Promise.resolve();

					return { name, up, down };
				},
			},
			context: sequelize.getQueryInterface(),
			storage: new SequelizeStorage({ sequelize }),
			logger: {
				info: (msg) => logger.info(msg),
				warn: (msg) => logger.warn(msg),
				error: (err) => logger.error(err),
			},
		});

		const pending = await umzug.pending();
		if (!pending || pending.length === 0) {
			logger.info('Nenhuma migration pendente.');
			return;
		}

		logger.info(`Aplicando ${pending.length} migration(s)...`);
		await umzug.up();
		logger.info('Migrations aplicadas com sucesso.');
	} catch (err) {
		logger.error('Erro ao executar migrations:', err);
		throw err;
	}
}

// Exporta runMigrations junto com a instância do Sequelize
module.exports = {sequelize, runMigrations, initDatabase};
