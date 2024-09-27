function checkExpiredRoles(client) {
    const now = moment().format('YYYY-MM-DD');

    db.all(`SELECT id, role, expiry_date, support_user_id FROM users WHERE expiry_date <= ?`, [now], (err, rows) => {
      if (err) {
        console.error('Erro ao verificar cargos expirados:', err.message);
        return;
      }

      rows.forEach(row => {
        const guild = client.guilds.cache.get('SEU_GUILD_ID');
        const member = guild.members.cache.get(row.id);
        const role = guild.roles.cache.find(r => r.name === row.role);
        const supportUser = row.support_user_id ? guild.members.cache.get(row.support_user_id) : null;

        if (member && role) {
          member.roles.remove(role).then(() => {
            console.log(`Cargo ${row.role} removido de ${member.user.username}`);

            if (supportUser) {
              supportUser.send(`O cargo ${row.role} de ${member.user.username} expirou.`);
            }

            // Limpar cargo e expiração do banco
            db.run(`UPDATE users SET role = NULL, expiry_date = NULL WHERE id = ?`, [row.id], function(err) {
              if (err) {
                console.error('Erro ao atualizar o banco de dados:', err.message);
              }
            });
          }).catch(console.error);
        }
      });
    });
  }
