const { EmbedColors, createEmbed } = require('../utils/embedUtils');
const { Events, MessageFlags } = require('discord.js');
// usar `client.notifyError` (atribuído no boot) — não importar diretamente

// helper: logging que usa client.logger quando disponível
function logWithClient(client, level, message, meta) {
	// level: 'debug' | 'info' | 'warn' | 'error'
	const logger = client?.logger;
	if (logger && typeof logger[level] === 'function') {
		try { logger[level](message, meta); } catch (_) { /* swallow logger errors */ }
	} else {
		// fallback
		const out = (level === 'error' || level === 'warn') ? console.error : console.debug;
		out(`[interactionCreate] ${message}`, meta ?? '');
	}
}

async function createEmbedInteraction({description, color, fields}) {
	// log que um embed de interação foi criado (usa client apenas se passado via meta ao logger)
	// Nota: não temos client aqui diretamente; o caller pode logar se quiser.
	return await createEmbed({
		title: 'Interação',
		description,
		color,
		fields
	});
}

// helper: tenta reply/editReply; se falhar (ex: canal deletado) envia DM ao usuário como fallback
async function safeReply(interaction, { content, embeds, ephemeral = false } = {}) {
	// log attempt
	logWithClient(interaction.client, 'debug', 'safeReply: tentando responder interação', {
		interactionId: interaction.id,
		user: interaction.user?.id,
		guild: interaction.guild?.id,
		channel: interaction.channel?.id,
		replied: interaction.replied,
		deferred: interaction.deferred,
		ephemeral
	});

	try {
		if (interaction.replied || interaction.deferred) {
			await interaction.editReply({ content, embeds, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
			logWithClient(interaction.client, 'debug', 'safeReply: editReply bem-sucedido', { interactionId: interaction.id });
		} else {
			await interaction.reply({ content, embeds, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
			logWithClient(interaction.client, 'debug', 'safeReply: reply bem-sucedido', { interactionId: interaction.id });
		}
	} catch (err) {
		logWithClient(interaction.client, 'warn', 'safeReply: falha ao responder/editReply, tentando fallback por DM', { interactionId: interaction.id, error: err?.message });
		// fallback: tenta notificar via DM
		try {
			if (embeds) {
				await interaction.user.send({ embeds }).catch(() => {});
			} else {
				await interaction.user.send(content ?? '').catch(() => {});
			}
			logWithClient(interaction.client, 'debug', 'safeReply: fallback por DM bem-sucedido', { user: interaction.user?.id });
		} catch (dmErr) {
			logWithClient(interaction.client, 'error', 'safeReply: fallback por DM também falhou', { user: interaction.user?.id, error: dmErr?.message });
			/* swallow */
		}
	}
}

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction, client) {
		try {
			// Log básico de entrada
			logWithClient(client, 'debug', 'Nova interação recebida', {
				id: interaction.id,
				type: interaction.type,
				isCommand: typeof interaction.isCommand === 'function' ? interaction.isCommand() : undefined,
				isModalSubmit: typeof interaction.isModalSubmit === 'function' ? interaction.isModalSubmit() : undefined,
				isAutocomplete: typeof interaction.isAutocomplete === 'function' ? interaction.isAutocomplete() : undefined,
				user: interaction.user?.id,
				guild: interaction.guild?.id,
				channel: interaction.channel?.id,
				commandName: interaction.commandName ?? null,
				customId: interaction.customId ?? null
			});

			// Modal submits
			if (interaction.isModalSubmit && interaction.isModalSubmit()) {
				const customId = interaction.customId || '';
				const match = customId.match(/^([a-z0-9_-]+)Modal_/i);

				logWithClient(client, 'debug', 'Interação é ModalSubmit', { customId, match: !!match });

				if (match) {
					const commandName = match[1];
					const command = client.commands.get(commandName);
					if (command && typeof command.execute === 'function') {
						logWithClient(client, 'info', 'Executando handler de modal', { commandName, interactionId: interaction.id });
						await command.execute(interaction);
						return;
					} else {
						logWithClient(client, 'warn', 'Nenhum manipulador de modal encontrado', { commandName, interactionId: interaction.id });
						const embed = await createEmbedInteraction({
							description: `Nenhum manipulador encontrado para o modal "${commandName}".`,
							color: EmbedColors.WARNING
						});
						await safeReply(interaction, { embeds: [embed], ephemeral: true });
						return;
					}
				}
			}

			// Slash commands
			if (interaction.isCommand && interaction.isCommand()) {
				logWithClient(client, 'debug', 'Interação é Slash Command', { commandName: interaction.commandName, interactionId: interaction.id });
				const command = client.commands.get(interaction.commandName);
				if (!command) {
					logWithClient(client, 'warn', 'Comando slash não encontrado', { commandName: interaction.commandName });
					return;
				}
				logWithClient(client, 'info', 'Executando comando slash', { commandName: interaction.commandName });
				await command.execute(interaction);
				return;
			}

			// Autocomplete
			if (interaction.isAutocomplete && interaction.isAutocomplete()) {
				logWithClient(client, 'debug', 'Interação é Autocomplete', { commandName: interaction.commandName, interactionId: interaction.id });
				const cmd = client.commands.get(interaction.commandName);
				if (!cmd || typeof cmd.autocomplete !== 'function') {
					logWithClient(client, 'warn', 'Autocomplete handler não encontrado', { commandName: interaction.commandName });
					return;
				}
				logWithClient(client, 'info', 'Executando autocomplete', { commandName: interaction.commandName });
				await cmd.autocomplete(interaction);
				return;
			}

            // Botão
            if (interaction.isButton && interaction.isButton()) {
                const customId = interaction.customId || '';
                logWithClient(client, 'debug', 'Interação é Button', { customId, interactionId: interaction.id });
                // tenta extrair o comando do customId
                const match = customId.match(/^([a-z0-9_-]+)Button_/i);
                if (match) {
                    const commandName = match[1];
                    const command = client.commands.get(commandName);
                    if (command && typeof command.buttonClick === 'function') {
                        logWithClient(client, 'info', 'Executando handler de botão', { commandName, interactionId: interaction.id });
                        await command.buttonClick(interaction);
                        return;
                    } else {
                        logWithClient(client, 'warn', 'Nenhum manipulador de botão encontrado', { commandName, interactionId: interaction.id });
                        const embed = await createEmbedInteraction({
                            description: `Nenhum manipulador encontrado para o botão "${commandName}".`,
                            color: EmbedColors.WARNING
                        });
                        await safeReply(interaction, { embeds: [embed], ephemeral: true });
                        return;
                    }
                }
            }

            // Select Menu
            if (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu()) {
                const customId = interaction.customId || '';
                logWithClient(client, 'debug', 'Interação é ChannelSelectMenu', { customId, interactionId: interaction.id });
                // tenta extrair o comando do customId
                const match = customId.match(/^([a-z0-9_-]+)Select_/i);
                if (match) {
                    const commandName = match[1];
                    const command = client.commands.get(commandName);
                    if (command && typeof command.selectMenu === 'function') {
                        logWithClient(client, 'info', 'Executando handler de select menu', { commandName, interactionId: interaction.id });
                        await command.selectMenu(interaction);
                        return;
                    } else {
                        logWithClient(client, 'warn', 'Nenhum manipulador de select menu encontrado', { commandName, interactionId: interaction.id });
                        const embed = await createEmbedInteraction({
                            description: `Nenhum manipulador encontrado para o select menu "${commandName}".`,
                            color: EmbedColors.WARNING
                        });
                        await safeReply(interaction, { embeds: [embed], ephemeral: true });
                        return;
                    }
                }
            }

			// Other message components (buttons/selects) are ignored here.
			logWithClient(client, 'debug', 'Interação não tratada neste handler', { interactionId: interaction.id });
			// NOTE: announce-related component handling was moved out; implement it inside the announce command module.
			return;

		} catch (error) {
			// log error via logger antes de notificar
			logWithClient(client, 'error', 'Erro no interactionCreate (global handler)', { error: error?.stack ?? error?.message });
			// se safeAsync já notificou, evita notificação duplicada
			if (error && error._notifiedBySafeAsync) {
				return;
			}
			// usar client.notifyError para manter padrão
			try {
				interaction.client.notifyError({ client: interaction.client, user: interaction.user, channel: interaction.channel, guild: interaction.guild, context: 'interactionCreate (global handler)', error });
			} catch (_) {
				// fallback mínimo, não bloquear
				logWithClient(client, 'error', 'Falha ao notificar erro via client.notifyError', { error: _?.stack ?? _?.message });
			}
			// não bloquear outras interações
		}
	},
};
