const { checkMessageWithGemini } = require("../../utils/geminiUtils");

const DEFAULT_MESSAGE =
    'Esta mensagem se trata de uma duvida referente a servidor de fivem QB/QBOX/MRI ou de ajuda em algum script?' +
    ' Se sim solicite ajuda em {target_channel}. Caso considere a mensagem um engano abra um ticket';
const DEFAULT_PROMPT = 'Esta mensagem esta relacionada a algum tipo de ajuda com servidor de fivem QB/QBOX/MRI ou de ajuda em algum script?' +
    ' Analise o conteúdo da mensagem e o nome do canal. Responda APENAS \'sim\' ou \'não\', sem explicações.';
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

async function isGeminiModeratorEnabled(client, guildId) {
  const config = await getGeminiModeratorConfig(client, guildId);
  return config ? config.enabled : false;
}

async function getMonitoredChannelId(client, guildId) {
  const config = await getGeminiModeratorConfig(client, guildId);
  return config ? config.monitoredChannelId : null;
}

async function getTargetChannelId(client, guildId) {
  const config = await getGeminiModeratorConfig(client, guildId);
  return config ? config.targetChannelId : null;
}

async function getNotificationMessage(client, guildId) {
  const config = await getGeminiModeratorConfig(client, guildId);
  return config ? config.message || DEFAULT_MESSAGE : DEFAULT_MESSAGE;
}

async function getPrompt(client, guildId) {
  const config = await getGeminiModeratorConfig(client, guildId);
  return config ? config.prompt || DEFAULT_PROMPT : DEFAULT_PROMPT;
}

async function getMessageTimeout(client, guildId) {
  const config = await getGeminiModeratorConfig(client, guildId);
  return config ? config.messageTimeout || DEFAULT_TIMEOUT : DEFAULT_TIMEOUT;
}

/**
 * Valida se o autor da mensagem é um bot
 * @param {Message} message - A mensagem recebida
 * @returns {boolean} - Retorna true se for bot
 */
function validateAuthor(message) {
  return message.author.bot;
}

/**
 * Valida se a mensagem tem conteúdo de texto
 * @param {Message} message - A mensagem recebida
 * @returns {boolean} - Retorna true se tiver conteúdo
 */
function validateMessageContent(message) {
  return message.content && message.content.trim().length > 0;
}

/**
 * Valida se o moderador está habilitado
 * @param {Message} message - A mensagem recebida
 * @returns {Promise<boolean>} - Retorna true se habilitado
 */
async function validateModeratorEnabled(message) {
  if (!message.guild) return false;
  return await isGeminiModeratorEnabled(message.client, message.guild.id);
}

/**
 * Valida se a mensagem está no canal monitorado
 * @param {Message} message - A mensagem recebida
 * @returns {Promise<boolean>} - Retorna true se estiver no canal monitorado
 */
async function validateMonitoredChannel(message) {
  if (!message.guild) return false;
  const monitoredChannelId = await getMonitoredChannelId(
    message.client,
    message.guild.id
  );
  if (!monitoredChannelId) return false;
  return message.channel.id === monitoredChannelId;
}

/**
 * Substitui {target_channel} na mensagem pela menção do canal
 * @param {string} message - Mensagem com placeholder
 * @param {string} channelId - ID do canal
 * @returns {string} - Mensagem com menção do canal
 */
function replaceTargetChannel(message, channelId) {
  return message.replace(/{target_channel}/g, `<#${channelId}>`);
}

/**
 * Envia mensagem de notificação no canal e a remove após timeout se configurado
 * @param {Message} originalMessage - Mensagem original deletada
 * @param {string} notificationMessage - Mensagem de notificação
 * @param {number} timeout - Timeout em segundos (0 = não remove)
 */
async function sendNotificationMessage(
  originalMessage,
  notificationMessage,
  timeout
) {
  try {
    const sentMessage = await originalMessage.channel.send(
      `${originalMessage.author} ${notificationMessage}`
    );

    if (timeout > 0) {
      setTimeout(() => {
        sentMessage.delete().catch((error) => {
          console.error(
            "[Gemini Moderator] Erro ao remover mensagem de notificação:",
            error
          );
        });
      }, timeout * 1000);
    }
  } catch (error) {
    console.error(
      "[Gemini Moderator] Erro ao enviar mensagem de notificação:",
      error
    );
  }
}

/**
 * Handler principal para processar mensagens
 * @param {Message} message - Mensagem recebida
 */
async function onMessageCreate(message) {
  try {
    if (validateAuthor(message)) {
      return;
    }

    if (!validateMessageContent(message)) {
      return;
    }

    if (!message.guild) {
      return;
    }

    if (!(await validateModeratorEnabled(message))) {
      return;
    }

    if (!(await validateMonitoredChannel(message))) {
      return;
    }

    const guildId = message.guild.id;
    let prompt, targetChannelId, notificationMessage, messageTimeout, apiKey;

    try {
      prompt = await getPrompt(message.client, guildId);
      targetChannelId = await getTargetChannelId(message.client, guildId);
      notificationMessage = await getNotificationMessage(
        message.client,
        guildId
      );
      messageTimeout = await getMessageTimeout(message.client, guildId);
      apiKey = process.env.AI_TOKEN;
    } catch (error) {
      console.error(
        `Erro ao obter configurações do Gemini Moderator para o servidor ${guildId}:`,
        error
      );
      return;
    }

    if (!targetChannelId) {
      console.warn(
        `[Gemini Moderator] Canal de ajuda não configurado para o servidor ${guildId}`
      );
      return;
    }

    if (!apiKey) {
      console.error("[Gemini Moderator] AI_TOKEN não configurado no ambiente");
      return;
    }

    const messageContent = message.content.trim();
    const channelName = message.channel.name;

    const shouldDelete = await checkMessageWithGemini(
      apiKey,
      prompt,
      messageContent,
      channelName
    );
    if (shouldDelete === null) {
      console.error(
        `[Gemini Moderator] Erro ao verificar mensagem com Gemini API para o servidor ${guildId}`
      );
      return;
    }

    if (shouldDelete === true) {
      try {
        await message.delete();
        console.log(
          `[Gemini Moderator] Mensagem deletada no servidor ${guildId}, canal ${channelName}, autor ${message.author.id}`
        );
      } catch (error) {
        console.error(
          `[Gemini Moderator] Erro ao deletar mensagem no servidor ${guildId}:`,
          error
        );
        return;
      }

      const finalMessage = replaceTargetChannel(
        notificationMessage,
        targetChannelId
      );

      await sendNotificationMessage(message, finalMessage, messageTimeout);
    }
  } catch (error) {
    console.error(
      "[Gemini Moderator] Erro não tratado no handler de mensagens:",
      error
    );
  }
}

module.exports = {
  onMessageCreate,
};
