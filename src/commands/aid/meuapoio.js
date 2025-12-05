const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedColors, createEmbed } = require('../../utils/embedUtils');
const { hasPermission } = require('../../utils/permissionUtils');
const moment = require('moment');

async function createSupportEmbed({description, color, fields}) {
    return await createEmbed({
        title: 'Status do Apoio',
        description,
        color,
        fields
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meuapoio')
        .setDescription('Exibe informações sobre seu apoio.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Verifica permissões
            if (!await hasPermission(interaction, 'meuapoio')) {
                const embed = await createSupportEmbed({
                    description: 'Você não tem permissão para usar este comando.',
                    color: EmbedColors.DANGER
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const user = interaction.user;
            const guildName = interaction.guild.name;
            const Supporters = interaction.client.db?.Supporters;

            // Busca o registro de apoio do usuário
            const supporterData = await Supporters.findOne({
                where: { userId: user.id, guildId: interaction.guild.id, active: true }
            });

            // Caso não tenha apoio registrado
            if (!supporterData) {
                const embed = await createSupportEmbed({
                    description: 'Você não possui um apoio registrado no momento.',
                    color: EmbedColors.INFO
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // Busca os detalhes do cargo e do responsável pelo apoio
            const role = supporterData.roleId
                ? await interaction.guild.roles.fetch(supporterData.roleId).catch(() => null)
                : null;
            const supportUser = supporterData.supportUserId
                ? await interaction.client.users.fetch(supporterData.supportUserId).catch(() => null)
                : null;
            const expiryDate = supporterData.expirationDate
                ? moment(supporterData.expirationDate).format('DD/MM/YYYY')
                : 'Sem prazo definido';

            // Criação dos campos para o embed
            const fields = [
                { name: 'Apoio atual', value: role ? `<@&${role.id}>` : 'Sem apoio registrado', inline: true },
                { name: 'Data de validade', value: expiryDate, inline: true }
            ];

            // Adiciona o responsável pelo suporte se existir
            if (supportUser) {
                fields.push({
                    name: 'Responsável pelo Suporte',
                    value: `<@${supportUser.id}>`,
                    inline: true
                });
            }

            // Criação do embed de resposta
            const embed = await createSupportEmbed({
                description: `Detalhes do seu apoio no servidor **${guildName}**:`,
                color: EmbedColors.INFO,
                fields
            });

            // Responde com o embed
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            interaction.client.logger?.error(`Erro no comando /${this.data.name}:`, { stack: error?.stack || error });

            try {
                interaction.client.notifyError({
                    client: interaction.client,
                    user: interaction.user,
                    channel: interaction.channel,
                    guild: interaction.guild,
                    context: `/${this.data.name}`,
                    error
                });
            } catch (_) {
                interaction.client.logger?.error('Falha ao notificar erro do comando /meuapoio', { stack: _?.stack || _ });
            }

            const embed = await createMriEmbed({
                description: 'Ocorreu um erro ao executar o comando.',
                color: EmbedColors.DANGER
            });

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
