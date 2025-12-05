const { Op } = require('sequelize');
const cron = require('node-cron');
const moment = require('moment');
const { SupportActionType } = require('../utils/constants');
const { EmbedColors } = require('../utils/embedUtils');
const { EmbedBuilder } = require('discord.js'); // você usa EmbedBuilder mas não tinha importado

async function expirySupport(client, supporter, transaction, Supporters) {
    const [affectedRows] = await Supporters.update(
        { active: false },
        {
            where: { id: supporter.id },
            transaction,
        }
    );

    if (affectedRows === 0) {
        client.logger.warn(`Nenhum registro atualizado para id: ${supporter.id}`);
    }
    return affectedRows;
}

async function logRoleExpiration(client, supporter, transaction, SupporterLogs) {
    await SupporterLogs.create({
        supportId: supporter.id,
        userId: supporter.userId,
        guildId: supporter.guildId,
        roleId: supporter.roleId,
        actionType: SupportActionType.EXPIRED,
        performedBy: 'system',
        actionDate: new Date(),
    }, { transaction });
    client.logger.info(`Log de expiração criado para supporter id: ${supporter.id}`);
}

async function sendSupportMessage(client, supportUser, roleName, username) {
    try {
        await supportUser.send(`O apoio ${roleName} de ${username} chegou ao fim.`);
    } catch (error) {
        client.logger.error(`Erro ao enviar DM para ${supportUser?.user?.username || 'desconhecido'}: ${error.message}`);
    }
}

async function checkExpiredRoles(client) {
    const { Supporters, SupporterLogs, sequelize } = client.db;

    const now = moment().toDate();
    const expiredSupporters = await Supporters.findAll({
        where: {
            expirationDate: { [Op.lte]: now },
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
                await member.roles.remove(role).catch(err => {
                    client.logger.error(`Erro ao remover apoio ${role.name} de ${member.user.username}: ${err.message}`);
                    client.users.fetch(guild.ownerId).then((owner) => {
                        const embed = new EmbedBuilder()
                            .setTitle('Erro ao expirar apoio')
                            .setColor(EmbedColors.DANGER)
                            .addFields(
                                { name: 'Membro', value: member.user.username },
                                { name: 'ID do Membro', value: member.id },
                                { name: 'Cargo', value: role.name },
                                { name: 'ID do Cargo', value: role.id },
                                { name: 'Servidor', value: guild.name },
                                { name: 'ID do Servidor', value: guild.id },
                                { name: 'Erro', value: err.message }
                            )
                            .setTimestamp();

                        owner.send({ embeds: [embed] })
                            .then(() => client.logger.info('Embed enviado com sucesso!'))
                            .catch((error) => client.logger.error('Erro ao enviar mensagem:', { stack: error?.stack || error }));
                    }).catch(client.logger.error);
                });

                if (supportUser) {
                    await sendSupportMessage(client, supportUser, role.name, member.user.username);
                }

                await expirySupport(client, supporter, transaction, Supporters);
                await logRoleExpiration(client, supporter, transaction, SupporterLogs);
            }
            await transaction.commit();
        } catch (error) {
            client.logger.error(`Erro ao processar supporter ${supporter.id}:`, { stack: error?.stack || error });
            await transaction.rollback();
        }
    }
}

function supporterWorker(client, checkPeriod = '*/1 * * * *') {
    client.logger.info('Inicializando supporterWorker.', { period: checkPeriod });
    cron.schedule(checkPeriod, () => {
        client.logger.info('Verificando cargos expirados...');
        checkExpiredRoles(client);
    });
}

module.exports = { supporterWorker };
