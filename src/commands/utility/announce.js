const { SlashCommandBuilder, ChannelSelectMenuBuilder } = require('@discordjs/builders');
const {
    ChannelType,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');
const { sendReply } = require('../../utils/generalUtils');
const axios = require('axios');
const { fetchWithRetry } = require('../../utils/httpRetry');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

const DEFAULT_TIMEOUT_HOURS = parseInt(process.env.ANNOUNCE_TIMEOUT_HOURS || '24', 10);
const MSG_TIMEOUT = 45;
const processingSends = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Cria um canal temporário para compor e enviar um anúncio.'),

    async execute(interaction) {
        const cmdMessage = await interaction.deferReply({ fetchReply: true });

        try {
            if (!await interaction.client.hasPermission(interaction, 'announce')) {
                const futureTimestamp = Math.floor(Date.now() / 1000) + MSG_TIMEOUT;
                cmdMessage.reply({ content: `Voce nao tem permissao para usar este comando.\nEsta mensagem será removida <t:${futureTimestamp}:R>.` });
                setTimeout(() => cmdMessage.delete().catch(interaction.client.notifyError), MSG_TIMEOUT * 1000);
                return;
            }

            const safeName = `anuncio-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${interaction.user.id.slice(-4)}`;

            const Announces = interaction.client.db?.Announces;
            const AnnounceData = interaction.client.db?.AnnounceData;
            if (!Announces || !AnnounceData) {
                interaction.client.logger.warn('announceWorker: modelo Announces ou AnnounceData não encontrado no banco de dados.');
                await sendReply({ interaction, content: 'O sistema de anúncios não está disponível no momento.', ephemeral: true });
                return;
            }

            const announce = await Announces.findOne({
                where: { channelName: safeName, guildId: interaction.guild.id }
            });

            if (announce) {
                await sendReply({ interaction, content: 'Um canal temporário de anúncio com seu nome já existe. Por favor, finalize ou cancele o anúncio existente antes de criar outro.', ephemeral: true });
                return;
            }

            const timeoutHours = DEFAULT_TIMEOUT_HOURS;
            const timeoutMs = Math.max(1, timeoutHours) * 60 * 60 * 1000;

            const deleteTimestampSec = Math.floor((Date.now() + timeoutMs) / 1000);
            const discordTimestampFull = `<t:${deleteTimestampSec}:F>`;
            const discordTimestampRelative = `<t:${deleteTimestampSec}:R>`;

            const guild = interaction.guild;
            if (!guild) {
                await sendReply({ interaction, content: 'Este comando deve ser usado em um servidor.' });
                return;
            }

            const permissionOverwrites = [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.EmbedLinks,
                    ],
                },
                {
                    id: interaction.client.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.ReadMessageHistory,
                    ],
                },
            ];

            const topicText = `Canal temporário de anúncio criado por ${interaction.user.tag}. Será removido automaticamente em ${discordTimestampFull} (${discordTimestampRelative}).`;
            const tempChannel = await guild.channels.create({
                name: safeName,
                type: ChannelType.GuildText,
                topic: topicText,
                permissionOverwrites,
            });

            const announceEntry = await Announces.create({
                guildId: guild.id,
                channelId: tempChannel.id,
                channelName: safeName,
                expiryDate: new Date(Date.now() + timeoutMs),
            });

            await sendReply({ interaction, content: `Canal temporário criado: ${tempChannel}` });
            const cmdMessageId = (await interaction.fetchReply()).id;
            interaction.client.logger.debug('Mensagem de resposta do comando capturada.', { messageId: cmdMessageId });
            const commandMessageId = cmdMessageId;
            const commandChannelId = interaction.channel.id;

            await AnnounceData.create({
                id: announceEntry.id,
                guildId: guild.id,
                channelId: tempChannel.id,
                ownerId: interaction.user.id,
                cmdChannelId: commandChannelId,
                cmdMessageId: commandMessageId,
                announceChannelId: tempChannel.id,
                attachments: JSON.stringify([]),
            });

            // customId inclui announceData.id para rastrear o canal de anúncio:
            // e.g. 'announce_select:<announce.id>'
            const select = new ChannelSelectMenuBuilder()
                .setCustomId(`announceSelect_channel:${announceEntry.id}`)
                .setChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement])
                .setPlaceholder('Selecione o canal onde o anúncio será postado');

            const sendButton = new ButtonBuilder()
                .setCustomId(`announceButton_send:${announceEntry.id}`)
                .setLabel('Enviar')
                .setStyle(ButtonStyle.Success);

            const cancelButton = new ButtonBuilder()
                .setCustomId(`announceButton_cancel:${announceEntry.id}`)
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Danger);

            const introEmbed = new EmbedBuilder()
                .setTitle('Canal de composição de anúncio')
                .setDescription([
                    `Olá ${interaction.user}, este é seu canal temporário para compor o anúncio.`,
                    'Envie a(s) mensagem(ns) que devem compor o anúncio. O sistema usará a última mensagem enviada por você neste canal como rascunho quando você clicar em Enviar.',
                    'Você pode editar sua última mensagem antes de clicar em Enviar.',
                    'Selecione o canal de destino no menu abaixo e clique em Enviar para postar.',
                    '',
                    `Este canal será excluído automaticamente em ${discordTimestampFull} (${discordTimestampRelative}).`
                ].join('\n\n'));

            const botMessage = await tempChannel.send({
                content: `${interaction.user}`,
                embeds: [introEmbed],
                components: [
                    new ActionRowBuilder().addComponents(select),
                    new ActionRowBuilder().addComponents(sendButton, cancelButton),
                ],
            });

            let selectedChannelId = null;

            const componentCollector = botMessage.createMessageComponentCollector({
                time: timeoutMs,
            });

            const messageCollector = tempChannel.createMessageCollector({
                filter: m => m.author.id === interaction.user.id,
                time: timeoutMs,
            });

            messageCollector.on('collect', msg => {
                interaction.client.db?.AnnounceData.findOne({
                    where: { id: announceEntry.id }
                }).then(announceDataEntry => {
                    if (announceDataEntry) {
                        announceDataEntry.content = msg.content;
                        try {
                            const atts = msg.attachments ? msg.attachments.map(a => ({ url: a.url, name: a.name || a.id })) : [];
                            announceDataEntry.attachments = JSON.stringify(atts);
                        } catch (_) {
                            // ignore attachment extraction errors
                        }
                        announceDataEntry.save().catch(() => { });
                    }
                })
            });

            let finished = false;
            componentCollector.on('collect', async (comp) => {
                // Validar customId pattern e permissões do usuário
                const parts = (comp.customId || '').split(':'); // e.g. ['announce_send','<announce.id>']
                const baseId = parts[0];
                const dataId = parts[1];

                const announceDataEntry = await AnnounceData.findOne({
                    where: { id: dataId }
                });

                if (!announceDataEntry) {
                    componentCollector.stop('invalid');
                    messageCollector.stop('invalid');
                    interaction.client.logger.warn(`[announce collector] entrada AnnounceData não encontrada para id ${dataId}`);
                    return;
                }

                const channelId = announceDataEntry?.channelId;
                const ownerId = announceDataEntry?.ownerId;
                const cmdChannelId = announceDataEntry?.cmdChannelId;
                const cmdMessageId = announceDataEntry?.cmdMessageId;

                if (channelId !== tempChannel.id || ownerId !== comp.user.id) {
                    interaction.client.logger.warn(`[announce collector] usuário ${comp.user.id} tentou interagir com canal/anúncio de outro usuário: ${channelId}->${tempChannel.id}|${ownerId}->${comp.user.id}.`);
                    await comp.reply({ content: 'Apenas o autor pode usar estes controles.', flags: MessageFlags.Ephemeral });
                    return;
                }

                try {
                        if (baseId === 'announceSelect_channel') {
                            await executeSelect(interaction, comp, cmdMessageId);
                            return;
                        }

                    if (comp.isButton()) {
                        if (baseId === 'announceButton_cancel') {
                            finished = true;
                            // editar mensagem do comando se possível
                            await executeCancel(comp, channelId, cmdChannelId, cmdMessageId);
                            messageCollector.stop('cancelled');
                            componentCollector.stop('cancelled');
                            return;
                        }

                        if (baseId === 'announceButton_send') {
                            await executeSend(comp, channelId, cmdChannelId, cmdMessageId);
                            finished = true;
                            try {
                                messageCollector.stop('sent');
                                componentCollector.stop('sent');
                            } catch (err) {
                                interaction.client.logger.debug('Falha ao parar coletores após envio.', { error: err?.stack || err });
                            }
                            return;
                        }
                    }
                } catch (err) {
                    interaction.client.notifyError({
                        client: interaction.client,
                        user: interaction.user,
                        channel: interaction.channel,
                        guild: interaction.guild,
                        context: `/announce (collector)`,
                        error: err
                    });
                    try { await comp.reply({ content: 'Ocorreu um erro ao processar sua interação.', flags: MessageFlags.Ephemeral }); } catch (_) { }
                }
            });

            componentCollector.on('end', async (_, reason) => {
                if (finished) return;
                if (reason === 'time') {
                    messageCollector.stop('timeout');
                    await cleanup(interaction, tempChannel.id, 'timeout');
                }
            });

            messageCollector.on('end', async (_, reason) => {
                if (finished) return;
                if (reason === 'time') {
                    try {
                        await cleanup(interaction, tempChannel.id, 'timeout');
                    } catch (_) { }
                }
            });

        } catch (error) {
            interaction.client.notifyError({
                client: interaction.client,
                user: interaction.user,
                channel: interaction.channel,
                guild: interaction.guild,
                context: '/announce',
                error
            });
            try {
                await sendReply({ interaction, content: 'Ocorreu um erro ao executar o comando.', ephemeral: true });
            } catch (_) { /* ignore */ }
        }
    },

    async onChannelDelete(channel, client) {
        client.logger.debug(`[announce onChannelDelete] Verificando exclusão do canal ${channel.id}`);
        const Announces = client.db?.Announces;
        const AnnounceData = client.db?.AnnounceData;
        if (!Announces || !AnnounceData) {
            client.logger.warn('announceWorker: modelo Announces ou AnnounceData não encontrado no banco de dados.');
            return;
        }

        const announceEntry = await Announces.findOne({
            where: { guildId: channel.guild.id, channelId: channel.id }
        });
        const announceDataEntry = await AnnounceData.findOne({
            where: { guildId: channel.guild.id, channelId: channel.id }
        });
        if (announceDataEntry) {
            await AnnounceData.destroy({ where: { guildId: channel.guild.id, channelId: channel.id } });
        }
        if (announceEntry) {
            await Announces.destroy({ where: { guildId: channel.guild.id, channelId: channel.id } });
        }
        client.logger.debug(`[announce onChannelDelete] Canal de anúncio temporário excluído: ${channel.id}, removendo do banco de dados.`);
    },

    async onMessageCreate(message) {
        if (message.author.bot) {
            message.client.logger.debug('[announce onMessageCreate] mensagem do bot ignorada.');
            return;
        }

        const AnnounceData = message.client.db?.AnnounceData;

        if (!AnnounceData) {
            message.client.logger.warn('[announce onMessageCreate] modelo AnnounceData não encontrado no banco de dados.');
            return;
        }

        const announceDataEntry = await AnnounceData.findOne({
            where: { channelId: message.channel.id }
        });

        if (!announceDataEntry) {
            message.client.logger.debug('[announce onMessageCreate] nenhum dado de anúncio encontrado para este canal.');
            return;
        }

        await AnnounceData.update({
            content: message.content,
            attachments: JSON.stringify(message.attachments ? message.attachments.map(a => ({ url: a.url, name: a.name || a.id })) : [])
        }, {
            where: { id: announceDataEntry.id }
        });
    },

    async onMessageUpdate(oldMessage, newMessage) {
        try {
            // Garantir que temos objetos completos (não parciais). Se forem parciais, buscar do API.
            if (newMessage?.partial) {
                newMessage = await newMessage.fetch().catch((err) => {
                    newMessage.client?.logger?.debug('[announce onMessageUpdate] não foi possível buscar newMessage parcial, abortando.');
                    return;
                });
            }
            if (oldMessage?.partial) {
                oldMessage = await oldMessage.fetch().catch((err) => {
                    newMessage.client?.logger?.debug('[announce onMessageUpdate] não foi possível buscar oldMessage parcial, abortando.');
                    return;
                });
            }

            if (!newMessage || !oldMessage) {
                newMessage.client?.logger?.debug('[announce onMessageUpdate] mensagens inválidas, ignorando.');
                return;
            }

            if (newMessage.author?.bot) {
                newMessage.client.logger.debug('[announce onMessageUpdate] mensagem do bot ignorada.');
                return;
            }

            // Se o conteúdo não mudou, nada a fazer
            if (newMessage.content === oldMessage.content) {
                newMessage.client.logger.debug('[announce onMessageUpdate] conteúdo da mensagem não alterado, ignorando.');
                return;
            }

            let lastMsg = null;
            try {
                const fetched = await newMessage.channel.messages.fetch({ limit: 1 });
                lastMsg = fetched?.first() || null;
            } catch (err) {
                newMessage.client.logger.debug('[announce onMessageUpdate] falha ao buscar última mensagem do canal, prosseguindo sem checagem de último.');
            }

            if (lastMsg && oldMessage.id !== lastMsg.id) {
                newMessage.client.logger.debug('[announce onMessageUpdate] mensagem não é a última no canal, ignorando.');
                return;
            }

            const AnnounceData = newMessage.client.db?.AnnounceData;

            if (!AnnounceData) {
                newMessage.client.logger.warn('[announce onMessageUpdate] modelo AnnounceData não encontrado no banco de dados.');
                return;
            }

            const announceDataEntry = await AnnounceData.findOne({
                where: { channelId: newMessage.channel.id }
            });

            if (!announceDataEntry) {
                newMessage.client.logger.debug('[announce onMessageUpdate] nenhum dado de anúncio encontrado para este canal.');
                return;
            }

            newMessage.client.logger.debug(`[announce onMessageUpdate] atualizando rascunho de anúncio com nova mensagem editada: ${newMessage.content}`);
            await AnnounceData.update({
                content: newMessage.content,
                attachments: JSON.stringify(newMessage.attachments ? newMessage.attachments.map(a => ({ url: a.url, name: a.name || a.id })) : [])
            }, {
                where: { id: announceDataEntry.id }
            });
        } catch (err) {
            newMessage.client.notifyError({
                client: newMessage.client,
                user: newMessage.author,
                channel: newMessage.channel,
                guild: newMessage.guild,
                context: '/announce (onMessageUpdate)',
                error: err
            });
        }
    },

    async buttonClick(interaction) {
        interaction.client.logger.debug(`[announce buttonClick] clique de botão para ${interaction.customId}`);
        const parts = (interaction.customId || '').split(':'); // e.g. ['announce_send','<announce.id>']
        interaction.client.logger.debug(`[announce buttonClick] parts: ${parts}`);
        const baseId = parts[0];
        interaction.client.logger.debug(`[announce buttonClick] baseId: ${baseId}`);
        const announceId = parts[1];
        interaction.client.logger.debug(`[announce buttonClick] announceId: ${announceId}`);

        const announceDataEntry = await interaction.client.db?.AnnounceData.findOne({
            where: { id: announceId }
        });

        if (!announceDataEntry) {
            interaction.client.logger.warn(`[announce buttonClick] entrada AnnounceData não encontrada para id ${announceId}`);
            return;
        }

        const channelId = announceDataEntry.channelId;
        const ownerId = announceDataEntry.ownerId;
        const cmdChannelId = announceDataEntry.cmdChannelId;
        const cmdMessageId = announceDataEntry.cmdMessageId;

        if (!baseId.includes('announce')) {
            interaction.client.logger.warn(`[announce buttonClick] baseId desconhecido: ${baseId}`);
            return;
        }

        if (channelId !== interaction.channel.id || ownerId !== interaction.user.id) {
            await sendReply({ interaction, content: 'Apenas o autor pode usar estes controles.', ephemeral: true });
            return;
        }

        const match = interaction.customId.match(/^announceButton_([a-z0-9_-]+)/i);
        if (match) {
            const action = match[1];
            interaction.client.logger.debug(`[announce buttonClick] Botão para ${action} pressionado.`);

            if (action === 'send') {
                interaction.client.logger.debug('[announce buttonClick] executando envio de anúncio.');
                await executeSend(interaction, channelId, cmdChannelId, cmdMessageId);
                return;
            } else if (action === 'cancel') {
                interaction.client.logger.debug('[announce buttonClick] executando cancelamento de anúncio.');
                await executeCancel(interaction, channelId, cmdChannelId, cmdMessageId);
                return;
            }
        }
    },

    async selectMenu(interaction) {
        interaction.client.logger.debug(`[announce selectMenu] seleção de menu para ${interaction.customId}`);
        const parts = (interaction.customId || '').split(':'); // e.g. ['announce_send','<announce.id>']
        interaction.client.logger.debug(`[announce selectMenu] parts: ${parts}`);
        const baseId = parts[0];
        interaction.client.logger.debug(`[announce selectMenu] baseId: ${baseId}`);
        const announceId = parts[1];
        interaction.client.logger.debug(`[announce selectMenu] announceId: ${announceId}`);

        const announceDataEntry = await interaction.client.db?.AnnounceData.findOne({
            where: { id: announceId }
        });

        if (!announceDataEntry) {
            interaction.client.logger.warn(`[announce selectMenu] entrada AnnounceData não encontrada para id ${announceId}`);
            return;
        }

        const channelId = announceDataEntry.channelId;
        const ownerId = announceDataEntry.ownerId;

        if (!baseId.includes('announce')) {
            interaction.client.logger.warn(`[announce selectMenu] baseId desconhecido: ${baseId}`);
            return;
        }

        if (channelId !== interaction.channel.id || ownerId !== interaction.user.id) {
            await sendReply({ interaction, content: 'Apenas o autor pode usar estes controles.', ephemeral: true });
            return;
        }

        const match = interaction.customId.match(/^announceSelect_([a-z0-9_-]+)/i);
        if (match) {
            const action = match[1];
            if (action === 'channel') {
                await executeSelect(interaction, interaction, interaction.message.id);
            }
        }
    }
};

