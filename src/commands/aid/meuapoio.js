const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedColors, createEmbed } = require('../../utils/embedUtils');
const Supporters = require('../../model/supporterModel');
const hasPermission = require('../../utils/permissionUtils');
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
        await interaction.deferReply({ ephemeral: true });

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
            console.error('Erro ao executar o comando /meuapoio:', error);
            const embed = await createSupportEmbed({
                description: 'Ocorreu um erro ao buscar suas informações de apoio. Tente novamente mais tarde.',
                color: EmbedColors.DANGER
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
