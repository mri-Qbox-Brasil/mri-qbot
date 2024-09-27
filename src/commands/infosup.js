const { SlashCommandBuilder } = require('@discordjs/builders');

const moment = require('moment');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('infosup')
    .setDescription('Exibe as informações de cargo temporário do usuário')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Usuário para exibir informações')
        .setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('user');

    // Consulta o banco de dados para obter as informações do usuário
    db.get(`SELECT username, role, expiry_date, support_user_id FROM users WHERE id = ?`, [user.id], async (err, row) => {
      if (err) {
        return interaction.reply({ content: 'Erro ao buscar no banco de dados', ephemeral: true });
      }

      if (!row) {
        return interaction.reply({ content: 'Usuário não encontrado no banco de dados', ephemeral: true });
      }

      const guild = interaction.guild;
      let supportUser = null;

      // Se houver um usuário de suporte, buscar o nome
      if (row.support_user_id) {
        const member = await guild.members.fetch(row.support_user_id).catch(() => null);
        supportUser = member ? member.user.username : 'Usuário não encontrado';
      }

      // Monta a resposta com as informações do banco
      let responseMessage = `Informações do usuário ${row.username}:\n`;
      responseMessage += `Cargo: ${row.role || 'Nenhum'}\n`;
      responseMessage += `Expira em: ${row.expiry_date ? moment(row.expiry_date).format('DD/MM/YYYY') : 'Sem expiração definida'}\n`;
      responseMessage += `Suporte: ${supportUser || 'Nenhum'}`;

      return interaction.reply({ content: responseMessage, ephemeral: true });
    });
  },
};
