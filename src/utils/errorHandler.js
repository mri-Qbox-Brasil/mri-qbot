const { EmbedBuilder } = require('discord.js');
const { EmbedColors } = require('./embedUtils');

/**
 * Extrai user, channel e guild de várias formas de "source":
 * - Discord Message
 * - Command Interaction
 * - User
 * - Channel
 * - Guild
 * - Objeto { user, channel, guild }
 */
function extractContextFromSource(source = {}) {
	let user, channel, guild;
	if (!source) return { user: undefined, channel: undefined, guild: undefined };

	// Já é um objeto com propriedades
	if (source.user || source.channel || source.guild) {
		return { user: source.user, channel: source.channel, guild: source.guild };
	}

	// Message-like (has author, channel, guild)
	if (source.author) {
		user = source.author;
		channel = source.channel;
		guild = source.guild;
		return { user, channel, guild };
	}

	// Interaction-like (has user or member.user, channel, guild)
	if (source.user || source.member) {
		user = source.user || (source.member && source.member.user);
		channel = source.channel || (source.channelId ? { id: source.channelId } : undefined);
		guild = source.guild || (source.guildId ? { id: source.guildId } : undefined);
		return { user, channel, guild };
	}

	// User object
	if (source.id && source.tag) {
		user = source;
		return { user, channel: undefined, guild: undefined };
	}

	// Channel object
	if (source.id && source.name) {
		channel = source;
		return { user: undefined, channel, guild: undefined };
	}

	// Guild object
	if (source.id && source.name && !source.name.startsWith('#')) {
		guild = source;
		return { user: undefined, channel: undefined, guild };
	}

	return { user: undefined, channel: undefined, guild: undefined };
}

function safeStringifyError(err) {
	if (!err) return 'Sem informação de erro';
	if (err.stack) {
		// limitar tamanho para evitar problemas com embeds
		return err.stack.length > 4000 ? err.stack.slice(0, 3990) + '\n...truncated...' : err.stack;
	}
	return typeof err === 'string' ? err : JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
}

/**
 * notifyError aceita:
 * - notifyError({ client, error, context, source })
 * - notifyError(client, error, context, source)
 *
 * source pode ser Message, Interaction, User, Channel, Guild ou um objeto { user, channel, guild }
 */
async function notifyError(...args) {
	let opts = {};
	if (args.length === 1 && typeof args[0] === 'object' && (args[0].client || args[0].error)) {
		opts = args[0];
	} else {
		opts.client = args[0];
		opts.error = args[1];
		opts.context = args[2];
		opts.source = args[3];
	}

	const { client, error, context = 'desconhecido', source } = opts;

	try {
		if (!client || !client.logger) {
			console.error('Erro detectado:', { stack: error?.stack || error });
		} else {
			client.logger.error('Erro detectado:', { stack: error?.stack || error });
			const ownerId = process.env.OWNER_ID || '289124013375094794';
			const owner = await client.users.fetch(ownerId).catch(() => null);

			const timestamp = new Date();
			const formattedDate = timestamp.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

			const { user, channel, guild } = extractContextFromSource(source);

			const stackOrMessage = safeStringifyError(error);

			const embed = new EmbedBuilder()
				.setTitle('🚨 Erro no Bot')
				.setColor(EmbedColors.DANGER || 0xff0000)
				.setDescription(`Um erro foi detectado durante a execução de uma ação no bot.`)
				.addFields(
					{ name: 'Contexto', value: `\`${context}\``, inline: true },
					{
						name: 'Usuário',
						value: user ? `${user.tag || user.username} (\`${user.id}\`)` : 'Não disponível',
						inline: true
					},
					{
						name: 'Canal',
						value: channel?.name
							? `#${channel.name} (\`${channel.id}\`)`
							: channel?.id
							? `ID: \`${channel.id}\``
							: 'Não disponível',
						inline: true
					},
					{
						name: 'Servidor',
						value: guild?.name
							? `${guild.name} (\`${guild.id}\`)`
							: guild?.id
							? `ID: \`${guild.id}\``
							: 'Não disponível',
						inline: true
					},
					{ name: 'Data/Hora', value: formattedDate, inline: false },
					{
						name: 'Mensagem de erro',
						value: `\`\`\`\n${(error?.message || '').slice(0, 1024) || String(error).slice(0, 1024)}\n\`\`\``
					}
				)
				.setTimestamp(timestamp)
				.setFooter({ text: 'Erro monitorado automaticamente' });

			// enviar embed e, se houver stack, enviar DM adicional com a stack (se couber)
			if (owner) {
				await owner.send({ embeds: [embed] }).catch((dmError) => {
					// se falhar no envio do embed, logar localmente
					client.logger.error('Erro ao enviar DM de erro:', { stack: dmError?.stack || dmError });
				});

				// enviar stack como mensagem separada (se existir)
				if (stackOrMessage) {
					await owner.send({
						content: `\`\`\`\n${stackOrMessage}\n\`\`\``
					}).catch(() => {});
				}
			} else {
				client.logger.warn('Owner não encontrado para envio de erro.');
			}
		}
	} catch (dmError) {
		if (!client || !client.logger) {
			console.error('Erro original:', { stack: error?.stack || error });
			console.error('Erro ao enviar DM de erro:', { stack: dmError?.stack || dmError });
			return;
		}
		client.logger.error('Erro original:', { stack: error?.stack || error });
		client.logger.error('Erro ao enviar DM de erro:', { stack: dmError?.stack || dmError });
	}
}

module.exports = { notifyError };
