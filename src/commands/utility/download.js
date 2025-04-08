const { SlashCommandBuilder } = require('discord.js');
const { EmbedColors, createEmbed } = require('../../utils/embedUtils');
const { fetchArtifactLinks } = require('../../utils/artifactUtils');
const { notifyError } = require('../../utils/errorHandler');

const BASE_URL = 'https://artifacts.jgscripts.com';

function buildArtifactButtons({ version, windowsLink, linuxLink }) {
    const buttons = [];

    if (windowsLink) {
        buttons.push({
            type: 2,
            label: `Windows (${version})`,
            style: 5,
            url: windowsLink
        });
    }

    if (linuxLink) {
        buttons.push({
            type: 2,
            label: `Linux (${version})`,
            style: 5,
            url: linuxLink
        });
    }

    buttons.push({
        type: 2,
        label: 'Receita',
        style: 5,
        url: 'https://docs.mriqbox.com.br/mri/instalacao#execute-o-deploy-da-receita'
    });

    return buttons;
}

async function createMriEmbed({ description, color }) {
    return createEmbed({
        title: 'Downloads - Mri Qbox',
        description,
        color
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('download')
        .setDescription('Envia links para download dos artefatos da Mri Qbox.'),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const { version, windowsLink, linuxLink } = await fetchArtifactLinks(BASE_URL);

            const embed = await createMriEmbed({
                description: `Versão dos artefatos sugerida por [JGScripts](${BASE_URL}): ${version}`,
                color: EmbedColors.SUCCESS
            });

            const buttons = buildArtifactButtons({ version, windowsLink, linuxLink });

            await interaction.editReply({
                embeds: [embed],
                components: [{ type: 1, components: buttons }]
            });

        } catch (error) {
            console.error(`Erro no comando /${this.data.name}:`, error);

            notifyError({
                client: interaction.client,
                user: interaction.user,
                channel: interaction.channel,
                guild: interaction.guild,
                context: `/${this.data.name}`,
                error
            });

            const embed = await createMriEmbed({
                description: 'Ocorreu um erro ao executar o comando.',
                color: EmbedColors.DANGER
            });

            await interaction.editReply({ embeds: [embed] });
        }
    }
};
