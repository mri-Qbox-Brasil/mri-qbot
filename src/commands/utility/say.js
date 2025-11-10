const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedColors, createEmbed } = require('../../utils/embedUtils');
const hasPermission = require('../../utils/permissionUtils');
const { notifyError } = require('../../utils/errorHandler');

async function createSayEmbed({description, color, fields}) {
    return createEmbed({
        title: 'Comando de Mensagens',
        description,
        color,
        fields,
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Envia uma mensagem para o canal atual ou para um canal específico.')
        .addStringOption(option =>
            option
                .setName('mensagem')
                .setDescription('Qual mensagem o bot irá enviar? (obrigatório)')
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('canal')
                .setDescription('Qual o canal onde a mensagem será enviada? (opcional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!await hasPermission(interaction, 'say')) {
            const embed = await createSayEmbed({description: 'Você não tem permissão para usar este comando.', color: EmbedColors.DANGER});
            return interaction.editReply({ embeds: [embed] });
        }

        const mensagem = interaction.options.getString('mensagem');
        const canalDestino = interaction.options.getChannel('canal') || interaction.channel;

        try {
            if (!canalDestino.isTextBased()) {
                const embed = await createSayEmbed({description: 'Por favor, selecione um canal de texto válido.', color: EmbedColors.WARNING});
                return interaction.editReply({ embeds: [embed] });
            }

            await canalDestino.send(mensagem);

            const embed = await createSayEmbed({description: `Mensagem enviada com sucesso para ${canalDestino}.`, color: EmbedColors.SUCCESS});
            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            notifyError({
                client: interaction.client,
                user: interaction.user,
                channel: interaction.channel,
                guild: interaction.guild,
                context: `/${this.data.name}`,
                error
            });

            const embed = await createSayEmbed({
                description: 'Ocorreu um erro ao executar o comando.',
                color: EmbedColors.DANGER
            });

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
