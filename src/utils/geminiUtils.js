const axios = require('axios');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const REQUEST_TIMEOUT = 10000; // 10 segundos

/**
 * Valida se a resposta da API do Gemini é "sim" ou "não"
 * @param {string} response - Resposta da API
 * @returns {boolean|null} - true se "sim", false se "não", null se não conseguir determinar
 */
function validateResponse(response) {
    if (!response || typeof response !== 'string') {
        return null;
    }

    const normalized = response.trim().toLowerCase();
    
    // Aceita variações de "sim"
    const positiveAnswers = ['sim', 'yes', 's', 'y'];
    // Aceita variações de "não"
    const negativeAnswers = ['não', 'nao', 'no', 'n'];

    if (positiveAnswers.some(answer => normalized === answer || normalized.startsWith(answer))) {
        return true;
    }

    if (negativeAnswers.some(answer => normalized === answer || normalized.startsWith(answer))) {
        return false;
    }

    return null;
}

/**
 * Extrai a resposta de texto da resposta da API do Gemini
 * @param {object} apiResponse - Resposta da API do Gemini
 * @returns {string|null} - Texto da resposta ou null se não encontrar
 */
function extractTextFromResponse(apiResponse) {
    try {
        if (apiResponse?.candidates && apiResponse.candidates.length > 0) {
            const candidate = apiResponse.candidates[0];
            if (candidate?.content?.parts && candidate.content.parts.length > 0) {
                return candidate.content.parts[0].text || null;
            }
        }
        return null;
    } catch (error) {
        console.error('[Gemini API] Erro ao extrair texto da resposta do Gemini:', error);
        return null;
    }
}

/**
 * Faz uma requisição à API do Gemini para verificar se uma mensagem está no canal errado
 * @param {string} apiKey - Chave da API do Gemini
 * @param {string} prompt - Prompt para enviar à API
 * @param {string} messageContent - Conteúdo da mensagem a ser analisada
 * @param {string} channelName - Nome do canal onde a mensagem foi enviada
 * @returns {Promise<boolean|null>} - true se deve deletar (resposta "sim"), false se não deve, null em caso de erro
 */
async function checkMessageWithGemini(apiKey, prompt, messageContent, channelName) {
    if (!apiKey) {
        console.error('[Gemini API] AI_TOKEN não configurado');
        return null;
    }

    if (!messageContent || !channelName) {
        console.error('[Gemini API] Conteúdo da mensagem ou nome do canal não fornecidos');
        return null;
    }

    // Monta o prompt completo com contexto
    const fullPrompt = `${prompt}\n\nCanal: ${channelName}\nMensagem: ${messageContent}\n\nResposta:`;

    try {
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
            {
                contents: [{
                    parts: [{
                        text: fullPrompt
                    }]
                }]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: REQUEST_TIMEOUT
            }
        );

        const responseText = extractTextFromResponse(response.data);
        if (!responseText) {
            console.error('[Gemini API] Resposta da API do Gemini não contém texto válido');
            return null;
        }

        const shouldDelete = validateResponse(responseText);
        if (shouldDelete === null) {
            console.warn(`[Gemini API] Resposta do Gemini não é "sim" ou "não": "${responseText.substring(0, 100)}"`);
            return false; // Se não conseguir determinar, não deleta (seguro)
        }

        return shouldDelete;
    } catch (error) {
        if (error.response) {
            // Erro da API
            const status = error.response.status;
            const data = error.response.data;
            console.error(`[Gemini API] Erro na API do Gemini (${status}):`, data?.error?.message || JSON.stringify(data).substring(0, 200));
        } else if (error.request) {
            // Timeout ou erro de rede
            console.error('[Gemini API] Erro de conexão com a API do Gemini (timeout ou rede):', error.message);
        } else {
            // Erro ao configurar a requisição
            console.error('[Gemini API] Erro ao fazer requisição para Gemini:', error.message);
        }
        return null;
    }
}

module.exports = {
    checkMessageWithGemini,
    validateResponse,
    extractTextFromResponse
};

