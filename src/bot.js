const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const { loadCommands, loadEvents } = require('./utils/loaders');
const { syncCommands } = require('./utils/commandSync');
const { notifyError } = require('./utils/errorHandler');
const { loadModelsIntoClient } = require('./db');
const { supporterWorker } = require('./workers/supporterWorker');
const { announceWorker } = require('./workers/announceWorker');
const { attachLogger } = require('./utils/logger');
const { hasPermission } = require('./utils/permissionUtils');
require('dotenv').config();

const { DISCORD_TOKEN, SUPPORTER_CHECK_PERIOD, ANNOUNCE_CHECK_PERIOD } = process.env;

const client = new Client({
    partials: [
        Partials.User,
        Partials.GuildMember,
        Partials.Message,
        Partials.Reaction,
        Partials.Channel],
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

attachLogger(client);

client.hasPermission = hasPermission;
// wrapper inteligente para `notifyError` que aceita chamadas de duas formas:
// - client.notifyError(error, context?, source?)
// - client.notifyError({ client, error, context, source })
client.notifyError = (...args) => {
    if (args.length === 1 && typeof args[0] === 'object' && (args[0].client || args[0].error || args[0].context || args[0].source)) {
        // já é um objeto de opções: repassar diretamente
        return notifyError(args[0]);
    }
    // caso comum: notifyError(error, ...)
    return notifyError(client, ...args);
};

process.on('unhandledRejection', (reason, promise) => {
    client.logger.error('Unhandled Rejection detected', { reason: reason?.stack || reason, promise: String(promise) });
    client.notifyError(reason);
});

process.on('uncaughtException', (err) => {
    client.logger.error('Uncaught Exception', { stack: err?.stack || err });
    client.notifyError(err);
});

(async () => {
    try {
        await loadEvents(client);
        await syncCommands(client, await loadCommands(client));

        client.once('clientReady', async () => {
            try {
                await loadModelsIntoClient(client);
                if (!process.env.DEBUG_MODE) {
                    supporterWorker(client, SUPPORTER_CHECK_PERIOD);
                    announceWorker(client, ANNOUNCE_CHECK_PERIOD);
                } else {
                    client.logger.debug('DEBUG_MODE ativo — Workers não serão iniciados.');
                }
            } catch (readyErr) {
                client.logger.error('Erro durante o processamento do evento ready.', { stack: readyErr?.stack || readyErr });
                client.notifyError(readyErr);
            } finally {
                client.logger.info(`Bot iniciado como: ${client.user.tag}`);
            }
        });

        client.logger.info('Realizando login no Discord.');
        client.login(DISCORD_TOKEN).then(() => {
            client.logger.info('Login solicitado. Aguardando evento ready...');
        }).catch(loginErr => {
            client.logger.error('Falha no login do client.', { stack: loginErr?.stack || loginErr });
            client.notifyError(loginErr);
        });
    } catch (error) {
        client.logger.error('Erro ao iniciar o bot:', { stack: error?.stack || error });
        client.notifyError(error);
    }
})();
