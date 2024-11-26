const { Op } = require('sequelize');
const cron = require('node-cron');
const moment = require('moment');
const sequelize = require('./database/sequelize');
const Supporters = require('./model/supporterModel');
const SupporterLogs = require('./model/supporterLogsModel');

async function expirySupport(userId, expirationDate, transaction) {
    const [affectedRows] = await Supporters.update(
        { active: false },
        {
            where: {
                userId,
                expirationDate: { [Op.lte]: expirationDate },
            },
            transaction,
        }
    );

    if (affectedRows === 0) {
        console.log(`Nenhum registro atualizado para userId: ${userId}`);
    }
    return affectedRows;
}

async function logRoleExpiration(supporter, transaction) {
    await SupporterLogs.create({
        supportId: supporter.id,
        userId: supporter.userId,
        guildId: supporter.guildId,
        roleId: supporter.roleId,
        actionType: 'expired',
        performedBy: 'system',
        actionDate: new Date(),
    }, { transaction });
}

async function sendSupportMessage(supportUser, roleName, username) {
    try {
        await supportUser.send(`O cargo ${roleName} de ${username} expirou.`);
    } catch (error) {
        console.error(`Erro ao enviar DM para ${supportUser?.user?.username || 'desconhecido'}: ${error.message}`);
    }
}

async function checkExpiredRoles(client) {
    const now = moment().toDate();
    const expiredSupporters = await Supporters.findAll({
        where: {
            expirationDate: { [Op.lte]: now },
            roleId: { [Op.ne]: null },
            active: true
        },
    });

    for (const supporter of expiredSupporters) {
        const transaction = await sequelize.transaction();
        try {
            const guild = await client.guilds.fetch(supporter.guildId).catch(() => null);
            if (!guild) continue;

            const member = await guild.members.fetch(supporter.userId).catch(() => null);
            const role = supporter.roleId ? await guild.roles.fetch(supporter.roleId).catch(() => null) : null;
            const supportUser = supporter.supportUserId ? await guild.members.fetch(supporter.supportUserId).catch(() => null) : null;

            if (member && role) {
                await member.roles.remove(role).catch(err =>
                    console.error(`Erro ao remover cargo ${role.name} de ${member.user.username}: ${err.message}`)
                );

                if (supportUser) {
                    await sendSupportMessage(supportUser, role.name, member.user.username);
                }

                await expirySupport(supporter.userId, supporter.expirationDate, transaction);
                await logRoleExpiration(supporter, transaction);
            }
            await transaction.commit();
        } catch (error) {
            console.error(`Erro ao processar supporter ${supporter.userId}:`, error);
            await transaction.rollback();
        }
    }
}

function startRoleCheck(client, checkPeriod = '*/1 * * * *') {
    cron.schedule(checkPeriod, () => {
        console.log('Verificando cargos expirados...');
        checkExpiredRoles(client);
    });
}

module.exports = { startRoleCheck };
