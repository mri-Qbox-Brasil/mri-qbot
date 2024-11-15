const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const { colors } = require('../utils/constants');
const Supporters = require('../model/supporterModel');
const hasPermission = require('../utils/permissionUtils');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meuapoio')
        .setDescription('Exibe informações sobre seu apoio.'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const user = interaction.user;
            const guildName = interaction.guild.name;

            if (!await hasPermission(interaction, 'meuapoio')) {
                const embed = new EmbedBuilder()
                    .setTitle('Status do Apoio')
                    .setDescription('Você não tem permissão para usar este comando.')
                    .setColor(colors.danger);
                return interaction.editReply({ embeds: [embed] });
            }

            // Busca o registro de apoio do usuário
            const supporterData = await Supporters.findOne({
                where: { userId: user.id, guildId: interaction.guild.id }
            });

            // Caso não tenha apoio registrado
            if (!supporterData) {
                const embed = new EmbedBuilder()
                    .setTitle('Status do Apoio')
                    .setDescription('Você não possui um apoio registrado no momento.')
                    .setColor(colors.info);
                return interaction.editReply({ embeds: [embed] });
            }

            // Busca os detalhes do cargo e do responsável pelo apoio
            const role = supporterData.roleId ? await interaction.guild.roles.fetch(supporterData.roleId).catch(() => null) : null;
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
            const embed = new EmbedBuilder()
                .setTitle(`Informações de Apoio para ${user.username}`)
                .setDescription(`Detalhes do seu apoio no servidor **${guildName}**:`)
                .setColor(colors.info)
                .addFields(fields)
                .setFooter({ text: `Comando executado por ${interaction.user.tag}` })
                .setTimestamp();

            // Responde com o embed
            await interaction.editReply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Erro ao executar o comando /meuapoio:', error);
            const embed = new EmbedBuilder()
                .setTitle('Status do Apoio')
                .setDescription('Ocorreu um erro ao buscar suas informações de apoio. Tente novamente mais tarde.')
                .setColor(colors.danger);
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
