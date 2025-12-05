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

const logger = {
	info: (msg, meta) => console.log(`${prefix('info')} ${msg}${formatMeta(meta)}`),
	warn: (msg, meta) => console.warn(`${prefix('warn')} ${msg}${formatMeta(meta)}`),
	error: (msg, meta) => console.error(`${prefix('error')} ${msg}${formatMeta(meta)}`),
	debug: (msg, meta) => { if (DEBUG_MODE) console.debug(`${prefix('debug')} ${msg}${formatMeta(meta)}`); },
	success: (msg, meta) => console.log(`${prefix('success')} ${msg}${formatMeta(meta)}`)
};

logger.emojis = EMOJI;

function attachLogger(client) {
	if (!client) return client;
	client.logger = logger;
	client.log = logger; // alias curto
	return client;
}

module.exports = { logger, attachLogger };
