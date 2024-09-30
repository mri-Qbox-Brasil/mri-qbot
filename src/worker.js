const { Op } = require('sequelize');
const cron = require('node-cron');
const moment = require('moment');
const sequelize = require('./database/sequelize');
const Supporters = require('./model/supporterModel');
const SupporterLogs = require('./model/supporterLogsModel');

async function checkExpiredRoles(client) {
    const now = moment().format('YYYY-MM-DD');
    try {
        const expiredSupporters = await Supporters.findAll({
            where: {
                expirationDate: {
                    [Op.lte]: now,
                },
                roleId: { [Op.ne]: null },
            },
        });

        for (const supporter of expiredSupporters) {
            const transaction = await sequelize.transaction();
            try {
                const guild = client.guilds.cache.get(supporter.guildId);
                if (!guild) continue;

                const member = guild.members.cache.get(supporter.userId);
                const role = guild.roles.cache.get(supporter.roleId);
                const supportUser = supporter.supportUserId ? await guild.members.fetch(supporter.supportUserId) : null;

                if (member && role) {
                    await member.roles.remove(role);
                    console.log(`Cargo ${role.name} removido de ${member.user.username}`);

                    if (supportUser) {
                        await supportUser.send(`O cargo ${role.name} de ${member.user.username} expirou.`);
                    }

                    await SupporterLogs.create({
                        userId: supporter.userId,
                        guildId: supporter.guildId,
                        roleId: supporter.roleId,
                        actionType: 'expired',
                        performedBy: 'system',
                        actionDate: new Date(),
                    }, { transaction });

                    await supporter.update({
                        roleId: null,
                        expirationDate: null,
                    }, { transaction });
                }
                await transaction.commit();
            } catch (error) {
                await transaction.rollback();
                console.error('Erro ao registrar ação:', error);
            }
        }
    }

    catch (error) {
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
