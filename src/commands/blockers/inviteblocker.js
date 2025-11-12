const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedColors, createEmbed } = require('../../utils/embedUtils');
const hasPermission = require('../../utils/permissionUtils');

async function getBlockerConfig(client, guildId) {
    const Config = client.db.Configuration;
    return await Config.getConfig(guildId, 'inviteBlockerSettings');
}

async function setBlockerConfig(client, guildId, config) {
    const Config = client.db.Configuration;
    await Config.setConfig(guildId, 'inviteBlockerSettings', config);
}

async function isInviteBlockerEnabled(client, guildId) {
    const config = await getBlockerConfig(client, guildId);
    return config ? config.enabled : false;
}

async function getAllowedChannels(client, guildId) {
    const config = await getBlockerConfig(client, guildId);
    return config ? config.allowedChannels || [] : [];
}

async function getAllowedMembers(client, guildId) {
    const config = await getBlockerConfig(client, guildId);
    return config ? config.allowedMembers || [] : [];
}

async function updateInviteBlockerSettings(client, guildId, updates) {
    const config = await getBlockerConfig(client, guildId) || { enabled: false, allowedChannels: [], allowedMembers: [] };
    const updatedConfig = { ...config, ...updates };
    await setBlockerConfig(client, guildId, updatedConfig);
}

// Detecta convites legítimos:
// - discord.gg/<code>
// - discord.com/invite/<code>  (ou discordapp.com/invite/<code>)
// Não corresponde a discord.com/channels/... ou outros caminhos.
const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)[\w-]+(?:\/?\S*)?/i;
const MSG_TIMEOUT = 10;

// Cria embed padrão
function createInviteBlockerEmbed(description, color, fields = []) {
    return createEmbed({
        title: 'Bloqueador de Convites',
        description,
        color,
        fields,
    });
}

// Subcomando: Permitir convites
async function handleAllow(interaction, channel) {
    await updateInviteBlockerSettings(interaction.client, interaction.guild.id, { allowedChannels: [...new Set([...await getAllowedChannels(interaction.client, interaction.guild.id), channel.id])] });
    return createInviteBlockerEmbed(
        `Convites agora são permitidos em **${channel.name}**.`,
        EmbedColors.SUCCESS
    );
}

// Subcomando: Bloquear convites
async function handleProhibit(interaction, channel) {
    await updateInviteBlockerSettings(interaction.client, interaction.guild.id, { allowedChannels: (await getAllowedChannels(interaction.client, interaction.guild.id)).filter(id => id !== channel.id) });
    return createInviteBlockerEmbed(
        `Convites foram bloqueados em **${channel.name}**.`,
        EmbedColors.SUCCESS
    );
}

// Subcomando: Listar canais permitidos
async function handleStatus(interaction) {
    const isEnabled = await isInviteBlockerEnabled(interaction.client, interaction.guild.id);
    if (!isEnabled) {
        return createInviteBlockerEmbed('O bloqueador de convites está desabilitado.', EmbedColors.INFO);
    }

    const allowedChannels = await getAllowedChannels(interaction.client, interaction.guild.id);
    const fields = allowedChannels.map(channelId => ({
        name: `ID: ${channelId}`,
        value: `<#${channelId}>`,
    }));

    return createInviteBlockerEmbed(
        'Lista de canais e categorias com convites permitidos:',
        EmbedColors.INFO,
        fields.length > 0 ? fields : [{ name: 'Nenhum', value: 'Atualmente não há exceções configuradas.' }]
    );
}

// Subcomando: Habilitar/desabilitar bloqueador de convites
async function handleEnable(interaction) {
    const isEnabled = interaction.options.getBoolean('habilitar');
    await updateInviteBlockerSettings(interaction.client, interaction.guild.id, { enabled: isEnabled });
    return createInviteBlockerEmbed(
        isEnabled ? 'Bloqueador de convites habilitado.' : 'Bloqueador de convites desabilitado.',
        EmbedColors.SUCCESS
    );
}

