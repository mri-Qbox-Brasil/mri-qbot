const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

async function syncCommands(client, commands) {
    client.logger.info('Sincronizando comandos com a API do Discord...');
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        client.logger.info('Sincronizando comandos...');

        const targetRoute = process.env.DEBUG_MODE
            ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
            : Routes.applicationCommands(process.env.CLIENT_ID);

        await rest.put(targetRoute, { body: commands });
        client.logger.info(process.env.DEBUG_MODE ? 'Comandos registrados localmente para debug.' : 'Comandos registrados globalmente.');
    } catch (error) {
        client.logger.error('Erro ao sincronizar comandos:', { stack: error?.stack || error });
    } finally {
        client.logger.info('Sync de comandos concluído.');
    }
}

module.exports = { syncCommands };
