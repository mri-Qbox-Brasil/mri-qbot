const cron = require('node-cron');
const { Op } = require('sequelize');

function checkChannels(client) {
    const now = new Date();
    const Announces = client.db?.Announces;
    if (!Announces) {
        client.logger.warn('announceWorker: modelo Announces não encontrado no banco de dados.');
        return;
    }
    Announces.findAll({ where: { expiryDate: { [Op.lte]: now } } })
    .then(async (channels) => {
        for (const channelData of channels) {
            try {
                const guild = await client.guilds.fetch(channelData.guildId);
                const channel = await guild.channels.fetch(channelData.channelId);
                if (channel) {
                    await channel.delete('Anúncio expirado.');
                }
            } catch (error) {
                client.notifyError({
                    client,
                    context: 'announceWorker (deleting expired channel)',
                    error
                });
            }
        }
    });
}

function announceWorker(client, checkPeriod = '*/1 * * * *') {
    client.logger.info('Inicializando announceWorker.', { announceCheckPeriod: checkPeriod });
    cron.schedule(checkPeriod, () => {
        client.logger.info('Verificando canais...');
        checkChannels(client);
    });
}

module.exports = { announceWorker };