const { MessageFlags } = require("discord.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const { EmbedColors, createEmbed } = require("../../utils/embedUtils");
const hasPermission = require("../../utils/permissionUtils");

const DEFAULT_MESSAGE =
  "Esta mensagem se trata de uma duvida referente a servidor de fivem QB/QBOX/MRI ou de ajuda em algum script , se sim solicite ajuda no canal {target_channel}, caso considera a mensagem um engano abra um ticket";
const DEFAULT_PROMPT =
  "Esta mensagem foi postada no canal errado? Analise o conteúdo da mensagem e o nome do canal. Responda APENAS 'sim' ou 'não', sem explicações.";
const DEFAULT_TIMEOUT = 10;

/**
 * Normaliza um objeto de configuração que pode estar corrompido
 * Se for uma string JSON, faz parse; se for um objeto com índices numéricos, reconstrói
 */
function normalizeConfig(config) {
  if (!config) return null;

  // Se for string, fazer parse
  if (typeof config === "string") {
    try {
      config = JSON.parse(config);
    } catch (e) {
      console.error(
        "[Gemini Moderator] Erro ao fazer parse da configuração:",
        e
      );
      return null;
    }
  }

  // Se for um objeto com índices numéricos (corrompido), tentar reconstruir
  if (typeof config === "object" && !Array.isArray(config)) {
    const keys = Object.keys(config);
    // Verifica se tem índices numéricos como chaves (indica corrupção)
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      // Tenta reconstruir a string JSON a partir dos caracteres
      try {
        const jsonString = keys
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map((k) => config[k])
          .join("");
        return JSON.parse(jsonString);
      } catch (e) {
        console.error(
          "[Gemini Moderator] Erro ao reconstruir configuração corrompida:",
          e
        );
        return null;
      }
    }
  }

  return config;
}

async function getGeminiModeratorConfig(client, guildId) {
  const Config = client.db.Configuration;
  const config = await Config.getConfig(guildId, "geminiModeratorSettings");
  return normalizeConfig(config);
}

async function setGeminiModeratorConfig(client, guildId, config) {
  const Config = client.db.Configuration;
  // Garantir que estamos salvando um objeto limpo, não corrompido
  // Sequelize JSON type deve lidar com isso automaticamente
  await Config.setConfig(guildId, "geminiModeratorSettings", config);
}

async function updateGeminiModeratorSettings(client, guildId, updates) {
  // Obter configuração atual e normalizar
  let config = await getGeminiModeratorConfig(client, guildId);

  // Se config for null ou inválido, criar objeto padrão
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    config = {
      enabled: false,
      monitoredChannelId: null,
      targetChannelId: null,
      message: DEFAULT_MESSAGE,
      prompt: DEFAULT_PROMPT,
      messageTimeout: DEFAULT_TIMEOUT,
    };
  }

  // Garantir que todas as propriedades esperadas existem
  const defaultConfig = {
    enabled: false,
    monitoredChannelId: null,
    targetChannelId: null,
    message: DEFAULT_MESSAGE,
    prompt: DEFAULT_PROMPT,
    messageTimeout: DEFAULT_TIMEOUT,
  };

  // Mesclar com padrões primeiro, depois com valores existentes, depois com updates
  const updatedConfig = { ...defaultConfig, ...config, ...updates };

  // Garantir que não há propriedades extras indesejadas (como índices numéricos)
  const cleanConfig = {
    enabled: updatedConfig.enabled,
    monitoredChannelId: updatedConfig.monitoredChannelId,
    targetChannelId: updatedConfig.targetChannelId,
    message: updatedConfig.message,
    prompt: updatedConfig.prompt,
    messageTimeout: updatedConfig.messageTimeout,
  };

  await setGeminiModeratorConfig(client, guildId, cleanConfig);
}

function createGeminiModeratorEmbed(description, color, fields = []) {
  return createEmbed({
    title: "Moderador Gemini",
    description,
    color,
    fields,
  });
}

// Subcomando: Habilitar/desabilitar
async function handleEnable(interaction) {
  const isEnabled = interaction.options.getBoolean("habilitar");
  await updateGeminiModeratorSettings(
    interaction.client,
    interaction.guild.id,
    { enabled: isEnabled }
  );
  return createGeminiModeratorEmbed(
    isEnabled
      ? "Moderador Gemini habilitado."
      : "Moderador Gemini desabilitado.",
    EmbedColors.SUCCESS
  );
}

// Subcomando: Definir canal monitorado
async function handleSetChannel(interaction) {
  const channel = interaction.options.getChannel("canal");
  await updateGeminiModeratorSettings(
    interaction.client,
    interaction.guild.id,
    { monitoredChannelId: channel.id }
  );
  return createGeminiModeratorEmbed(
    `Canal monitorado definido para **${channel.name}**.`,
    EmbedColors.SUCCESS
  );
}

