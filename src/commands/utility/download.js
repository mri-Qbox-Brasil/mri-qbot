const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedColors, createEmbed } = require('../../utils/embedUtils');

async function createMriEmbed({description, color, fields}) {
    return createEmbed({
        title: 'Downloads - Mri Qbox',
        description,
        color,
        fields,
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('download')
        .setDescription('Envia links para download dos artefatos da Mri Qbox.'),
    async execute(interaction) {
        await interaction.deferReply();

        const baseUrl = 'https://artifacts.jgscripts.com';
        let windowsLink = '';
        let linuxLink = '';
        let artifactVersion = 'Desconhecida';

        try {
            const response = await axios.get(baseUrl);
            const $ = cheerio.load(response.data);

            // Captura a versão do artefato
            $('code').each((_, element) => {
                const text = $(element).text().trim();
                if (text.match(/\d+/g) && artifactVersion === 'Desconhecida') {
                    artifactVersion = text;
                }
            });

            // Captura os links
            $('a').each((_, element) => {
                const href = $(element).attr('href');

                if (href.includes('windows')) {
                    windowsLink = `${href}`;
                }
                if (href.includes('linux')) {
                    linuxLink = `${href}`;
                }
            });
        } catch (error) {
            console.error('Erro ao buscar os links dos artefatos:', error);
            const embed = await createMriEmbed({description: 'Ocorreu um erro ao executar o comando.', color: EmbedColors.DANGER, fields: [{name: 'Mensagem de erro', value: error.message || 'Não foi possível identificar o erro.'}]});
            return interaction.editReply({ embeds: [embed] });
        }

        const embed = await createMriEmbed({description: `Versão dos artefatos sugerida por [JGScripts](${baseUrl}): ${artifactVersion}`, color: EmbedColors.SUCCESS});

        const components = [];
        if (windowsLink) {
            components.push({
                type: 2,
                label: `Windows (${artifactVersion})`,
                style: 5,
                url: windowsLink
            });
        }
        if (linuxLink) {
            components.push({
                type: 2,
                label: `Linux (${artifactVersion})`,
                style: 5,
                url: linuxLink
            });
        }
        components.push({
            type: 2,
            label: 'Receita',
            style: 5,
            url: "https://docs.mriqbox.com.br/mri/instalacao#execute-o-deploy-da-receita"
        });

        console.log('Enviando resposta para o usuário');
        await interaction.editReply({ embeds: [embed], components: [{ type: 1, components }] });
    }
};
