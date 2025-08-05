const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands, loadEvents } = require('./utils/loaders');
const { syncCommands } = require('./utils/commandSync');
const { notifyError } = require('./utils/errorHandler');
const { loadModelsIntoClient } = require('./db');
const { supporterWorker } = require('./workers/supporterWorker');
// const { resourceWorker } = require('./workers/resourceWorker');
require('dotenv').config();

const { DISCORD_TOKEN, SUPPORTER_CHECK_PERIOD, GITHUB_TOKEN, RESOURCE_CHECK_PERIOD } = process.env;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

(async () => {
    try {
        // Carregar comandos e eventos
        console.log('Carregando comandos...');
        const commands = await loadCommands(client);
        console.log('Comandos carregados.');

        console.log('Carregando eventos...');
        await loadEvents(client);
        console.log('Eventos carregados.');

        // Sincronizar comandos
        await syncCommands(commands);

        // Inicializar o bot
        client.once('ready', async () => {
            await loadModelsIntoClient(client);
            if (!process.env.DEBUG_MODE)
                supporterWorker(client, SUPPORTER_CHECK_PERIOD);
            //resourceWorker(client, GITHUB_TOKEN, RESOURCE_CHECK_PERIOD); // Começa a checagem de apoio
            console.log(`✅ Bot iniciado como: ${client.user.tag}`);
        });

        client.login(DISCORD_TOKEN);
    } catch (error) {
        console.error('Erro ao iniciar o bot:', error);
        notifyError(error);
    }
})();
