const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { colors } = require('../utils/constants');
const CommandRoles = require('../model/commandRoleModel');
const hasPermission = require('../utils/permissionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cmdperm')
        .setDescription('Adiciona ou remove cargos permitidos para um comando')
        .addStringOption(option =>
            option.setName('comando')
                .setDescription('Nome do comando (obrigatório)')
                .setRequired(true)
                .setAutocomplete(true))
        .addRoleOption(option =>
            option.setName('cargo')
                .setDescription('Cargo a ser adicionado ou removido do comando (obrigatório)')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('remover')
                .setDescription('Remover o cargo ao invés de adicionar? (opcional, padrão é adicionar)')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // Verificação de permissão
            if (!await hasPermission(interaction, 'cmdperm')) {
                const embed = new EmbedBuilder()
                    .setTitle('Comando de Permissão')
                    .setDescription('Você não tem permissão para usar este comando.')
                    .setColor(colors.danger);
                return interaction.editReply({ embeds: [embed] });
            }

            const commandName = interaction.options.getString('comando');
            const role = interaction.options.getRole('cargo');
            const remove = interaction.options.getBoolean('remover') || false;

            if (remove) {
                // Remover cargo da permissão
                const row = await CommandRoles.findOne({ where: { commandName, roleId: role.id } });

                if (!row) {
                    const embed = new EmbedBuilder()
                        .setTitle('Comando de Permissão')
                        .setDescription(`Nenhuma permissão encontrada para o cargo ${role.name} no comando ${commandName}.`)
                        .setColor(colors.info);
                    return interaction.editReply({ embeds: [embed] });
                }

                await row.destroy();
                const embed = new EmbedBuilder()
                    .setTitle('Comando de Permissão')
                    .setDescription(`Cargo ${role.name} foi removido do comando ${commandName} com sucesso!`)
                    .setColor(colors.success);
                return interaction.editReply({ embeds: [embed] });
            } else {
                // Adicionar cargo à permissão
                const existingRole = await CommandRoles.findOne({ where: { commandName, roleId: role.id } });

                if (existingRole) {
                    const embed = new EmbedBuilder()
                        .setTitle('Comando de Permissão')
                        .setDescription(`O cargo ${role.name} já está permitido para o comando ${commandName}.`)
                        .setColor(colors.info);
                    return interaction.editReply({ embeds: [embed] });
                }

                await CommandRoles.create({
                    commandName,
                    roleId: role.id,
                    guildId: interaction.guild.id
                });
                const embed = new EmbedBuilder()
                    .setTitle('Comando de Permissão')
                    .setDescription(`Cargo ${role.name} foi adicionado ao comando ${commandName} com sucesso!`)
                    .setColor(colors.success);
                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error(`Erro ao configurar o cargo permitido no comando ${interaction.commandName}:`, error);
            const embed = new EmbedBuilder()
                .setTitle('Comando de Permissão')
                .setDescription('Ocorreu um erro ao processar o comando.')
                .setColor(colors.danger)
                .addFields({ name: 'Erro', value: error.message });
            return interaction.editReply({ embeds: [embed] });
        }
    },

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'comando') {
            const commands = interaction.client.commands.map(cmd => cmd.data.name);
            const filteredCommands = commands
                .filter(cmd => cmd.toLowerCase().includes(focusedOption.value.toLowerCase()))
                .slice(0, 10); // Limita a 10 sugestões

            await interaction.respond(
                filteredCommands.map(cmd => ({ name: cmd, value: cmd }))
            );
        }
    },
};
