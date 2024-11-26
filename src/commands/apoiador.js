const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const { EmbedColors, createEmbed } = require('../utils/embedUtils');
const sequelize = require('../database/sequelize');
const Supporters = require('../model/supporterModel');
const SupporterLogs = require('../model/supporterLogsModel');
const hasPermission = require('../utils/permissionUtils');
const moment = require('moment');

async function createLog(supportId, userId, guildId, roleId, actionType, performedBy, transaction) {
    await SupporterLogs.create({
        supportId,
        userId,
        guildId,
        roleId,
        actionType,
        performedBy,
        actionDate: new Date(),
    }, { transaction });
}

async function createSupporterEmbed(description, color, fields = []) {
    return await createEmbed({
        title: 'Status do Apoio',
        description,
        color,
        fields
    });
}

function parseExpiryDate(input) {
    if (!input) return null;
    if (!isNaN(input)) {
        return moment().add(parseInt(input), 'days').toDate();
    } else if (moment(input, 'DD/MM/YYYY', true).isValid()) {
        return moment(input, 'DD/MM/YYYY').toDate();
    }
    return null;
}

async function getSupporterData(userId) {
    return await Supporters.findOne({ where: { userId } });
}

async function updateSupporterData(userId, roleId, expirationDate, supportUserId, guildId, active, transaction) {
    return await Supporters.update({
        userId,
        roleId,
        expirationDate,
        supportUserId,
        guildId,
        active
    }, { transaction });
}

async function insertSupporterData(userId, roleId, expirationDate, supportUserId, guildId, active, transaction) {
    return await Supporters.create({
        userId,
        roleId,
        expirationDate,
        supportUserId,
        guildId,
        active
    }, { transaction });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('apoiador')
        .setDescription('Comando de gerenciamento de apoiadores')
        .addSubcommand(subcommand =>
            subcommand
                .setName('ver')
                .setDescription('Ver dados de um apoiador')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuário para ver o apoio')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Adicionar um apoiador')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuário para adicionar como apoiador')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('cargo')
                        .setDescription('Cargo a ser atribuído ao apoiador')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('validade')
                        .setDescription('Data de validade (em dias ou dd/mm/yyyy)')
                        .setRequired(true))
                .addUserOption(option =>
                    option.setName('responsavel')
                        .setDescription('Usuário responsável pelo apoio')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Editar um apoiador')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuário para editar o apoio')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('cargo')
                        .setDescription('Cargo a ser atribuído ao apoiador'))
                .addStringOption(option =>
                    option.setName('validade')
                        .setDescription('Data de validade (em dias ou dd/mm/yyyy)'))
                .addUserOption(option =>
                    option.setName('responsavel')
                        .setDescription('Usuário responsável pelo apoio')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remover apoio de um usuário')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuário para remover o apoio')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Listar todos os apoiadores do servidor')),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!await hasPermission(interaction, 'apoiador')) {
            const embed = await createSupporterEmbed('Você não tem permissão para usar este comando.', EmbedColors.DANGER);
            return interaction.editReply({
                embeds: [embed]
            });
        }

        const subcommand = interaction.options.getSubcommand();

        const handlers = {
            ver: () => handleVer(interaction),
            add: () => handleAdd(interaction),
            edit: () => handleEdit(interaction),
            remove: () => handleRemove(interaction),
            list: () => handleList(interaction)
        };

        try {
            await handlers[subcommand]();
        } catch (error) {
            console.error(error);
            const embed = await createSupporterEmbed('Ocorreu um erro ao executar este comando.', EmbedColors.DANGER);
            return interaction.editReply({
                embeds: [embed]
            });
        }
    },
};

