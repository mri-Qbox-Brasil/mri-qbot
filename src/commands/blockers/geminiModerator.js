const { checkMessageWithGemini } = require("../../utils/geminiUtils");

const DEFAULT_MESSAGE =
  "Esta mensagem se trata de uma duvida referente a servidor de fivem QB/QBOX/MRI ou de ajuda em algum script , se sim solicite ajuda no canal {target_channel}, caso considera a mensagem um engano abra um ticket";
const DEFAULT_PROMPT =
  'Verifique se a mensagem expressa intenção de ajuda, suporte técnico ou dúvida relacionada a servidores ou desenvolvimento para FiveM, incluindo frameworks como QBOX, QBCore, ESX, VRP, MRI, scripts, assets, configuração ou correção de erros. Somente responda "sim" se a mensagem contiver ao menos um dos seguintes elementos: Pedido de ajuda (ex: como faço?, alguém sabe?, tem como arrumar?) Relato de erro ou problema (ex: erro, bug, não funciona, quebrando, travando) Pergunta técnica sobre scripts, eventos, exports, configs etc. Responda "não" se a mensagem apenas: Menciona algo sobre FiveM sem pedir ajuda Está comemorando, contando, comentando, rindo, ou é conversa comum Não envolve configuração, troubleshooting, tirar duvidaas Formato de resposta: Responda apenas sim ou não. Sem explicações.';
const DEFAULT_TIMEOUT = 10;
const DEFAULT_MODEL = "google/gemma-3-27b-it:free";

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

async function getModel(client, guildId) {
  const config = await getGeminiModeratorConfig(client, guildId);
  return config ? config.model || DEFAULT_MODEL : DEFAULT_MODEL;
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
    let prompt,
      targetChannelId,
      notificationMessage,
      messageTimeout,
      apiKey,
      model;

    try {
      prompt = await getPrompt(message.client, guildId);
      targetChannelId = await getTargetChannelId(message.client, guildId);
      notificationMessage = await getNotificationMessage(
        message.client,
        guildId
      );
      messageTimeout = await getMessageTimeout(message.client, guildId);
      model = await getModel(message.client, guildId);
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
      channelName,
      model
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
