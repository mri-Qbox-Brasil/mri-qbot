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

            const supporterData = await Supporters.findOne({
                where: { userId: user.id, guildId: interaction.guild.id, active: true }
            });

            if (!supporterData) {
                const embed = await createSupportEmbed({
                    description: 'Você não possui um apoio registrado no momento.',
                    color: EmbedColors.INFO
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const role = supporterData.roleId
                ? await interaction.guild.roles.fetch(supporterData.roleId).catch(() => null)
                : null;
            const supportUser = supporterData.supportUserId
                ? await interaction.client.users.fetch(supporterData.supportUserId).catch(() => null)
                : null;
            const expiryDate = supporterData.expirationDate
                ? moment(supporterData.expirationDate).format('DD/MM/YYYY')
                : 'Sem prazo definido';

            const fields = [
                { name: 'Apoio atual', value: role ? `<@&${role.id}>` : 'Sem apoio registrado', inline: true },
                { name: 'Data de validade', value: expiryDate, inline: true }
            ];

            if (supportUser) {
                fields.push({
                    name: 'Responsável pelo Suporte',
                    value: `<@${supportUser.id}>`,
                    inline: true
                });
            }

            const embed = await createSupportEmbed({
                description: `Detalhes do seu apoio no servidor **${guildName}**:`,
                color: EmbedColors.INFO,
                fields
            });

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