async function handleVer(interaction) {
    const user = interaction.options.getUser('usuario');
    const supporterData = await getSupporterData(user.id);

    if (!supporterData) {
        const embed = await createSupporterEmbed('Este usuário não possui apoio.', EmbedColors.INFO);
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const role = await interaction.guild.roles.fetch(supporterData.roleId);
    const fields = [];

    fields.push({ name: 'Usuário', value: `<@${user.id}>` });

    let apoioAtual = 'Sem apoio';
    if (supporterData?.roleId) {
        apoioAtual = `<@&${role.id}>`
    }

    let expirationDate = 'Sem data de validade';
    if (supporterData?.expirationDate) {
        expirationDate = moment(supporterData.expirationDate).format('DD/MM/YYYY');
    }

    let supportUserString = 'Nenhum';
    if (supporterData?.supportUserId) {
        supportUserString = `<@${supporterData.supportUserId}>`;
    }

    fields.push({ name: 'Apoio Atual', value: apoioAtual, inline: true });
    fields.push({ name: 'Data de Validade', value: expirationDate, inline: true });
    fields.push({ name: 'Suporte Atual', value: supportUserString, inline: true });

    const embed = await createSupporterEmbed('Informações do Apoio', EmbedColors.INFO, fields);

    return interaction.editReply({
        embeds: [embed]
    });
}

async function handleAdd(interaction) {
    const user = interaction.options.getUser('usuario');
    const role = interaction.options.getRole('cargo') || null;
    const expiryInput = interaction.options.getString('validade') || null;
    const supportUser = interaction.options.getUser('responsavel') || null;

    let expiryDate = parseExpiryDate(expiryInput);
    if (!expiryDate) {
        const embed = await createSupporterEmbed('Formato de data inválido. Utilize DD/MM/YYYY ou dias.', EmbedColors.DANGER);
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const guildMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!guildMember) {
        const embed = await createSupporterEmbed('O usuário especificado não é membro deste servidor.', EmbedColors.DANGER);
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const transaction = await sequelize.transaction();
    try {
        const supporterRecord = await insertSupporterData(user.id, role ? role.id : null, expiryDate, supportUser ? supportUser.id : null, interaction.guild.id, true, transaction);

        if (role) {
            await guildMember.roles.add(role.id);
        }

        await createLog(supporterRecord.id, interaction.user.id, interaction.guild.id, role?.id, 'added', interaction.user.id, transaction);
        await transaction.commit();
        const embed = await createSupporterEmbed('Apoio adicionado com sucesso.', EmbedColors.SUCCESS);
        return interaction.editReply({
            embeds: [embed]
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Erro ao adicionar apoio:', error);
        const embed = await createSupporterEmbed('Ocorreu um erro ao processar o comando.', EmbedColors.DANGER);
        return interaction.editReply({
            embeds: [embed]
        });
    }
}

async function handleEdit(interaction) {
    const user = interaction.options.getUser('usuario');
    const role = interaction.options.getRole('cargo') || null;
    const expiryInput = interaction.options.getString('validade') || null;
    const supportUser = interaction.options.getUser('responsavel') || null;

    if (!role && !expiryInput && !supportUser) {
        const embed = await createSupporterEmbed('Nenhuma informação foi fornecida.', EmbedColors.WARNING);
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const guildMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!guildMember) {
        const embed = await createSupporterEmbed('O usuário especificado não é membro deste servidor.', EmbedColors.DANGER);
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const supporterData = await getSupporterData(user.id);
    if (!supporterData) {
        const embed = await createSupporterEmbed('Este usuário não possui apoio.', EmbedColors.INFO);
        return interaction.editReply({
            embeds: [embed]
        });
    }

    let expiryDate = parseExpiryDate(expiryInput);
    if (expiryInput && !expiryDate) {
        const embed = await createSupporterEmbed('Formato de data inválido. Utilize DD/MM/YYYY ou dias.', EmbedColors.DANGER);
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const transaction = await sequelize.transaction();
    try {
        if (supporterData.roleId) {
            await guildMember.roles.remove(supporterData.roleId);
        }

        if (role) {
            await guildMember.roles.add(role.id);
        }

        await updateSupporterData(user.id, role ? role.id : supporterData.roleId, expiryDate || supporterData.expirationDate, supportUser ? supportUser.id : supporterData.supportUserId, interaction.guild.id, supporterData.active, transaction);

        await createLog(supporterData.id, interaction.user.id, interaction.guild.id, role?.id, 'edited', interaction.user.id, transaction);
        await transaction.commit();
        const embed = await createSupporterEmbed('Apoio editado com sucesso.', EmbedColors.SUCCESS);
        return interaction.editReply({
            embeds: [embed]
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Erro ao editar apoio:', error);
        const embed = await createSupporterEmbed('Ocorreu um erro ao processar o comando.', EmbedColors.DANGER);
        return interaction.editReply({
            embeds: [embed]
        });
    }
}

async function handleRemove(interaction) {
    const user = interaction.options.getUser('usuario');
    const supporterData = await getSupporterData(user.id);

    if (!supporterData) {
        const embed = await createSupporterEmbed('Este usuário não possui apoio.', EmbedColors.INFO);
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const guildMember = await interaction.guild.members.fetch(user.id);
    if (supporterData.roleId) {
        await guildMember.roles.remove(supporterData.roleId);
    }

    const transaction = await sequelize.transaction();
    try {
        await updateSupporterData(user.id, supporterData.roleId, supporterData.expirationDate, supporterData.supportUserId, interaction.guild.id, false, transaction);
        await createLog(supporterData.id, interaction.user.id, interaction.guild.id, supporterData.roleId, 'removed', interaction.user.id, transaction);
        await transaction.commit();
        const embed = await createSupporterEmbed('Apoio removido com sucesso.', EmbedColors.SUCCESS);
        return interaction.editReply({
            embeds: [embed]
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Erro ao remover apoio:', error);
        const embed = await createSupporterEmbed('Ocorreu um erro ao processar o comando.', EmbedColors.DANGER);
        return interaction.editReply({
            embeds: [embed]
        });
    }
}

// Função para "list" todos os apoiadores
async function handleList(interaction) {
    const supporters = await Supporters.findAll({ where: { guildId: interaction.guild.id, active: true } });

    // Caso não existam apoiadores
    if (supporters.length === 0) {
        const embed = await createSupporterEmbed('Não há apoiadores no servidor.', EmbedColors.INFO);
        return interaction.editReply({ embeds: [embed] });
    }

    // Mapeia os apoiadores por cargo
    const groupedSupporters = {};
    for (const supporter of supporters) {
        const role = await interaction.guild.roles.fetch(supporter.roleId).catch(() => null);
        if (!role) continue;

        if (!groupedSupporters[role.id]) {
            groupedSupporters[role.id] = {
                roleName: role.name,
                users: [],
            };
        }

        const user = await interaction.client.users.fetch(supporter.userId).catch(() => null);
        if (user) {
            groupedSupporters[role.id].users.push(user);
        }
    }

    // Criação dos campos do embed
    const fields = [];
    let totalSupporters = 0;

    // Ordena os cargos por quantidade de apoiadores
    const sortedRoles = Object.entries(groupedSupporters).sort(
        (a, b) => b[1].users.length - a[1].users.length
    );

    for (const [, { roleName, users }] of sortedRoles) {
        const userList = users.map(user => `<@${user.id}>`).join(', ');
        const count = users.length;
        totalSupporters += count;

        fields.push({
            name: `${roleName} (${count} ${count > 1 ? 'apoiadores' : 'apoiador'})`,
            value: userList || 'Nenhum usuário encontrado.',
            inline: false,
        });
    }

    // Adiciona o campo de contagem total
    fields.push({
        name: 'Total de Apoiadores',
        value: `${totalSupporters} ${totalSupporters > 1 ? 'apoiadores' : 'apoiador'} no total.`,
        inline: false,
    });

    // Criação do embed de resposta
    const embed = await createSupporterEmbed('Apoiadores agrupados por cargo:', EmbedColors.SUCCESS, fields);
    return interaction.editReply({ embeds: [embed] });
}
