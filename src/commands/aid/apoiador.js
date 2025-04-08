const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const sequelize = require('../../database/sequelize');
const { EmbedColors, createEmbed } = require('../../utils/embedUtils');
const { SupportActionType } = require('../../utils/constants');
const Supporters = require('../../model/supporterModel');
const SupporterLogs = require('../../model/supporterLogsModel');
const hasPermission = require('../../utils/permissionUtils');
const { notifyError } = require('../../utils/errorHandler');
const moment = require('moment');

async function createLog({supporterData, actionType, performedBy, transaction}) {
    await SupporterLogs.create({
        supportId: supporterData.id,
        userId: supporterData.userId,
        guildId: supporterData.guildId,
        roleId: supporterData.roleId,
        actionType,
        performedBy,
        actionDate: new Date(),
    }, { transaction });
}

async function createSupporterEmbed({description, color, fields}) {
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
    return await Supporters.findOne({ where: { userId, active: true } });
}

async function updateSupporterData({supporterData, role, expiryDate, supportUser, transaction}) {
    return await Supporters.update({
        roleId: role ? role.id : supporterData.roleId,
        expirationDate: expiryDate || supporterData.expirationDate,
        supportUserId: supportUser ? supportUser.id : supporterData.supportUserId,
        guildId: supporterData.guildId,
        active: supporterData.active
    }, {
        where: {
            id: supporterData.id
        }
    }, transaction );
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
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!await hasPermission(interaction, 'apoiador')) {
            const embed = await createSupporterEmbed({description: 'Você não tem permissão para usar este comando.', color: EmbedColors.DANGER});
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
            console.error(`Erro no comando /${this.data.name}:`, error);

            notifyError({
                client: interaction.client,
                user: interaction.user,
                channel: interaction.channel,
                guild: interaction.guild,
                context: `/${this.data.name}`,
                error
            });

            const embed = await createMriEmbed({
                description: 'Ocorreu um erro ao executar o comando.',
                color: EmbedColors.DANGER
            });

            await interaction.editReply({ embeds: [embed] });
        }
    },
};

async function handleVer(interaction) {
    const user = interaction.options.getUser('usuario');
    const supporterData = await getSupporterData(user.id);

    if (!supporterData) {
        const embed = await createSupporterEmbed({description: 'Este usuário não possui apoio.', color: EmbedColors.DANGER});
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

    const embed = await createSupporterEmbed({description: 'Informações do Apoio', color: EmbedColors.INFO, fields});

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
        const embed = await createSupporterEmbed({description: 'Formato de data inválido. Utilize DD/MM/YYYY ou dias.', color: EmbedColors.DANGER});
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const guildMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!guildMember) {
        const embed = await createSupporterEmbed({description: 'O usuário especificado não é membro deste servidor.', color: EmbedColors.DANGER});
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const supporterData = await getSupporterData(user.id);
    if (supporterData) {
        const embed = await createSupporterEmbed({description: 'Este usuário ja possui um apoio.', color: EmbedColors.DANGER});
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const transaction = await sequelize.transaction();
    try {
        const supporterData = await insertSupporterData(user.id, role ? role.id : null, expiryDate, supportUser ? supportUser.id : null, interaction.guild.id, true, transaction);

        if (role) {
            await guildMember.roles.add(role.id);
        }

        await createLog({supporterData, actionType: SupportActionType.ADDED, performedBy: interaction.user.id, transaction});
        await transaction.commit();
        const embed = await createSupporterEmbed({description: 'Apoio adicionado com sucesso.', color: EmbedColors.SUCCESS});
        return interaction.editReply({
            embeds: [embed]
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Erro ao adicionar apoio:', error);
        const embed = await createSupporterEmbed({description: 'Ocorreu um erro ao processar o comando.', color: EmbedColors.DANGER, fields: [{ name: 'Detalhes', value: error.message }]});
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
        const embed = await createSupporterEmbed({description: 'Nenhuma informação foi fornecida.', color: EmbedColors.WARNING});
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const guildMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!guildMember) {
        const embed = await createSupporterEmbed({description: 'O usuário especificado não é membro deste servidor.', color: EmbedColors.DANGER});
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const supporterData = await getSupporterData(user.id);
    if (!supporterData) {
        const embed = await createSupporterEmbed({description: 'Este usuário não possui apoio ativo.', color: EmbedColors.DANGER});
        return interaction.editReply({
            embeds: [embed]
        });
    }

    let expiryDate = parseExpiryDate(expiryInput);
    if (expiryInput && !expiryDate) {
        const embed = await createSupporterEmbed({description: 'Formato de data inválido. Utilize DD/MM/YYYY ou dias.', color: EmbedColors.DANGER});
        return interaction.editReply({
            embeds: [embed]
        });
    }

    const transaction = await sequelize.transaction();
    try {
        if (role && role.id !== supporterData.roleId) {
            await guildMember.roles.remove(supporterData.roleId);
            await guildMember.roles.add(role.id);
        }

        await updateSupporterData({supporterData, role: role ? role.id : null, expiryDate, supportUser: supportUser ? supportUser.id : null, transaction});
        await createLog({supporterData, actionType: SupportActionType.UPDATED, performedBy: interaction.user.id, transaction});
        await transaction.commit();

        const embed = await createSupporterEmbed({description: 'Apoio atualizado com sucesso.', color: EmbedColors.SUCCESS});
        return interaction.editReply({
            embeds: [embed]
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Erro ao editar apoio:', error);

        const embed = await createSupporterEmbed({description: 'Ocorreu um erro ao processar o comando.', color: EmbedColors.DANGER, fileds :[{ name: 'Detalhes', value: error.message }]});
        return interaction.editReply({
            embeds: [embed]
        });
    }
}

async function handleRemove(interaction) {
    const user = interaction.options.getUser('usuario');
    const supporterData = await getSupporterData(user.id);

    if (!supporterData) {
        const embed = await createSupporterEmbed({description: 'Este usuário não possui apoio.', color: EmbedColors.DANGER});
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
        supporterData.active = false;
        await updateSupporterData({supporterData, transaction});
        await createLog({supporterData, actionType: SupportActionType.REMOVED, performedBy: interaction.user.id, transaction});
        await transaction.commit();

        const embed = await createSupporterEmbed({description: 'Apoio removido com sucesso.', color: EmbedColors.SUCCESS});
        return interaction.editReply({
            embeds: [embed]
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Erro ao remover apoio:', error);

        const embed = await createSupporterEmbed({description: 'Ocorreu um erro ao processar o comando.', color: EmbedColors.DANGER, fileds :[{ name: 'Detalhes', value: error.message }]});
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
        const embed = await createSupporterEmbed({description: 'Não há apoiadores no servidor.', color: EmbedColors.INFO});
        return interaction.editReply({ embeds: [embed] });
    }

    // Mapeia os apoiadores por cargo
    const groupedSupporters = {};
    for (const supporter of supporters) {
        const role = await interaction.guild.roles.fetch(supporter.roleId).catch(() => null);

        if (!groupedSupporters[supporter.roleId]) {
            groupedSupporters[supporter.roleId] = {
                roleName: role ? role.name : 'Cargo desconhecido', // Se o cargo for nulo, usa o nome "Cargo desconhecido" no embed
                users: [],
            };
        }

        const user = await interaction.client.users.fetch(supporter.userId).catch(() => null);
        if (user) {
            groupedSupporters[supporter.roleId].users.push(user);
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
    const embed = await createSupporterEmbed({description: 'Apoiadores agrupados por cargo:', color: EmbedColors.SUCCESS, fields});
    return interaction.editReply({ embeds: [embed] });
}
