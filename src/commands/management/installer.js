const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { EmbedColors, createEmbed } = require('../../utils/embedUtils');
const { hasPermission } = require('../../utils/permissionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('installer')
        .setDescription('Gerencia e monitora as atividades do instalador MRI')
        .addSubcommand(subcommand =>
            subcommand.setName('list')
                .setDescription('Lista as últimas atividades do instalador')
                .addIntegerOption(option => 
                    option.setName('pagina')
                        .setDescription('Página a ser visualizada')
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand.setName('stats')
                .setDescription('Mostra estatísticas de instalações'))
        .addSubcommand(subcommand =>
            subcommand.setName('config_webhook')
                .setDescription('Configura o webhook de notificações do instalador')
                .addStringOption(option => 
                    option.setName('url')
                        .setDescription('URL do Webhook do Discord')
                        .setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!await hasPermission(interaction, 'installer')) {
            const embed = createEmbed({
                title: 'Sem Permissão',
                description: 'Você não tem permissão para gerenciar o instalador.',
                color: EmbedColors.DANGER
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'config_webhook') {
            return await handleConfigWebhook(interaction);
        } else if (subcommand === 'stats') {
            return await handleStats(interaction);
        } else if (subcommand === 'list') {
            return await handleList(interaction);
        }
    },

    // Handler de botões para paginação
    async buttonClick(interaction) {
        const customId = interaction.customId;
        // Esperado: installerButton_page_[pageNumber]
        const match = customId.match(/^installerButton_page_(\d+)$/);
        
        if (match) {
            const page = parseInt(match[1]);
            await interaction.deferUpdate();
            return await handleList(interaction, page);
        }
    }
};

async function handleConfigWebhook(interaction) {
    const url = interaction.options.getString('url');
    const guildId = process.env.GUILD_ID;
    const Configuration = interaction.client.db.Configuration;

    try {
        await Configuration.setConfig(guildId, 'installer_webhook_url', url);
        
        const embed = createEmbed({
            title: 'Configuração Atualizada',
            description: 'A URL do Webhook do instalador foi configurada com sucesso.',
            color: EmbedColors.SUCCESS,
            fields: [{ name: 'Guild ID', value: `\`${guildId}\``, inline: true }]
        });
        
        return interaction.editReply({ embeds: [embed] });
    } catch (err) {
        interaction.client.logger.error('Erro ao configurar webhook do instalador:', err);
        return interaction.editReply('Ocorreu um erro ao salvar a configuração.');
    }
}

async function handleStats(interaction) {
    const guildId = process.env.GUILD_ID;
    const Configuration = interaction.client.db.Configuration;
    const InstallerActivity = interaction.client.db.InstallerActivity;
    const sequelize = interaction.client.db.sequelize;

    try {
        const successCount = await Configuration.getConfig(guildId, 'installer_success_count') || 0;
        
        // 1. Calcular Instalações Ativas (Sessions que deram START mas não deram FINISH/ERROR/CANCEL)
        const activeSessionsCount = await InstallerActivity.count({
            where: {
                event: 'start',
                sessionId: {
                    [Op.notIn]: sequelize.literal(`(
                        SELECT sessionId 
                        FROM InstallerActivities 
                        WHERE event IN ('finish', 'error', 'cancel')
                    )`)
                }
            },
            distinct: true,
            col: 'sessionId'
        });
        
        // 2. Buscar totais por evento (histórico geral)
        const stats = await InstallerActivity.findAll({
            attributes: [
                'event',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['event']
        });

        const statsMap = stats.reduce((acc, curr) => {
            acc[curr.event] = curr.getDataValue('count');
            return acc;
        }, { start: 0, finish: 0, error: 0, cancel: 0 });

        const embed = createEmbed({
            title: '📊 Estatísticas do Instalador (Robust Mode)',
            description: `Monitoramento inteligente baseado em Session IDs.`,
            color: EmbedColors.INFO,
            fields: [
                { name: '🟢 Instalações Ativas (Agora)', value: `**${activeSessionsCount}**`, inline: false },
                { name: '✅ Total de Sucessos', value: `\`${successCount}\``, inline: true },
                { name: '🚀 Total Iniciadas (Histórico)', value: `\`${statsMap.start}\``, inline: true },
                { name: '❌ Erros', value: `\`${statsMap.error}\``, inline: true },
                { name: '🟡 Canceladas', value: `\`${statsMap.cancel}\``, inline: true }
            ]
        });

        return interaction.editReply({ embeds: [embed] });
    } catch (err) {
        interaction.client.logger.error('Erro ao buscar estatísticas do instalador:', err);
        return interaction.editReply('Ocorreu um erro ao buscar as estatísticas.');
    }
}

async function handleList(interaction, page = null) {
    if (page === null) {
        page = interaction.options?.getInteger('pagina') || 1;
    }
    
    const limit = 10;
    const offset = (page - 1) * limit;
    const InstallerActivity = interaction.client.db.InstallerActivity;

    try {
        const { count, rows } = await InstallerActivity.findAndCountAll({
            order: [['createdAt', 'DESC']],
            limit: limit,
            offset: offset
        });

        const totalPages = Math.ceil(count / limit);

        if (count === 0) {
            return interaction.editReply({ content: 'Nenhuma atividade registrada ainda.' });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Log de Atividades do Instalador')
            .setColor(EmbedColors.INFO)
            .setTimestamp()
            .setFooter({ text: `Página ${page} de ${totalPages} | Total: ${count}` });

        const eventEmojis = {
            start: '🚀',
            finish: '✅',
            error: '❌',
            cancel: '🟡'
        };

        const logs = rows.map(row => {
            const date = new Date(row.createdAt).toLocaleString('pt-BR');
            return `**${eventEmojis[row.event]} ${row.event.toUpperCase()}** - <@${row.discordId}>\n*${date}*\n> ${row.details || 'Sem detalhes'}`;
        }).join('\n\n');

        embed.setDescription(logs.substring(0, 4096));

        const row = new ActionRowBuilder();
        
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`installerButton_page_${page - 1}`)
                .setLabel('Anterior')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(`installerButton_page_${page + 1}`)
                .setLabel('Próxima')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages)
        );

        const response = { embeds: [embed] };
        if (totalPages > 1) {
            response.components = [row];
        } else {
            response.components = []; // Remove componentes se só houver uma página
        }

        return interaction.editReply(response);
    } catch (err) {
        interaction.client.logger.error('Erro ao listar atividades do instalador:', err);
        return interaction.editReply('Ocorreu um erro ao listar as atividades.');
    }
}
