const EMOJI_ENABLED = process.env.LOGGER_EMOJI !== 'false'; // padrão: true
const EMOJI = {
	info:    'ℹ️ ',
	warn:    '⚠️ ',
	error:   '❌',
	debug:   '🐛',
	success: '✅'
};

const DEBUG_MODE = !!process.env.DEBUG_MODE;
const util = require('util');
function timeStamp() {
	return new Date().toISOString();
}
const formatMeta = (meta) => {
	if (meta === undefined || meta === null) return '';
	if (meta instanceof Error) return ' ' + (meta.stack || meta.message);
	if (typeof meta === 'string') return ' ' + meta;
	// util.inspect lida com referências circulares e dá saída legível
	return ' ' + util.inspect(meta, { depth: 4, colors: false, compact: false });
};
const prefix = (level) => `${EMOJI_ENABLED && EMOJI[level] ? EMOJI[level] + ' ' : ''}[${level.toUpperCase()}] ${timeStamp()} -`;

// If GRAYLOG_HOST is set we try to use winston + winston-graylog2 transport
let logger;
let usingWinston = false;
if (process.env.GRAYLOG_HOST) {
	try {
		const winston = require('winston');
		const WinstonGraylog2 = require('winston-graylog2');

		const transports = [];

		// Console transport (keeps emoji/plain formatting for local view)
		transports.push(new winston.transports.Console({
			format: winston.format.printf(({ level, message, timestamp, ...meta }) => {
				if (level === 'debug' && !DEBUG_MODE) return '';
				const ts = timeStamp();
				const lvl = level.toLowerCase();
				const metaStr = Object.keys(meta).length ? ' ' + util.inspect(meta, { depth: 4, colors: false, compact: false }) : '';
				return `${EMOJI_ENABLED && EMOJI[lvl] ? EMOJI[lvl] + ' ' : ''}[${lvl.toUpperCase()}] ${ts} - ${message}${metaStr}`;
			})
		}));

		// Graylog transport
		const graylogOptions = {
			servers: [{ host: process.env.GRAYLOG_HOST, port: parseInt(process.env.GRAYLOG_PORT || '12201', 10) }],
			hostname: process.env.GRAYLOG_HOSTNAME || require('os').hostname(),
			facility: process.env.GRAYLOG_FACILITY || 'mri-qbot',
			bufferSize: 1400
		};
		transports.push(new WinstonGraylog2(graylogOptions));

		const winstonLogger = winston.createLogger({
			level: DEBUG_MODE ? 'debug' : 'info',
			transports
		});

		// provide a thin wrapper to keep the old API
		logger = {
			info: (msg, meta) => winstonLogger.info(msg, meta),
			warn: (msg, meta) => winstonLogger.warn(msg, meta),
			error: (msg, meta) => winstonLogger.error(msg, meta),
			debug: (msg, meta) => { if (DEBUG_MODE) winstonLogger.debug(msg, meta); },
			success: (msg, meta) => winstonLogger.info(msg, meta)
		};
		logger.emojis = EMOJI;
		usingWinston = true;
	} catch (err) {
		// If installation missing or error occurs, fallback to console logger below
		console.error('[LOGGER] falha ao carregar winston/winston-graylog2, fallback para console:', err && err.message);
	}
}

if (!usingWinston) {
	logger = {
		info: (msg, meta) => console.log(`${prefix('info')} ${msg}${formatMeta(meta)}`),
		warn: (msg, meta) => console.warn(`${prefix('warn')} ${msg}${formatMeta(meta)}`),
		error: (msg, meta) => console.error(`${prefix('error')} ${msg}${formatMeta(meta)}`),
		debug: (msg, meta) => { if (DEBUG_MODE) console.debug(`${prefix('debug')} ${msg}${formatMeta(meta)}`); },
		success: (msg, meta) => console.log(`${prefix('success')} ${msg}${formatMeta(meta)}`)
	};
	logger.emojis = EMOJI;
}

function attachLogger(client) {
	if (!client) return client;
	client.logger = logger;
	client.log = logger; // alias curto
	return client;
}

module.exports = { logger, attachLogger };
