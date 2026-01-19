const { SlashCommandBuilder } = require('@discordjs/builders');
const { fetchFxManifestRepos } = require('../../utils/githubUtils');
const { createEmbed, EmbedColors } = require('../../utils/embedUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resource')
        .setDescription('Busca e exibe o link de um resource do mri-Qbox-Brasil')
        .addStringOption(option =>
            option
                .setName('nome')
                .setDescription('Nome do resource para buscar')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        console.log(`[resource] Autocomplete iniciado. Valor: "${focusedValue}"`);

        try {
            const repos = await fetchFxManifestRepos();

            // Filtra os repositórios pelo nome OU descrição
            const filtered = repos.filter(repo => {
                const nameMatch = repo.name.toLowerCase().includes(focusedValue.toLowerCase());
                const descMatch = repo.description && repo.description.toLowerCase().includes(focusedValue.toLowerCase());
                return nameMatch || descMatch;
            });

            // Discord permite no máximo 25 opções
            const limited = filtered.slice(0, 25);
            console.log(`[resource] Retornando ${limited.length} opções para autocomplete.`);

            await interaction.respond(
                limited.map(repo => {
                    // Formata: "Nome: Descrição" (max 100 caracteres)
                    let label = repo.name;
                    if (repo.description) {
                        const maxDescLen = 95 - label.length; // -5 para separador ": " e reticências
                        if (maxDescLen > 5) {
                            let desc = repo.description;
                            if (desc.length > maxDescLen) {
                                desc = desc.substring(0, maxDescLen) + '...';
                            }
                            label = `${repo.name}: ${desc}`;
                        }
                    }
                    return { name: label, value: repo.full_name };
                })
            );
        } catch (error) {
            console.error('[resource] Erro no autocomplete:', error);
            // Silencia erro no autocomplete para não poluir,
            // mas o safeAsync pode logar se explodir.
            // Retorna vazio em caso de falha grave
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        const selectedFullName = interaction.options.getString('nome');
        console.log(`[resource] Comando executado. Selecionado: "${selectedFullName}"`);

        // Defer reply se achar que pode demorar (o fetch pode demorar se cache expirou)
        await interaction.deferReply();

        try {
            const repos = await fetchFxManifestRepos();
            const repo = repos.find(r => r.full_name === selectedFullName);

            if (!repo) {
                const embed = createEmbed({
                    title: 'Resource não encontrado',
                    description: `Não consegui encontrar o resource **${selectedFullName}**. Verifique se o nome está correto ou se ele possui um \`fxmanifest.lua\`.`,
                    color: EmbedColors.WARNING
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const embed = createEmbed({
                title: repo.name,
                description: repo.description || 'Sem descrição.',
                color: EmbedColors.INFO
            });

            // Adiciona URL e fields extras
            embed.setURL(repo.html_url);
            embed.addFields(
                { name: 'Repositório Completo', value: repo.full_name, inline: true },
                { name: 'Link', value: `[Clique aqui para acessar](${repo.html_url})`, inline: true }
            );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            interaction.client.logger.error('Erro ao executar comando resource:', error);

            let description = 'Ocorreu um erro ao buscar os dados do GitHub. Tente novamente mais tarde.';
            let title = 'Erro';

            if (error.message.includes('GITHUB_TOKEN')) {
                title = 'Configuração Necessária';
                description = 'Para usar este comando, é necessário configurar um **GITHUB_TOKEN** no arquivo `.env`.\n\nA API de busca de código do GitHub exige autenticação.';
            }

            const embed = createEmbed({
                title,
                description,
                color: EmbedColors.DANGER
            });
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
