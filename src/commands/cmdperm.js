const { SlashCommandBuilder } = require('@discordjs/builders');
const CommandRoles = require('../model/commandRoleModel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cmdperm')
        .setDescription('Adiciona ou remove cargos permitidos para um comando')
        .addStringOption(option =>
            option.setName('comando')
                .setDescription('Nome do comando')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('cargo')
                .setDescription('Cargo a ser adicionado ou removido comando')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('remover')
                .setDescription('Remover o cargo ao invés de adicionar?')
                .setRequired(false)),

    async execute(interaction) {
        const commandName = interaction.options.getString('comando');
        const role = interaction.options.getRole('cargo');
        const remove = interaction.options.getBoolean('remover') || false;
        await interaction.deferReply({ ephemeral: true });

        try {
            if (remove) {
                const row = await CommandRoles.findOne({
                    where: { commandName, roleId: role.id }
                });

                if (!row) {
                    return interaction.editReply(`Nenhuma permissão encontrada para o cargo ${role.name} no comando ${commandName}.`, { ephemeral: true });
                }

                await row.destroy();
                await interaction.editReply(`Cargo ${role.name} foi removido do comando ${commandName} com sucesso!`, { ephemeral: true });
            } else {
                const existingRole = await CommandRoles.findOne({
                    where: { commandName, roleId: role.id }
                });

                if (existingRole) {
                    return interaction.editReply(`O cargo ${role.name} já está permitido para o comando ${commandName}.`, { ephemeral: true });
                }
                await CommandRoles.create({
                    commandName,
                    roleId: role.id,
                });

                await interaction.editReply(`Cargo ${role.name} foi adicionado ao comando ${commandName} com sucesso!`, { ephemeral: true });
            }
        } catch (error) {
            console.error('Erro ao configurar o cargo permitido:', error);
            await interaction.editReply('Ocorreu um erro ao configurar o cargo permitido.\n' + error, { ephemeral: true });
        }
    },
};
