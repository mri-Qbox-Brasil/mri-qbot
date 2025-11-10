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
const hasPermission = require('../../utils/permissionUtils');
const { notifyError } = require('../../utils/errorHandler');

const DEFAULT_TIMEOUT_HOURS = parseInt(process.env.ANNOUNCE_TIMEOUT_HOURS || '24', 10);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Cria um canal temporário para compor e enviar um anúncio.'),

    async execute(interaction) {
        await interaction.deferReply().catch(() => {
            sendReply({ interaction, content: 'Processando...' });
        });

        try {
            if (!await hasPermission(interaction, 'announce')) {
                await sendReply({ interaction, content: 'Você não tem permissão para usar este comando.', ephemeral: true });
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
            const cmdMessageId = await interaction.client.channels.fetch(interaction.channel.id).then(channel => channel.lastMessageId);
            interaction.client.logger.debug('Mensagem de resposta do comando capturada.', { messageId: cmdMessageId });
            const commandMessageId = cmdMessageId || interaction.id;
            const commandChannelId = interaction.channel.id;

            await AnnounceData.create({
                id: announceEntry.id,
                guildId: guild.id,
                channelId: tempChannel.id,
                ownerId: interaction.user.id,
                cmdChannelId: commandChannelId,
                cmdMessageId: commandMessageId,
                announceChannelId: tempChannel.id,
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
                        executeSelect(interaction, comp, cmdMessageId);
                        return;
                    }

                    if (comp.isButton()) {
                        if (baseId === 'announceButton_cancel') {
                            finished = true;
                            // editar mensagem do comando se possível
                            executeCancel(comp, channelId, cmdChannelId, cmdMessageId);
                            messageCollector.stop('cancelled');
                            componentCollector.stop('cancelled');
                            return;
                        }

                        if (baseId === 'announceButton_send') {
                            if (!announceDataEntry.content) {
                                await comp.reply({ content: 'Nenhum rascunho encontrado. Envie uma mensagem neste canal antes de enviar o anúncio.', flags: MessageFlags.Ephemeral });
                                return;
                            }

                            const announceDataEntry = await AnnounceData.findOne({
                                where: { id: announceId }
                            });

                            if (!announceDataEntry) {
                                await comp.reply({ content: 'Entrada AnnounceData nao encontrada.', flags: MessageFlags.Ephemeral });
                                return;
                            }

                            const selectedChannelId = announceDataEntry?.announceChannelId;

                            if (!selectedChannelId) {
                                await comp.reply({ content: 'Por favor, selecione um canal de destino antes de enviar.', flags: MessageFlags.Ephemeral });
                                return;
                            }

                            const targetChannel = await interaction.client.channels.fetch(selectedChannelId).catch(() => null);
                            if (!targetChannel || !targetChannel.isTextBased()) {
                                await comp.reply({ content: 'Canal de destino inválido ou não é um canal de texto.', flags: MessageFlags.Ephemeral });
                                return;
                            }

                            try {
                                await targetChannel.send({ content: announceDataEntry.content });
                            } catch (err) {
                                notifyError({
                                    client: interaction.client,
                                    user: interaction.user,
                                    channel: interaction.channel,
                                    guild: interaction.guild,
                                    context: `/${this.data.name} (sending announcement)`,
                                    error: err
                                });
                                await comp.reply({ content: 'Falha ao enviar o anúncio para o canal selecionado.', flags: MessageFlags.Ephemeral });
                                return;
                            }

                            finished = true;
                            // editar mensagem do comando para indicar sucesso
                            if (cmdMessageId && interaction.channel) {
                                const cmdMsg = await interaction.channel.messages.fetch(cmdMessageId).catch(() => null);
                                if (cmdMsg && cmdMsg.editable) {
                                    await cmdMsg.edit(`Anúncio enviado para <#${selectedChannelId}>. Canal temporário será removido.`).catch(() => null);
                                }
                            }
                            await comp.reply({ content: `Anúncio enviado para <#${selectedChannelId}>. Canal temporário será removido.`, flags: MessageFlags.Ephemeral });
                            messageCollector.stop('sent');
                            componentCollector.stop('sent');
                            await cleanup(interaction, interaction.channel.id, 'sent');
                            return;
                        }
                    }
                } catch (err) {
                    notifyError({
                        client: interaction.client,
                        user: interaction.user,
                        channel: interaction.channel,
                        guild: interaction.guild,
                        context: `/${this.data.name} (collector)`,
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
            notifyError({
                client: interaction.client,
                user: interaction.user,
                channel: interaction.channel,
                guild: interaction.guild,
                context: `/${this.data.name}`,
                error
            });
            try {
                await sendReply({ interaction, content: 'Ocorreu um erro ao executar o comando.', ephemeral: true });
            } catch (_) { /* ignore */ }
        }
    },

    async onChannelDelete(channel, client) {
        // Limpar entradas de canais excluídos
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

    async buttonClick(interaction) {
        interaction.client.logger.debug(`[announce buttonClick] clique de botão para ${interaction.customId}`);
        const parts = (interaction.customId || '').split(':'); // e.g. ['announce_send','<announce.id>']
        const baseId = parts[0];
        const announceId = parts[1];

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
                await executeSend(interaction, channelId);
                return;
            } else if (action === 'cancel') {
                await executeCancel(interaction, channelId, cmdChannelId, cmdMessageId);
                return;
            }
        }
    },

    async selectMenu(interaction) {
        interaction.client.logger.debug(`[announce selectMenu] seleção de menu para ${interaction.customId}`);
        const parts = (interaction.customId || '').split(':'); // e.g. ['announce_send','<announce.id>']
        const baseId = parts[0];
        const announceId = parts[1];

        const announceDataEntry = await interaction.client.db?.AnnounceData.findOne({
            where: { id: announceId }
        });

        if (!announceDataEntry) {
            interaction.client.logger.warn(`[announce selectMenu] entrada AnnounceData não encontrada para id ${announceId}`);
            return;
        }

        const channelId = announceDataEntry.channelId;
        const ownerId = announceDataEntry.ownerId;
        const cmdChannelId = announceDataEntry.cmdChannelId;
        const cmdMessageId = announceDataEntry.cmdMessageId;

        if (!baseId.includes('announce')) {
            interaction.client.logger.warn(`[announce selectMenu] baseId desconhecido: ${baseId}`);
            return;
        }

        if (channelId !== interaction.channel.id || ownerId !== interaction.user.id) {
            await sendReply({ interaction, content: 'Apenas o autor pode usar estes controles.', ephemeral: true });
            return;
        }

        const match = interaction.customId.match(/^Select_([a-z0-9_-]+)/i);
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

    const parts = (interaction.customId || '').split(':'); // e.g. ['announce_send','<announce.id>']
    const baseId = parts[0];
    const announceId = parts[1];

    const announceDataEntry = await interaction.client.db?.AnnounceData.findOne({
        where: { id: announceId }
    });

    if (!announceDataEntry) {
        interaction.client.logger.warn(`[announce selectMenu] entrada AnnounceData não encontrada para id ${announceId}`);
        return;
    }

    announceDataEntry.announceChannelId = comp.values[0];
    await announceDataEntry.save();
    if (msgId && interaction.channel) {
        const cmdMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
        if (cmdMsg && cmdMsg.editable) {
            await cmdMsg.edit(`Canal selecionado: <#${announceDataEntry.announceChannelId}>`).catch(() => null);
        }
    }
    await comp.reply({ content: `Canal selecionado: <#${announceDataEntry.announceChannelId}>`, flags: MessageFlags.Ephemeral });
}

async function executeSend(interaction, channelId) {
    // implementação movida para o coletor principal em execute()
}

async function executeCancel(interaction, channelId, cmdChannelId, cmdMessageId) {
    interaction.client.channels.fetch(cmdChannelId).then(cmdChannel => {
        if (cmdChannel) {
            cmdChannel.messages.fetch(cmdMessageId).then(cmdMessage => {
                if (cmdMessage) {
                    cmdMessage.edit('Anúncio cancelado. Canal temporário será removido.').catch(() => null);
                }
            }).catch(() => null);
        }
    });
    await cleanup(interaction, channelId, 'cancelled by user');
}

async function sendReply({ interaction, content, ephemeral = false }) {
    await interaction.editReply({ content, flags: ephemeral ? MessageFlags.Ephemeral : undefined }).catch(async (error) => {
        interaction.client.logger.error(`[announce editReply] falha ao responder/editReply, tentando fallback`, { interactionId: interaction.id, error: error?.message });
        await interaction.reply({ content, flags: ephemeral ? MessageFlags.Ephemeral : undefined }).catch(async (error) => {
            interaction.client.logger.error(`[announce reply] falha ao responder via reply`, { interactionId: interaction.id, error: error?.message });
            await interaction.followUp({ content, flags: ephemeral ? MessageFlags.Ephemeral : undefined }).catch((error) => {
                interaction.client.logger.error(`[announce followUp] falha ao responder via followUp`, { interactionId: interaction.id, error: error?.message });
                notifyError({
                    client: interaction.client,
                    user: interaction.user,
                    channel: interaction.channel,
                    guild: interaction.guild,
                    context: `/${this.data?.name}`,
                    error
                });
            });
        });
    });
}

async function cleanup(interaction, channelId, reason) {
    interaction.client.logger.debug(`[announce cleanup] limpando canal ${channelId} após ${reason}`);
    try {
        const tempChannel = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (tempChannel && tempChannel.deletable) {
            await tempChannel.delete(`Anúncio finalizado/limpeza: ${reason}`);
        }
        await Announces.destroy({ where: { channelName: safeName, guildId: interaction.guild.id } });
    } catch (_) { /* ignore */ }
};
