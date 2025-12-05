const { MessageFlags } = require('discord.js');
/**
 * Valida se o autor da mensagem é um bot
 * @param {Message} message - A mensagem recebida
 * @returns {boolean} - Retorna true se for bot
 */
function isMessageAuthorBot(message) {
    return message.author.bot;
}

/**
 * Valida se a mensagem tem conteúdo de texto
 * @param {Message} message - A mensagem recebida
 * @returns {boolean} - Retorna true se tiver conteúdo
 */
function isTextMessage(message) {
    return message.content && message.content.trim().length > 0;
}

async function sendReply({ interaction, content, ephemeral = false }) {
    await interaction.editReply({ content, flags: ephemeral ? MessageFlags.Ephemeral : undefined })
    .then(() => {
        interaction.client.logger.debug(`[announce editReply] respondido/editReply com sucesso`, { interactionId: interaction.id });
    })
    .catch(async (error) => {
        interaction.client.logger.error(`[announce editReply] falha ao responder/editReply, tentando fallback`, { interactionId: interaction.id, error: error?.message });
        await interaction.reply({ content, flags: ephemeral ? MessageFlags.Ephemeral : undefined })
        .then(() => {
            interaction.client.logger.debug(`[announce reply] respondido com sucesso`, { interactionId: interaction.id });
        })
        .catch(async (error) => {
            interaction.client.logger.error(`[announce reply] falha ao responder via reply`, { interactionId: interaction.id, error: error?.message });
            await interaction.followUp({ content, flags: ephemeral ? MessageFlags.Ephemeral : undefined })
            .then(() => {
                interaction.client.logger.debug(`[announce followUp] respondido via followUp com sucesso`, { interactionId: interaction.id });
            })
            .catch((error) => {
                interaction.client.logger.error(`[announce followUp] falha ao responder via followUp`, { interactionId: interaction.id, error: error?.message });
                // repassa o client explicitamente e define um contexto claro
                interaction.client.notifyError({
                    client: interaction.client,
                    user: interaction.user,
                    channel: interaction.channel,
                    guild: interaction.guild,
                    context: 'generalUtils.sendReply',
                    error
                });
            });
        });
    });
}

module.exports = {
    isMessageAuthorBot,
    isTextMessage,
    sendReply,
};