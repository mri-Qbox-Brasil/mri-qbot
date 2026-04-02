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
        )
        .addBooleanOption(option =>
            option
                .setName('atualizar')
                .setDescription('Forçar a atualização do cache do GitHub? (opcional)')
                .setRequired(false)
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        console.log(`[resource] Autocomplete iniciado. Valor: "${focusedValue}"`);

        try {
            // No autocomplete, sempre tentamos o cache primeiro (sem forçar)
            const repos = await fetchFxManifestRepos();

            // Filtra os repositórios pelo nome OU descrição
            let filtered = repos.filter(repo => {
                const nameMatch = repo.name.toLowerCase().includes(focusedValue);
                const descMatch = repo.description && repo.description.toLowerCase().includes(focusedValue);
                return nameMatch || descMatch;
            });

            // "Burlar" o limite de 25 do Discord: Priorizar quem COMEÇA com o termo buscado
            // Isso garante que se o usuário digitar "qbx", os repos "qbx-core" apareçam primeiro
            filtered.sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                const aStartsWith = aName.startsWith(focusedValue);
                const bStartsWith = bName.startsWith(focusedValue);

                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;

                // Se ambos começam ou nenhum começa, manter ordem alfabética
                return aName.localeCompare(bName);
            });

            // Discord permite no máximo 25 opções
            const limited = filtered.slice(0, 25);
            console.log(`[resource] Retornando ${limited.length} opções para autocomplete.`);

            const response = limited.map(repo => {
                // Formata: "Nome: Descrição" (max 100 caracteres)
                let label = repo.name;
                if (repo.description) {
                    const maxDescLen = 95 - label.length;
                    if (maxDescLen > 5) {
                        let desc = repo.description;
                        if (desc.length > maxDescLen) {
                            desc = desc.substring(0, maxDescLen) + '...';
                        }
                        label = `${repo.name}: ${desc}`;
                    }
                }
                return { name: label, value: repo.full_name };
            });

            try {
                await interaction.respond(response);
            } catch (err) {
                // Silencia erros de interação desconhecida ou expirada
                if (err.code === 10062 || err.code === 40060) return;
                throw err;
            }
        } catch (error) {
            // Ignora se o erro capturado aqui já for de interação morta
            if (error.code === 10062 || error.code === 40060) return;

            console.error('[resource] Erro no autocomplete:', error);
            // Silencia erro no autocomplete para não poluir,
            // mas o safeAsync pode logar se explodir.
            // Retorna vazio em caso de falha grave, tratando possível expiração
            try {
                await interaction.respond([]);
            } catch (_) { /* ignore */ }
        }
    },

    async execute(interaction) {
        const selectedFullName = interaction.options.getString('nome');
        const forceRefresh = interaction.options.getBoolean('atualizar') || false;

        console.log(`[resource] Comando executado. Selecionado: "${selectedFullName}", Atualizar: ${forceRefresh}`);

        // Defer reply se achar que pode demorar (o fetch pode demorar se cache expirou ou forceRefresh)
        await interaction.deferReply();

        try {
            const repos = await fetchFxManifestRepos(forceRefresh);
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
