const { WebhookClient, EmbedBuilder } = require('discord.js');
const { EmbedColors } = require('./embedUtils');

/**
 * Envia uma notificação de atividade do instalador para o Discord via Webhook.
 * 
 * @param {import('discord.js').Client} client Instância do bot.
 * @param {Object} activity Objeto da atividade (discordId, event, details).
 */
async function sendActivityWebhook(client, activity) {
    const { discordId, event, details } = activity;
    const guildId = process.env.GUILD_ID;

    if (!guildId) {
        client.logger.warn('[InstallerUtils] GUILD_ID não configurado no .env. Não é possível buscar o Webhook.');
        return;
    }

    try {
        const Configuration = client.db?.Configuration;
        if (!Configuration) {
            client.logger.error('[InstallerUtils] Modelo Configuration não encontrado no client.db');
            return;
        }

        const webhookUrl = await Configuration.getConfig(guildId, 'installer_webhook_url');
        if (!webhookUrl) {
            client.logger.debug(`[InstallerUtils] Webhook não configurado para a guilda ${guildId}. Ignorando notificação.`);
            return;
        }

        const webhookClient = new WebhookClient({ url: webhookUrl });

        let title = '';
        let color = EmbedColors.DEFAULT;
        let emoji = '';

        switch (event) {
            case 'start':
                title = '🚀 Instalação Iniciada';
                color = 0x3498db; // Azul
                break;
            case 'finish':
                title = '✅ Instalação Concluída';
                color = 0x2ecc71; // Verde
                break;
            case 'error':
                title = '❌ Erro na Instalação';
                color = 0xe74c3c; // Vermelho
                break;
            case 'cancel':
                title = '⚠️ Instalação Cancelada';
                color = 0xf1c40f; // Amarelo
                break;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setDescription(`**Usuário:** <@${discordId}>\n${details || 'Sem detalhes fornecidos.'}`)
            .setTimestamp()
            .setFooter({ text: 'MRI Installer Analytics', iconURL: client.user.displayAvatarURL() });

        await webhookClient.send({
            embeds: [embed],
            allowedMentions: { users: [] } // Evita menção indesejada no log se não for start/error? Na vdd o @discordId é só pra visualização
        });

        client.logger.info(`[InstallerUtils] Notificação de evento "${event}" enviada para o usuário ${discordId}`);

    } catch (error) {
        client.logger.error('[InstallerUtils] Erro ao enviar webhook do instalador:', { stack: error?.stack || error });
    }
}

module.exports = {
    sendActivityWebhook
};