// Comando principal
module.exports = {
    data: new SlashCommandBuilder()
        .setName('inviteblocker')
        .setDescription('Bloqueia o envio de convites no servidor, com exceções configuráveis.')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Permite convites em um canal ou categoria.')
                .addChannelOption(option =>
                    option
                        .setName('canal_categoria')
                        .setDescription('Selecione o canal ou categoria para permitir convites.')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a permissão de convites de um canal ou categoria.')
                .addChannelOption(option =>
                    option
                        .setName('canal_categoria')
                        .setDescription('Selecione o canal ou categoria para bloquear convites.')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Lista os canais ou categorias onde convites são permitidos.')
        )
        .addSubcommand(sub =>
            sub.setName('enable')
                .setDescription('Habilita/desabilita o bloqueador de convites.')
                .addBooleanOption(option =>
                    option
                        .setName('habilitar')
                        .setDescription('Habilitar ou desabilitar o bloqueador de convites.')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!await hasPermission(interaction, 'blockinvites')) {
            const embed = createInviteBlockerEmbed('Você não tem permissão para usar este comando.', EmbedColors.DANGER);
            return interaction.editReply({ embeds: [embed] });
        }

        const subcommand = interaction.options.getSubcommand();
        const channel = interaction.options.getChannel('canal_categoria');
        let embed;

        if (subcommand === 'add') {
            embed = await handleAllow(interaction, channel);
        } else if (subcommand === 'remove') {
            embed = await handleProhibit(interaction, channel);
        } else if (subcommand === 'status') {
            embed = await handleStatus(interaction);
        } else if (subcommand === 'enable') {
            embed = await handleEnable(interaction);
        }

        return interaction.editReply({ embeds: [embed] });
    },


    /**
     * Verifica se um canal ou categoria está permitido.
     * @param {Message} message - A mensagem recebida.
     * @param {Set} allowedChannels - Conjunto de canais e categorias permitidos.
     * @returns {boolean} - Retorna `true` se permitido, caso contrário `false`.
     */
    channelOrCategoryIsAllowed(message, allowedChannels) {
        return (
            allowedChannels.has(message.channel.id) ||
            (message.channel.parentId && allowedChannels.has(message.channel.parentId))
        );
    },

    validateAuthor(message) {
        return message.author.bot && message.author.id === message.client.user.id;
    },

    validateRegex(message, regex) {
        return regex.test(message.content);
    },

    async validadeBlockerEnabled(message) {
        return await isInviteBlockerEnabled(message.client, message.guild.id);
    },

    async validateMember(message) {
        const allowedMembers = new Set(await getAllowedMembers(message.client, message.guild.id));
        return allowedMembers.has(message.author.id);
    },

    async validateChannelOrCategory(message) {
        const allowedChannels = new Set(await getAllowedChannels(message.client, message.guild.id));
        return this.channelOrCategoryIsAllowed(message, allowedChannels);
    },

    async onMessageCreate(message) {

        if (this.validateAuthor(message)) {
            return;
        }

        if (!this.validateRegex(message, inviteRegex)) {
            return;
        }

        if (!await this.validadeBlockerEnabled(message)) {
            return;
        }

        if (await this.validateMember(message)) {
            return;
        }

        if (await this.validateChannelOrCategory(message)) {
            return;
        }

        await message.delete().catch(console.error);
        const futureTimestamp = Math.floor(Date.now() / 1000) + MSG_TIMEOUT;
        const embed = createInviteBlockerEmbed(
            `Convites de servidores não são permitidos neste canal.\nEsta mensagem será removida <t:${futureTimestamp}:R>.`,
            EmbedColors.WARNING
        );
        const warning = await message.channel.send({ embeds: [embed] });
        setTimeout(() => warning.delete().catch(console.error), MSG_TIMEOUT * 1000);
    },
};
