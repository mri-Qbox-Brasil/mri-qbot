const { SlashCommandBuilder } = require('@discordjs/builders');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('release')
		.setDescription('Envia um embed de release (abre um formulário para preencher os detalhes).')
		.addChannelOption(option =>
			option
				.setName('canal')
				.setDescription('Canal onde a mensagem será enviada (opcional).')
				.setRequired(false)
		),

	async execute(interaction) {
		try {
			if (interaction.isModalSubmit() && interaction.customId && interaction.customId.startsWith('releaseModal_')) {
				await interaction.deferReply({ flags: MessageFlags.Ephemeral });

				const modalSuffix = interaction.customId.split('releaseModal_')[1] || '';
				// caso customId venha em formatos antigos com "_", pegamos apenas a primeira parte como channelId
				const channelId = modalSuffix.split('_')[0] || '';
				const linkType = 'repo'; // sempre repo enquanto o seletor foi removido
				const repoName = interaction.fields.getTextInputValue('repo_name').trim();
				const repoOnly = repoName.includes('/') ? repoName.split('/').pop() : repoName;
				const releaseTag = interaction.fields.getTextInputValue('release_tag').trim();
				const shortDesc = interaction.fields.getTextInputValue('short_desc').trim() || undefined;
				const releaseBody = interaction.fields.getTextInputValue('release_body').trim();

				const targetChannel = await interaction.client.channels.fetch(channelId).catch(() => null);

				if (!targetChannel || !targetChannel.isTextBased()) {
					await interaction.editReply({ content: 'Canal de destino inválido ou não é um canal de texto.' });
					return;
				}

				const releaseUrl = `https://github.com/${repoName}/releases/tag/${releaseTag}`;
				const commitsUrl = `https://github.com/${repoName}/commits/${releaseTag}`;
				const repoUrl = `https://github.com/${repoName}`;

				const embed = new EmbedBuilder()
					.setAuthor({ name: 'Github - Updates' })
					.setTitle(`[${repoOnly}] Nova versão disponível: ${releaseTag}`)
					.setDescription(shortDesc || '')
					.addFields(
						{ name: 'O que há de novo?', value: releaseBody || 'Nenhuma descrição fornecida.' },
						{ name: 'Veja todas as mudanças', value: commitsUrl },
                        { name: 'Precisa de ajuda?', value: `[Participe da comunidade](${process.env.INVITE_DISCORD_URL != undefined ? process.env.INVITE_DISCORD_URL : 'https://discord.gg/uEfGD4mmVh'})`, inline: true },
                        { name: 'Documentação', value: `[Acesse aqui](${process.env.DOCUMENTATION_URL != undefined ? process.env.DOCUMENTATION_URL : 'https://docs.mriqbox.com.br'})`, inline: true }
					)
					.setColor(4243543)
					.setFooter({ text: `Realizado por: ${interaction.user.tag}` })
					.setTimestamp();
				embed.setURL(repoUrl);

				await targetChannel.send({ embeds: [embed] }).catch(async (err) => {
					interaction.client.notifyError({
						client: interaction.client,
						user: interaction.user,
						channel: interaction.channel,
						guild: interaction.guild,
						context: `/release (sending embed)`,
						error: err
					});
					await interaction.editReply({ content: 'Falha ao enviar a mensagem no canal de destino.' }).catch(() => {});
				});

				await interaction.editReply({ content: `Mensagem de release enviada para ${targetChannel}.` }).catch(() => {});
				return;
			}

			if (interaction.isChatInputCommand()) {
				if (!await interaction.client.hasPermission(interaction, 'release')) {
					await interaction.reply({ content: 'Você não tem permissão para usar este comando.', flags: MessageFlags.Ephemeral });
					return;
				}

				const canalDestino = interaction.options.getChannel('canal') || interaction.channel;
				const canalId = canalDestino.id;

				// Abre o modal diretamente; link será sempre repo (commits)
				const modal = new ModalBuilder()
					.setCustomId(`releaseModal_${canalId}`)
					.setTitle('Criar Release');

				const repoInput = new TextInputBuilder()
					.setCustomId('repo_name')
					.setLabel('Repositório (ex: user/repo)')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('user/repo')
					.setRequired(true);

				const tagInput = new TextInputBuilder()
					.setCustomId('release_tag')
					.setLabel('Tag da Release (ex: v1.2.3)')
					.setStyle(TextInputStyle.Short)
					.setRequired(false);

				const shortDescInput = new TextInputBuilder()
					.setCustomId('short_desc')
					.setLabel('Descrição curta (opcional)')
					.setStyle(TextInputStyle.Short)
					.setRequired(false);

				const bodyInput = new TextInputBuilder()
					.setCustomId('release_body')
					.setLabel('O que há de novo? (detalhes)')
					.setStyle(TextInputStyle.Paragraph)
					.setRequired(true)
					.setPlaceholder('Descreva as mudanças, destaques e instruções...');

				modal.addComponents(
					new ActionRowBuilder().addComponents(repoInput),
					new ActionRowBuilder().addComponents(tagInput),
					new ActionRowBuilder().addComponents(shortDescInput),
					new ActionRowBuilder().addComponents(bodyInput)
				);

				await interaction.showModal(modal);
				return;
			}

		} catch (error) {
			interaction.client.notifyError({
				client: interaction.client,
				user: interaction.user,
				channel: interaction.channel,
				guild: interaction.guild,
				context: `/${this.data.name}`,
				error
			});

			try {
				if (interaction.deferred || interaction.replied) {
					await interaction.editReply({ content: 'Ocorreu um erro ao executar o comando.' });
				} else {
					await interaction.reply({ content: 'Ocorreu um erro ao executar o comando.', flags: MessageFlags.Ephemeral });
				}
			} catch (_) { /* ignore */ }
		}
	},
};