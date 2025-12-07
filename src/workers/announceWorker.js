const cron = require('node-cron');
const { Op } = require('sequelize');

async function checkChannels(client) {
    const now = new Date();
    const Announces = client.db?.Announces;
    if (!Announces) {
        client.logger.warn('announceWorker: modelo Announces não encontrado no banco de dados.');
        return;
    }
    try {
        const channels = await Announces.findAll({ where: { expiryDate: { [Op.lte]: now } } });
        client.logger.debug('announceWorker: expired announce rows found', { count: channels.length });
        for (const channelData of channels) {
            try {
                const guild = await client.guilds.fetch(channelData.guildId).catch(() => null);
                if (!guild) {
                    client.logger.warn('announceWorker: guild not found for expired announce', { guildId: channelData.guildId });
                    continue;
                }
                const channel = await guild.channels.fetch(channelData.channelId).catch(() => null);
                if (channel) {
                    await channel.delete('Anúncio expirado.');
                    client.logger.info('announceWorker: deleted expired channel', { guildId: channelData.guildId, channelId: channelData.channelId });
                } else {
                    client.logger.debug('announceWorker: channel already missing', { guildId: channelData.guildId, channelId: channelData.channelId });
                }
            } catch (error) {
                client.logger.error('announceWorker: error deleting expired channel', { error: error?.stack || error?.message || error });
                client.notifyError({ client, context: 'announceWorker (deleting expired channel)', error });
            }
        }
    } catch (err) {
        client.logger.error('announceWorker: DB error while searching expired announces', { error: err?.stack || err?.message || err });
        client.notifyError({ client, context: 'announceWorker (query expired)', error: err });
    }
}

function announceWorker(client, checkPeriod = '*/1 * * * *') {
    client.logger.info('Inicializando announceWorker.', { announceCheckPeriod: checkPeriod });
    cron.schedule(checkPeriod, () => {
        client.logger.info('Verificando canais...');
        checkChannels(client);
    });
}

module.exports = { announceWorker };