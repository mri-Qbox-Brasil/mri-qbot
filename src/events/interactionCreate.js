const { EmbedColors, createEmbed } = require('../utils/embedUtils');
const { notifyError } = require('../utils/errorHandler');

async function createEmbedInteraction({description, color, fields}) {
    return await createEmbed({
        title: 'Interação',
        description,
        color,
        fields
    });
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            if (interaction.isCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;
                await command.execute(interaction);
                return;
            }
            if (interaction.isAutocomplete()) {
                if (interaction.commandName === 'perm') {
                    const command = client.commands.get(interaction.commandName);
                    if (!command) return;
                    await command.autocomplete(interaction);
                }
                return;
            }
        } catch (error) {
            notifyError({
                client: interaction.client,
                user: interaction.user,
                channel: interaction.channel,
                guild: interaction.guild,
                context: 'interactionCreate',
                error: new Error(`Erro ao processar interação: ${error.message}`)
            });
        }
    },
};
