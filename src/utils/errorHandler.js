const { EmbedBuilder } = require('discord.js');
const { EmbedColors } = require('./embedUtils');

async function notifyError({ client, user, channel, guild, context = 'desconhecido', error }) {
    try {
        console.error('Erro detectado:', error);
        const owner = await client.users.fetch('289124013375094794');

        const timestamp = new Date();
        const formattedDate = timestamp.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        const embed = new EmbedBuilder()
            .setTitle('🚨 Erro no Bot')
            .setColor(EmbedColors.DANGER || 0xFF0000)
            .setDescription(`Um erro foi detectado durante a execução de uma ação no bot.`)
            .addFields(
                { name: 'Contexto', value: `\`${context}\``, inline: true },
                {
                    name: 'Usuário',
                    value: user ? `${user.tag} (\`${user.id}\`)` : 'Não disponível',
                    inline: true
                },
                {
                    name: 'Canal',
                    value: channel?.name
                        ? `#${channel.name} (\`${channel.id}\`)`
                        : channel?.id
                        ? `ID: \`${channel.id}\``
                        : 'Não disponível',
                    inline: true
                },
                {
                    name: 'Servidor',
                    value: guild?.name
                        ? `${guild.name} (\`${guild.id}\`)`
                        : guild?.id
                        ? `ID: \`${guild.id}\``
                        : 'Não disponível',
                    inline: true
                },
                { name: 'Data/Hora', value: formattedDate, inline: false },
                {
                    name: 'Mensagem de erro',
                    value: `\`\`\`${error?.message || error.toString()}\`\`\``
                }
            )
            .setTimestamp(timestamp)
            .setFooter({ text: 'Erro monitorado automaticamente' });

        await owner.send({ embeds: [embed] });
    } catch (dmError) {
        console.error('Erro original:', error);
        console.error('Erro ao enviar DM de erro:', dmError);
    }
}

module.exports = { notifyError };
