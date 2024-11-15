const { Op } = require('sequelize');
const cron = require('node-cron');
const moment = require('moment');
const sequelize = require('./database/sequelize');
const Supporters = require('./model/supporterModel');
const SupporterLogs = require('./model/supporterLogsModel');

async function checkExpiredRoles(client) {
    const now = moment().toDate();
    const transaction = await sequelize.transaction();

    try {
        const expiredSupporters = await Supporters.findAll({
            where: {
                expirationDate: {
                    [Op.lte]: now,
                },
                roleId: { [Op.ne]: null },
            },
            transaction,
        });

        for (const supporter of expiredSupporters) {
            const guild = await client.guilds.fetch(supporter.guildId).catch(() => null);
            if (!guild) continue;

            const member = await guild.members.fetch(supporter.userId).catch(() => null);
            const role = supporter.roleId ? await guild.roles.fetch(supporter.roleId).catch(() => null) : null;
            const supportUser = supporter.supportUserId ? await guild.members.fetch(supporter.supportUserId).catch(() => null) : null;

            if (member && role) {
                // Remover o cargo do apoiador
                await member.roles.remove(role).catch(err => console.error(`Erro ao remover cargo: ${err}`));
                console.log(`Cargo ${role.name} removido de ${member.user.username}`);

                // Tentar enviar mensagem para o suporte
                if (supportUser) {
                    await supportUser.send(`O cargo ${role.name} de ${member.user.username} expirou.`).catch(() => {
                        console.log(`Não foi possível enviar DM para ${supportUser.user.username}`);
                    });
                }

                // Registrar log de expiração
                await SupporterLogs.create({
                    userId: supporter.userId,
                    guildId: supporter.guildId,
                    roleId: supporter.roleId,
                    actionType: 'expired',
                    performedBy: 'system',
                    actionDate: new Date(),
                }, { transaction });

                // Remover o registro da tabela Supporters
                await Supporters.destroy({
                    where: { userId: supporter.userId },
                    transaction,
                });
            }
        }

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        console.error('Erro ao verificar cargos expirados:', error);
    }
}

function startRoleCheck(client, checkPeriod) {
    checkPeriod = checkPeriod || '*/5 * * * *';
    cron.schedule(checkPeriod, () => {
        console.log('Verificando cargos expirados...');
        checkExpiredRoles(client);
    });
}

module.exports = { startRoleCheck };