async function executeSelect(interaction, comp, msgId) {
    interaction.client.logger.debug('Canal selecionado para anúncio.', { channelId: comp.values[0], userId: comp.user.id });

    // responder rápido para evitar timeout de interação (3s)
    let didDefer = false;
    try {
        if (!comp.deferred && !comp.replied) {
            await comp.deferReply({ ephemeral: true }).catch(() => {});
            didDefer = true;
        }
    } catch (_) { /* ignore */ }

    const announceDataEntry = await getAnnounceData(comp);

    if (!announceDataEntry) {
        try {
            if (didDefer) await comp.editReply({ content: 'Erro: dado de anúncio não encontrado.' });
            else await comp.reply({ content: 'Erro: dado de anúncio não encontrado.', flags: MessageFlags.Ephemeral });
        } catch (_) { }
        return;
    }

    interaction.client.logger.debug('Atualizando canal de anúncio selecionado.', { channelId: comp.values[0], announceDataId: announceDataEntry.id });

    announceDataEntry.announceChannelId = comp.values[0];
    await announceDataEntry.save();
    if (msgId && interaction.channel) {
        const cmdMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
        if (cmdMsg && cmdMsg.editable) {
            await cmdMsg.edit(`Canal selecionado: <#${announceDataEntry.announceChannelId}>`).catch(() => null);
        }
    }

    try {
        if (didDefer) {
            await comp.editReply({ content: `Canal selecionado: <#${announceDataEntry.announceChannelId}>` }).catch(() => {});
        } else {
            await comp.reply({ content: `Canal selecionado: <#${announceDataEntry.announceChannelId}>`, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    } catch (err) {
        interaction.client.logger.debug('[announce executeSelect] falha ao responder interação do select', { error: err?.stack || err });
    }
}

async function executeSend(interaction, channelId, cmdChannelId, cmdMessageId) {

    const announceDataEntry = await getAnnounceData(interaction);

    if (!announceDataEntry) return;

    try {
        const client = interaction.client;
        const tempChannel = await client.channels.fetch(channelId).catch(() => null);
        if (tempChannel && tempChannel.isTextBased()) {
            try {
                const fetched = await tempChannel.messages.fetch({ limit: 20 });
                if (fetched && fetched.size > 0) {
                    const ownerMsg = fetched.find(m => m.author && m.author.id === announceDataEntry.ownerId);
                    if (ownerMsg) {
                        announceDataEntry.content = ownerMsg.content;
                        try {
                            const atts = ownerMsg.attachments ? ownerMsg.attachments.map(a => ({ url: a.url, name: a.name || a.id })) : [];
                            announceDataEntry.attachments = JSON.stringify(atts);
                        } catch (_) { /* ignore */ }
                        await announceDataEntry.save().catch(() => {});
                    }
                }
            } catch (_) {
            }
        }
    } catch (_) { /* ignore */ }

    const sequelize = interaction.client.db?.sequelize;
    const AnnounceDataModel = interaction.client.db?.AnnounceData;
    const LOCK_TTL_MS = 30 * 1000; // 30s lock
    let acquiredLock = false;
    if (sequelize && AnnounceDataModel) {
        const t = await sequelize.transaction();
        try {
            const row = await AnnounceDataModel.findOne({ where: { id: announceDataEntry.id }, transaction: t, lock: t.LOCK.UPDATE });
            const now = new Date();
            if (row.sentAt) {
                await t.commit();
                try { await interaction.reply({ content: 'Este anúncio já foi enviado anteriormente.', flags: MessageFlags.Ephemeral }); } catch(_) {}
                return;
            }
            if (row.lockedUntil && new Date(row.lockedUntil) > now) {
                await t.commit();
                try { await interaction.reply({ content: 'Anúncio já está sendo processado por outra instância.', flags: MessageFlags.Ephemeral }); } catch(_) {}
                return;
            }
            row.lockedUntil = new Date(Date.now() + LOCK_TTL_MS);
            await row.save({ transaction: t });
            await t.commit();
            acquiredLock = true;
        } catch (err) {
            try { await t.rollback(); } catch(_) {}
            interaction.client.logger.debug('[announce executeSend] falha ao adquirir lock DB', { error: err?.stack || err });
            if (processingSends.has(announceDataEntry.id)) {
                try { await interaction.reply({ content: 'Anúncio já está sendo processado...', flags: MessageFlags.Ephemeral }); } catch(_) {}
                return;
            }
            processingSends.add(announceDataEntry.id);
        }
    } else {
        if (processingSends.has(announceDataEntry.id)) {
            try { await interaction.reply({ content: 'Anúncio já está sendo processado...', flags: MessageFlags.Ephemeral }); } catch(_) {}
            return;
        }
        processingSends.add(announceDataEntry.id);
        acquiredLock = true;
    }

    if (!announceDataEntry.content) {
        await interaction.reply({ content: 'Nenhum rascunho encontrado. Envie uma mensagem neste canal antes de enviar o anúncio.', flags: MessageFlags.Ephemeral });
        processingSends.delete(announceDataEntry.id);
        return;
    }

    const selectedChannelId = announceDataEntry?.announceChannelId;

    if (!selectedChannelId) {
        await interaction.reply({ content: 'Por favor, selecione um canal de destino antes de enviar.', flags: MessageFlags.Ephemeral });
        return;
    }

    const targetChannel = await interaction.client.channels.fetch(selectedChannelId).catch(() => null);
    if (!targetChannel || !targetChannel.isTextBased()) {
        await interaction.reply({ content: 'Canal de destino inválido ou não é um canal de texto.', flags: MessageFlags.Ephemeral });
        return;
    }

    try {
        let attachments = [];
        if (announceDataEntry.attachments) {
            try { attachments = JSON.parse(announceDataEntry.attachments) || []; } catch (_) { attachments = []; }
        }

        const files = [];
        const tempFilesToRemove = [];
        const MAX_IN_MEMORY = 5 * 1024 * 1024; // 5 MB
        for (const a of attachments) {
            try {
                if (!a) continue;
                const url = typeof a === 'string' ? a : a.url;
                const name = typeof a === 'string' ? (a.split('?')[0].split('/').pop() || 'file') : (a.name || (a.url.split('?')[0].split('/').pop()) || 'file');

                let useStream = false;
                try {
                    const head = await fetchWithRetry(url, { method: 'HEAD', timeout: 5000 }).catch(() => null);
                    const len = head?.headers?.['content-length'] ? parseInt(head.headers['content-length'], 10) : NaN;
                    if (!isNaN(len) && len > MAX_IN_MEMORY) useStream = true;
                } catch (_) { /* ignore */ }

                if (!useStream) {
                    const res = await fetchWithRetry(url, { method: 'GET', responseType: 'arraybuffer', timeout: 20000 }, 3, 8000);
                    const buffer = Buffer.from(res.data);
                    if (buffer.length > MAX_IN_MEMORY) {
                        useStream = true;
                    } else {
                        files.push({ attachment: buffer, name });
                        continue;
                    }
                }

                if (useStream) {
                    const tmpPath = path.join(os.tmpdir(), `announce-${announceDataEntry.id}-${Date.now()}-${name}`.replace(/[^a-zA-Z0-9._-]/g, '_'));
                    const response = await fetchWithRetry(url, { method: 'GET', responseType: 'stream', timeout: 60000 }, 3, 8000);
                    const writer = fs.createWriteStream(tmpPath);
                    await streamPipeline(response.data, writer);
                    files.push({ attachment: tmpPath, name });
                    tempFilesToRemove.push(tmpPath);
                }
            } catch (err) {
                interaction.client.logger.debug('[announce executeSend] falha ao baixar attachment', { url: a?.url || a, error: err?.stack || err });
            }
        }

        if (files.length > 0) {
            await targetChannel.send({ content: announceDataEntry.content, files });
        } else {
            await targetChannel.send({ content: announceDataEntry.content });
        }

        for (const f of tempFilesToRemove) {
            try {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            } catch (err) {
                try { interaction.client.logger.warn('[announce cleanup] falha ao remover tempfile', { file: f, error: err?.stack || err?.message || err }); } catch(_) {}
            }
        }
        await deferReply(interaction, cmdChannelId, cmdMessageId, `Anúncio enviado para <#${selectedChannelId}>. Canal temporário será removido.`);
        try { await interaction.reply({ content: `Anúncio enviado para <#${selectedChannelId}>. Canal temporário será removido.`, flags: MessageFlags.Ephemeral }); } catch (_) { /* ignore if already replied/updated */ }

        try {
            const CMD_DELETE_DELAY_MS = 30 * 1000;
            const cmdChannel = await interaction.client.channels.fetch(cmdChannelId).catch(() => null);
            if (cmdChannel) {
                const cmdMsg = await cmdChannel.messages.fetch(cmdMessageId).catch(() => null);
                if (cmdMsg && cmdMsg.editable) {
                    const deleteTimestampSec = Math.floor(Date.now() / 1000) + Math.ceil(CMD_DELETE_DELAY_MS / 1000);
                    const newContent = `Anúncio enviado para <#${selectedChannelId}>. Canal temporário será removido.\nEsta mensagem será removida <t:${deleteTimestampSec}:R>.`;
                    await cmdMsg.edit(newContent).catch(() => null);
                    setTimeout(() => {
                        cmdMsg.delete().catch(() => null);
                    }, CMD_DELETE_DELAY_MS);
                }
            }

            await cleanup(interaction, channelId, 'sent');
        } catch (err) {
            interaction.client.logger.debug('[announce executeSend] falha ao editar/excluir mensagem do comando ou ao limpar canal', { error: err?.stack || err });
            try { await cleanup(interaction, channelId, 'sent'); } catch (_) { }
        }

        try {
            const AnnounceDataModel = interaction.client.db?.AnnounceData;
            if (AnnounceDataModel) {
                await AnnounceDataModel.update({ sentAt: new Date(), lockedUntil: null }, { where: { id: announceDataEntry.id } }).catch(() => {});
            }
        } catch (_) { }
        processingSends.delete(announceDataEntry.id);
    } catch (err) {
        interaction.client.notifyError({
            client: interaction.client,
            user: interaction.user,
            channel: interaction.channel,
            guild: interaction.guild,
            context: '/announce (sending announcement)',
            error: err
        });
        try { await interaction.reply({ content: 'Falha ao enviar o anúncio para o canal selecionado.', flags: MessageFlags.Ephemeral }); } catch(_) {}
        try {
            const AnnounceDataModel = interaction.client.db?.AnnounceData;
            if (AnnounceDataModel) {
                await AnnounceDataModel.update({ lockedUntil: null }, { where: { id: announceDataEntry.id } }).catch(() => {});
            }
        } catch (_) { }
        processingSends.delete(announceDataEntry.id);
        return;
    }
}

async function executeCancel(interaction, channelId, cmdChannelId, cmdMessageId) {
    await deferReply(interaction, cmdChannelId, cmdMessageId, 'Anúncio cancelado pelo usuário. Limpando canal temporário...');
    await cleanup(interaction, channelId, 'cancelled by user');
}

async function deferReply(interaction, cmdChannelId, cmdMessageId, content) {
    interaction.client.logger.debug('[announce deferReply] tentando editar mensagem do comando.', { cmdChannelId, cmdMessageId, content });
    interaction.client.channels.fetch(cmdChannelId).then(cmdChannel => {
        interaction.client.logger.debug('[announce deferReply] canal do comando buscado.', { cmdChannelId });
        if (cmdChannel) {
            interaction.client.logger.debug('[announce deferReply] tentando editar mensagem do comando.', { cmdChannelId, cmdMessageId, content });
            cmdChannel.messages.fetch(cmdMessageId).then(cmdMessage => {
                interaction.client.logger.debug('[announce deferReply] mensagem do comando buscada.', { cmdMessageId });
                if (cmdMessage) {
                    interaction.client.logger.debug('[announce deferReply] editando mensagem do comando.', { cmdMessageId, content });
                    cmdMessage.edit(content).catch((err) => {
                        interaction.client.logger.debug('[announce deferReply] falha ao editar mensagem do comando.', { cmdMessageId, error: err?.stack || err });
                    });
                }
            }).catch((err) => {
                interaction.client.logger.debug('[announce deferReply] falha ao buscar mensagem do comando.', { cmdMessageId, error: err?.stack || err });
            });
        }
    });
}

async function getAnnounceData(interaction) {
    const parts = (interaction.customId || '').split(':'); // e.g. ['announce_send','<announce.id>']
    const baseId = parts[0];
    const announceId = parts[1];

    if (!baseId.includes('announce')) {
        interaction.client.logger.warn(`[announce getAnnounceData] baseId desconhecido: ${baseId}`);
        return;
    }

    if (announceId == null) {
        interaction.client.logger.warn(`[announce getAnnounceData] announceId: ${announceId} não encontrado no customId: ${interaction.customId}.`);
        return;
    }

    const announceDataEntry = await interaction.client.db?.AnnounceData.findOne({
        where: { id: announceId }
    });

    if (!announceDataEntry) {
        interaction.client.logger.warn(`[announce getAnnounceData] entrada AnnounceData não encontrada para id ${announceId}`);
        return;
    }

    return announceDataEntry;
}

async function cleanup(interaction, channelId, reason) {
    interaction.client.logger.debug(`[announce cleanup] limpando canal ${channelId} após ${reason}`);
    try {
        const client = interaction.client;
        const tempChannel = await client.channels.fetch(channelId).catch(() => null);
        if (tempChannel) {
            try {
                if (tempChannel.deletable) {
                    await tempChannel.delete(`Anúncio finalizado/limpeza: ${reason}`);
                } else {
                    client.logger.debug(`[announce cleanup] canal ${channelId} não deletável pelo bot.`);
                }
            } catch (err) {
                client.logger.debug('[announce cleanup] falha ao deletar canal temporário.', { channelId, error: err?.stack || err });
            }
        }

        const Announces = client.db?.Announces;
        const AnnounceData = client.db?.AnnounceData;
        if (AnnounceData) {
            await AnnounceData.destroy({ where: { channelId } }).catch(() => {});
        }
        if (Announces) {
            await Announces.destroy({ where: { channelId } }).catch(() => {});
        }

        client.logger.info(`[announce cleanup] limpeza finalizada para canal ${channelId} (motivo: ${reason}).`);
    } catch (err) {
        try { interaction.client.logger.error('[announce cleanup] erro durante cleanup', { stack: err?.stack || err }); } catch(_) {}
    }
};
