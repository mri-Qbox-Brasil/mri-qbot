const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const { colors } = require('../utils/constants');
const sequelize = require('../database/sequelize');
const Supporters = require('../model/supporterModel');
const SupporterLogs = require('../model/supporterLogsModel');
const hasPermission = require('../utils/permissionUtils');
const moment = require('moment');

async function createLog(userId, guildId, roleId, actionType, performedBy, supportId, transaction) {
    await SupporterLogs.create({
        userId,
        guildId,
        roleId,
        actionType,
        performedBy,
        supportId,
        actionDate: new Date(),
    }, { transaction });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('apoiador')
        .setDescription('Configura ou atualiza dados de um apoiador.')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário para definir o apoio (obrigatório)')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('remover')
                .setDescription('Remover o apoiador (opcional)')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('cargo')
                .setDescription('Nome do cargo (opcional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('validade')
                .setDescription('Data de validade (em dias ou dd/mm/yyyy) (opcional)')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('responsavel')
                .setDescription('Usuário responsável pelo suporte ao apoiador (opcional)')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            if (!await hasPermission(interaction, 'apoiador')) {
                const embed = new EmbedBuilder()
                    .setTitle('Status do Apoio')
                    .setDescription('Você não tem permissão para usar este comando.')
                    .setColor(colors.danger);
                return interaction.editReply({ embeds: [embed] });
            }

            const user = interaction.options.getUser('usuario');
            const role = interaction.options.getRole('cargo') || null;
            const remove = interaction.options.getBoolean('remover') || false;
            const expiryInput = interaction.options.getString('validade') || null;
            const supportUser = interaction.options.getUser('responsavel') || null;

            const guildMember = await interaction.guild.members.fetch(user.id).catch(() => null);
            if (!guildMember) {
                const embed = new EmbedBuilder()
                    .setTitle('Status do Apoio')
                    .setDescription('O usuário especificado não é membro deste servidor.')
                    .setColor(colors.danger);
                return interaction.editReply({ embeds: [embed] });
            }

            let expiryDate = null;
            if (expiryInput) {
                if (!isNaN(expiryInput)) {
                    expiryDate = moment().add(parseInt(expiryInput), 'days').toDate();
                } else if (moment(expiryInput, 'DD/MM/YYYY', true).isValid()) {
                    expiryDate = moment(expiryInput, 'DD/MM/YYYY').toDate();
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle('Status do Apoio')
                        .setDescription('Formato de data inválido. Utilize DD/MM/YYYY ou dias.')
                        .setColor(colors.danger);
                    return interaction.editReply({ embeds: [embed] });
                }
            }

            const transaction = await sequelize.transaction();
            try {
                const existingData = await Supporters.findOne({ where: { userId: user.id } });
                const previousRoleId = existingData ? existingData.roleId : null;
                const previousSupportUserId = existingData ? existingData.supportUserId : null;
                const previousExpiryDate = existingData ? existingData.expirationDate : null;

                if (!existingData && !remove && !role && !expiryDate && !supportUser) {
                    const embed = new EmbedBuilder()
                        .setTitle('Status do Apoio')
                        .setDescription('Nenhum apoio corrente encontrado para este usuário.')
                        .setColor(colors.info);
                    return interaction.editReply({ embeds: [embed] });
                }

                if (remove) {
                    if (previousRoleId) {
                        await guildMember.roles.remove(previousRoleId);
                    }

                    await Supporters.destroy({ where: { userId: user.id }, transaction });
                    await createLog(interaction.user.id, interaction.guild.id, previousRoleId, 'removed', interaction.user.id, existingData.id, transaction);

                    await transaction.commit();
                    const embed = new EmbedBuilder()
                        .setTitle('Status do Apoio')
                        .setDescription('Apoio removido com sucesso.')
                        .setColor(colors.success);
                    return interaction.editReply({ embeds: [embed] });
                }

                const newRoleId = role ? role.id : previousRoleId;
                const newSupportUserId = supportUser ? supportUser.id : previousSupportUserId;
                const newExpiryDate = expiryDate ? expiryDate : previousExpiryDate;

                const noChanges =
                    newRoleId === previousRoleId &&
                    newSupportUserId === previousSupportUserId &&
                    (newExpiryDate === previousExpiryDate || moment(newExpiryDate).isSame(previousExpiryDate));

                if (noChanges) {
                    await transaction.commit();
                    const updatedData = await Supporters.findOne({ where: { userId: user.id } });
                    const updatedRole = updatedData.roleId ? await interaction.guild.roles.fetch(updatedData.roleId) : null;
                    const updatedSupportUser = updatedData.supportUserId ? await interaction.client.users.fetch(updatedData.supportUserId) : null;
                    const updatedExpiryDate = updatedData.expirationDate ? moment(updatedData.expirationDate).format('DD/MM/YYYY') : 'Sem validade';

                    const embed = new EmbedBuilder()
                        .setTitle('Status do Apoio')
                        .setColor(colors.info)
                        .setDescription('Nenhum dado foi alterado.')
                        .addFields(
                            { name: 'Usuário', value: `<@${user.id}>` },
                            { name: 'Apoio Atual', value: updatedRole ? `<@&${updatedRole.id}>` : 'Sem apoio', inline: true },
                            { name: 'Suporte Atual', value: updatedSupportUser ? `<@${updatedSupportUser.id}>` : 'Nenhum', inline: true },
                            { name: 'Data de Validade', value: updatedExpiryDate, inline: true }
                        );

                    return interaction.editReply({ embeds: [embed] });
                }

                const supporterRecord = await Supporters.upsert({
                    userId: user.id,
                    roleId: newRoleId,
                    expirationDate: newExpiryDate,
                    supportUserId: newSupportUserId,
                    guildId: interaction.guild.id
                }, { transaction });

                await createLog(interaction.user.id, interaction.guild.id, newRoleId, 'updated', interaction.user.id, supporterRecord[0].id, transaction);

                if (role) {
                    await guildMember.roles.add(role.id);
                    if (previousRoleId && previousRoleId !== role.id) {
                        await guildMember.roles.remove(previousRoleId);
                    }
                }

                await transaction.commit();

                const updatedData = await Supporters.findOne({ where: { userId: user.id } });
                const updatedRole = updatedData.roleId ? await interaction.guild.roles.fetch(updatedData.roleId) : null;
                const updatedSupportUser = updatedData.supportUserId ? await interaction.client.users.fetch(updatedData.supportUserId) : null;
                const updatedExpiryDate = updatedData.expirationDate ? moment(updatedData.expirationDate).format('DD/MM/YYYY') : 'Sem validade';

                if (existingData) {

                    const embed = new EmbedBuilder()
                        .setColor(colors.success)
                        .setTitle('Status do Apoio')
                        .setDescription('Apoio atualizado com sucesso.')
                        .addFields(
                            { name: 'Usuário', value: `<@${user.id}>` },
                            { name: 'Apoio Anterior', value: previousRoleId ? `<@&${previousRoleId}>` : 'Sem apoio', inline: true },
                            { name: 'Suporte Anterior', value: previousSupportUserId ? `<@${previousSupportUserId}>` : 'Nenhum', inline: true },
                            { name: 'Data de Validade Anterior', value: previousExpiryDate ? moment(previousExpiryDate).format('DD/MM/YYYY') : 'Sem validade', inline: true },
                            { name: 'Apoio Atual', value: updatedRole ? `<@&${updatedRole.id}>` : 'Sem apoio', inline: true },
                            { name: 'Suporte Atual', value: updatedSupportUser ? `<@${updatedSupportUser.id}>` : 'Nenhum', inline: true },
                            { name: 'Data de Validade', value: updatedExpiryDate, inline: true }
                        );
                        return interaction.editReply({ embeds: [embed] });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(colors.success)
                        .setTitle('Status do Apoio')
                        .setDescription('Apoio adicionado com sucesso.')
                        .addFields(
                            { name: 'Usuário', value: `<@${user.id}>` },
                            { name: 'Apoio Atual', value: updatedRole ? `<@&${updatedRole.id}>` : 'Sem apoio', inline: true },
                            { name: 'Suporte Atual', value: updatedSupportUser ? `<@${updatedSupportUser.id}>` : 'Nenhum', inline: true },
                            { name: 'Data de Validade', value: updatedExpiryDate, inline: true }
                        );
                    return interaction.editReply({ embeds: [embed] });
                }

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            console.error('Erro ao executar o comando:', error);
            const embed = new EmbedBuilder()
                .setTitle('Status do Apoio')
                .setDescription(`Ocorreu um erro ao processar o comando.`)
                .setColor(colors.danger)
                .addFields(
                    { name: 'Mensagem de erro', value: error.message },
                );
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
