const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { colors } = require('../utils/constants');
const CommandRoles = require('../model/commandRoleModel');
const hasPermission = require('../utils/permissionUtils');

async function getPermissionsDescription(commandName) {
    const roles = await CommandRoles.findAll({ where: { commandName } });
    if (roles.length === 0) {
        return 'Nenhuma permissão configurada.';
    }
    return roles.map(role => `• <@&${role.roleId}>`).join('\n');
}

async function createPermissionEmbed(action, commandName, roleName, description) {
    return new EmbedBuilder()
        .setTitle('Gerenciamento de Permissões')
        .setDescription(`${action} o cargo **${roleName}** para o comando **${commandName}**.`)
        .addFields({ name: 'Permissões Atualizadas', value: description })
        .setColor(colors.success);
}

async function handleAddPermission(commandName, role, guildId) {
    const existingRole = await CommandRoles.findOne({ where: { commandName, roleId: role.id } });

    if (existingRole) {
        const description = await getPermissionsDescription(commandName);
        return createPermissionEmbed('Erro ao adicionar', commandName, role.name, description);
    }

    await CommandRoles.create({ commandName, roleId: role.id, guildId });
    const description = await getPermissionsDescription(commandName);
    return createPermissionEmbed('Adicionado', commandName, role.name, description);
}

async function handleRemovePermission(commandName, role) {
    const row = await CommandRoles.findOne({ where: { commandName, roleId: role.id } });

    if (!row) {
        const description = await getPermissionsDescription(commandName);
        return createPermissionEmbed('Erro ao remover', commandName, role.name, description);
    }

    await row.destroy();
    const description = await getPermissionsDescription(commandName);
    return createPermissionEmbed('Removido', commandName, role.name, description);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perm')
        .setDescription('Gerencia cargos permitidos para um comando')
        .addSubcommand(subcommand =>
            subcommand.setName('add')
                .setDescription('Adiciona um cargo permitido para um comando')
                .addStringOption(option =>
                    option.setName('comando')
                        .setDescription('Nome do comando (obrigatório)')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addRoleOption(option =>
                    option.setName('cargo')
                        .setDescription('Cargo a ser adicionado (obrigatório)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('remove')
                .setDescription('Remove um cargo permitido de um comando')
                .addStringOption(option =>
                    option.setName('comando')
                        .setDescription('Nome do comando (obrigatório)')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addRoleOption(option =>
                    option.setName('cargo')
                        .setDescription('Cargo a ser removido (obrigatório)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('list')
                .setDescription('Lista os cargos permitidos para um comando')
                .addStringOption(option =>
                    option.setName('comando')
                        .setDescription('Nome do comando (obrigatório)')
                        .setRequired(true)
                        .setAutocomplete(true))),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const subcommand = interaction.options.getSubcommand();
        const commandName = interaction.options.getString('comando');
        const role = interaction.options.getRole('cargo');

        if (!await hasPermission(interaction, 'perm')) {
            const embed = new EmbedBuilder()
                .setTitle('Gerenciamento de Permissões')
                .setDescription('Você não tem permissão para usar este comando.')
                .setColor(colors.danger);
            return interaction.editReply({ embeds: [embed] });
        }

        try {
            let embed;
            if (subcommand === 'add') {
                embed = await handleAddPermission(commandName, role, interaction.guild.id);
            } else if (subcommand === 'remove') {
                embed = await handleRemovePermission(commandName, role);
            } else if (subcommand === 'list') {
                const description = await getPermissionsDescription(commandName);
                embed = new EmbedBuilder()
                    .setTitle('Permissões Configuradas')
                    .setDescription(`Permissões para o comando **${commandName}**:\n${description}`)
                    .setColor(colors.success);
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(`Erro ao processar o subcomando ${subcommand}:`, error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('Gerenciamento de Permissões')
                .setDescription('Ocorreu um erro ao processar o comando.')
                .setColor(colors.danger)
                .addFields({ name: 'Erro', value: error.message });
            return interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === 'comando') {
            const commands = interaction.client.commands.map(cmd => cmd.data.name);
            const filteredCommands = commands
                .filter(cmd => cmd.toLowerCase().includes(focusedOption.value.toLowerCase()))
                .slice(0, 10);
            await interaction.respond(filteredCommands.map(cmd => ({ name: cmd, value: cmd })));
        }
    },
};
