const axios = require("axios");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemma-3-27b-it:free";
const REQUEST_TIMEOUT = 10000; // 10 segundos

/**
 * Valida se a resposta da API é "sim" ou "não"
 * @param {string} response - Resposta da API
 * @returns {boolean|null} - true se "sim", false se "não", null se não conseguir determinar
 */
function validateResponse(response) {
  if (!response || typeof response !== "string") {
    return null;
  }

  const normalized = response.trim().toLowerCase();

  // Aceita variações de "sim"
  const positiveAnswers = ["sim", "yes", "s", "y"];
  // Aceita variações de "não"
  const negativeAnswers = ["não", "nao", "no", "n"];

  if (
    positiveAnswers.some(
      (answer) => normalized === answer || normalized.startsWith(answer)
    )
  ) {
    return true;
  }

  if (
    negativeAnswers.some(
      (answer) => normalized === answer || normalized.startsWith(answer)
    )
  ) {
    return false;
  }

  return null;
}

/**
 * Extrai a resposta de texto da resposta da API do OpenRouter
 * @param {object} apiResponse - Resposta da API do OpenRouter
 * @returns {string|null} - Texto da resposta ou null se não encontrar
 */
function extractTextFromResponse(apiResponse) {
  try {
    if (apiResponse?.choices && apiResponse.choices.length > 0) {
      const choice = apiResponse.choices[0];
      if (choice?.message?.content) {
        return choice.message.content.trim() || null;
      }
    }
    return null;
  } catch (error) {
    console.error("[OpenRouter API] Erro ao extrair texto da resposta:", error);
    return null;
  }
}

/**
 * Faz uma requisição à API do OpenRouter para verificar se uma mensagem está no canal errado
 * @param {string} apiKey - Chave da API do OpenRouter
 * @param {string} prompt - Prompt para enviar à API
 * @param {string} messageContent - Conteúdo da mensagem a ser analisada
 * @param {string} channelName - Nome do canal onde a mensagem foi enviada
 * @param {string} model - Modelo a ser usado (opcional, usa padrão se não fornecido)
 * @returns {Promise<boolean|null>} - true se deve deletar (resposta "sim"), false se não deve, null em caso de erro
 */
async function checkMessageWithGemini(
  apiKey,
  prompt,
  messageContent,
  channelName,
  model = DEFAULT_MODEL
) {
  if (!apiKey) {
    console.error("[OpenRouter API] AI_TOKEN não configurado");
    return null;
  }

  if (!messageContent || !channelName) {
    console.error(
      "[OpenRouter API] Conteúdo da mensagem ou nome do canal não fornecidos"
    );
    return null;
  }

  // Monta o prompt completo com contexto no formato esperado
  const fullPrompt = `${prompt} Canal : ${channelName} Mensagem: ${messageContent}.`;

  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: model,
        messages: [
          {
            role: "user",
            content: fullPrompt,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: REQUEST_TIMEOUT,
      }
    );

    const responseText = extractTextFromResponse(response.data);
    if (!responseText) {
      console.error("[OpenRouter API] Resposta da API não contém texto válido");
      return null;
    }

    const shouldDelete = validateResponse(responseText);
    if (shouldDelete === null) {
      console.warn(
        `[OpenRouter API] Resposta não é "sim" ou "não": "${responseText.substring(
          0,
          100
        )}"`
      );
      return false; // Se não conseguir determinar, não deleta (seguro)
    }

    return shouldDelete;
  } catch (error) {
    if (error.response) {
      // Erro da API
      const status = error.response.status;
      const data = error.response.data;
      console.error(
        `[OpenRouter API] Erro na API (${status}):`,
        data?.error?.message || JSON.stringify(data).substring(0, 200)
      );
    } else if (error.request) {
      // Timeout ou erro de rede
      console.error(
        "[OpenRouter API] Erro de conexão (timeout ou rede):",
        error.message
      );
    } else {
      // Erro ao configurar a requisição
      console.error(
        "[OpenRouter API] Erro ao fazer requisição:",
        error.message
      );
    }
    return null;
  }
}

module.exports = {
  checkMessageWithGemini,
  validateResponse,
  extractTextFromResponse,
};
