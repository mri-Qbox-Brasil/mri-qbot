const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const moment = require('moment');
const Supporters = require('../model/supporterModel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meuapoio')
        .setDescription('Exibe informações sobre seu apoio.'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const user = interaction.user;
            const supporterData = await Supporters.findOne({
                where: { userId: user.id, guildId: interaction.guild.id }
            });

            if (!supporterData) {
                return interaction.editReply({
                    content: 'Você não está apoiando atualmente.',
                    ephemeral: true
                });
            }

            const role = await interaction.guild.roles.fetch(supporterData.roleId);
            const supportUser = supporterData.supportUserId
                ? await interaction.client.users.fetch(supporterData.supportUserId)
                : null;
            const expiryDate = supporterData.expirationDate
                ? moment(supporterData.expirationDate).format('DD/MM/YYYY')
                : 'Sem prazo definido';

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('Suas Informações de Apoio')
                .addFields(
                    { name: 'Nível', value: role ? `<@&${role.id}>` : 'Sem apoio', inline: true },
                    { name: 'Válido até', value: expiryDate, inline: true },
                    { name: 'Responsável pelo Suporte', value: supportUser ? `<@${supportUser.id}>` : 'Nenhum', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Erro ao executar o comando:', error);
            await interaction.editReply({
                content: 'Ocorreu um erro ao buscar suas informações.',
                ephemeral: true
            });
        }
    },
};
