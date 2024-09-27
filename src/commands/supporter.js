const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { Sequelize } = require('sequelize');
const moment = require('moment');
const sequelize = require('../database/sequelize');
const Supporters = require('../model/supporterModel');
const CommandRoles = require('../model/commandRoleModel');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('supporter')
        .setDescription('Configura ou atualiza dados de um usuário com cargo temporário')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário para definir o cargo')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('cargo')
                .setDescription('Nome do cargo (opcional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('validade')
                .setDescription('Data de expiração (em dias ou dd/mm/yyyy) (opcional)')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('responsavel')
                .setDescription('Usuário responsável pelo suporte (opcional)')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const userRoles = interaction.member.roles.cache.map(role => role.id);
            const allowedRoles = await CommandRoles.findAll({
                where: { commandName: 'supporter' }
            });
            const allowedRoleIds = allowedRoles.map(role => role.roleId);
            const hasPermission = allowedRoleIds.some(roleId => userRoles.includes(roleId));

            if (!hasPermission) {
                return interaction.editReply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
            }
            const result = await sequelize.transaction({ isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async transaction => {

                const user = interaction.options.getUser('usuario');
                const role = interaction.options.getRole('cargo') || null;
                const expiryInput = interaction.options.getString('validade') || null;
                const supportUser = interaction.options.getUser('responsavel') || null;
                const guildMember = interaction.guild.members.cache.get(user.id);

                let expiryDate = null;
                if (expiryInput) {
                    if (!isNaN(expiryInput)) {
                        expiryDate = moment().add(parseInt(expiryInput), 'days').toDate();
                    } else {
                        expiryDate = moment(expiryInput, 'DD/MM/YYYY').toDate();
                    }
                }

                const existingData = await Supporters.findOne({ where: { userId: user.id }, transaction });
                let previousRoleId = existingData ? existingData.roleId : null;
                let previousExpiryDate = existingData ? existingData.expirationDate : null;
                let previousSupportUserId = existingData ? existingData.supportUserId : null;

                let previousSupportUser = null;
                if (previousSupportUserId) {
                    previousSupportUser = await interaction.client.users.fetch(previousSupportUserId);
                }

                let previousRole = null;
                if (previousRoleId) {
                    previousRole = await interaction.guild.roles.fetch(previousRoleId);
                }

                await Supporters.upsert({
                    userId: user.id,
                    roleId: role ? role.id : previousRoleId,
                    expirationDate: expiryDate ? expiryDate : previousExpiryDate,
                    supportUserId: supportUser ? supportUser.id : previousSupportUserId
                }, { transaction });

                if (role) {
                    await guildMember.roles.add(role.id);
                }

                return {
                    previousRole,
                    previousSupportUser,
                    previousExpiryDate,
                    role,
                    supportUser,
                    expiryDate
                };
            });

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('Dados do Usuário Atualizados')
                .addFields(
                    { name: 'Usuário', value: `<@${interaction.options.getUser('usuario').id}>` },
                    { name: 'Cargo Anterior', value: result.previousRole ? `<@&${result.previousRole.id}>` : 'Nenhum', inline: true },
                    { name: 'Suporte Anterior', value: result.previousSupportUser ? `<@${result.previousSupportUser.id}>` : 'Nenhum', inline: true },
                    { name: 'Data de Expiração Anterior', value: result.previousExpiryDate ? moment(result.previousExpiryDate).format('DD/MM/YYYY') : 'Nenhuma', inline: true },
                    { name: 'Novo Cargo', value: result.role ? `<@&${result.role.id}>` : 'Nenhum', inline: true },
                    { name: 'Novo Suporte', value: result.supportUser ? `<@${result.supportUser.id}>` : 'Nenhum', inline: true },
                    { name: 'Nova Data de Expiração', value: result.expiryDate ? moment(result.expiryDate).format('DD/MM/YYYY') : 'Nenhuma', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erro ao executar o comando:', error);
            await interaction.editReply({ content: 'Ocorreu um erro ao processar o comando.' + '\n' + error, ephemeral: true });
        }
    },
};