// Subcomando: Definir canal de ajuda
async function handleSetTargetChannel(interaction) {
  const channel = interaction.options.getChannel("canal");
  await updateGeminiModeratorSettings(
    interaction.client,
    interaction.guild.id,
    { targetChannelId: channel.id }
  );
  return createGeminiModeratorEmbed(
    `Canal de ajuda definido para **${channel.name}**.`,
    EmbedColors.SUCCESS
  );
}

// Subcomando: Definir mensagem
async function handleSetMessage(interaction) {
  const message = interaction.options.getString("mensagem");
  await updateGeminiModeratorSettings(
    interaction.client,
    interaction.guild.id,
    { message }
  );
  return createGeminiModeratorEmbed(
    "Mensagem de notificação atualizada.",
    EmbedColors.SUCCESS
  );
}

// Subcomando: Definir prompt
async function handleSetPrompt(interaction) {
  const prompt = interaction.options.getString("prompt");
  await updateGeminiModeratorSettings(
    interaction.client,
    interaction.guild.id,
    { prompt }
  );
  return createGeminiModeratorEmbed(
    "Prompt do Gemini atualizado.",
    EmbedColors.SUCCESS
  );
}

// Subcomando: Status
async function handleStatus(interaction) {
  const config = await getGeminiModeratorConfig(
    interaction.client,
    interaction.guild.id
  );

  if (!config || !config.enabled) {
    return createGeminiModeratorEmbed(
      "Moderador Gemini está desabilitado.",
      EmbedColors.INFO
    );
  }

  const fields = [];

  if (config.monitoredChannelId) {
    fields.push({
      name: "Canal Monitorado",
      value: `<#${config.monitoredChannelId}>`,
      inline: true,
    });
  } else {
    fields.push({
      name: "Canal Monitorado",
      value: "Não configurado",
      inline: true,
    });
  }

  if (config.targetChannelId) {
    fields.push({
      name: "Canal de Ajuda",
      value: `<#${config.targetChannelId}>`,
      inline: true,
    });
  } else {
    fields.push({
      name: "Canal de Ajuda",
      value: "Não configurado",
      inline: true,
    });
  }

  fields.push({
    name: "Timeout da Mensagem",
    value: `${config.messageTimeout || DEFAULT_TIMEOUT} segundos`,
    inline: true,
  });

  fields.push({
    name: "Mensagem",
    value: config.message || DEFAULT_MESSAGE,
    inline: false,
  });

  fields.push({
    name: "Prompt",
    value: (config.prompt || DEFAULT_PROMPT).substring(0, 1024),
    inline: false,
  });

  return createGeminiModeratorEmbed(
    "Configuração do Moderador Gemini:",
    EmbedColors.INFO,
    fields
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("geminimoderator")
    .setDescription("Configura o moderador de mensagens usando Gemini AI.")
    .addSubcommand((sub) =>
      sub
        .setName("enable")
        .setDescription("Habilita/desabilita o moderador Gemini.")
        .addBooleanOption((option) =>
          option
            .setName("habilitar")
            .setDescription("Habilitar ou desabilitar o moderador Gemini.")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-channel")
        .setDescription("Define o canal que será monitorado.")
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription("Canal que será monitorado.")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-target-channel")
        .setDescription(
          "Define o canal de ajuda (substitui {target_channel} na mensagem)."
        )
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription(
              "Canal de ajuda onde as mensagens devem ser enviadas."
            )
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-message")
        .setDescription(
          "Define a mensagem enviada ao usuário quando a mensagem for deletada."
        )
        .addStringOption((option) =>
          option
            .setName("mensagem")
            .setDescription(
              "Mensagem personalizada (use {target_channel} para o canal de ajuda)."
            )
            .setRequired(true)
            .setMaxLength(2000)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-prompt")
        .setDescription("Define o prompt usado para a API do Gemini.")
        .addStringOption((option) =>
          option
            .setName("prompt")
            .setDescription("Prompt personalizado para a API do Gemini.")
            .setRequired(true)
            .setMaxLength(1000)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Mostra a configuração atual do moderador Gemini.")
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!(await hasPermission(interaction, "geminimoderator"))) {
      const embed = createGeminiModeratorEmbed(
        "Você não tem permissão para usar este comando.",
        EmbedColors.DANGER
      );
      return interaction.editReply({ embeds: [embed] });
    }

    const subcommand = interaction.options.getSubcommand();
    let embed;

    if (subcommand === "enable") {
      embed = await handleEnable(interaction);
    } else if (subcommand === "set-channel") {
      embed = await handleSetChannel(interaction);
    } else if (subcommand === "set-target-channel") {
      embed = await handleSetTargetChannel(interaction);
    } else if (subcommand === "set-message") {
      embed = await handleSetMessage(interaction);
    } else if (subcommand === "set-prompt") {
      embed = await handleSetPrompt(interaction);
    } else if (subcommand === "status") {
      embed = await handleStatus(interaction);
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
