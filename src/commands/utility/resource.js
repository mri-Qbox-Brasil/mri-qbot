const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resource')
        .setDescription('Envia links para download dos artefatos da Mri Qbox.'),
    async execute(interaction) {
        await interaction.deferReply();
    }
};