const axios = require('axios');
require('dotenv').config();

const GITHUB_API_URL = 'https://api.github.com';
const USER_QUERY = 'user:mri-Qbox-Brasil';
const FILENAME_QUERY = 'filename:fxmanifest.lua';
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

let repoCache = null;
let lastFetchTime = 0;

/**
 * Busca repositórios que contém fxmanifest.lua para o usuário mri-Qbox-Brasil.
 * Utiliza cache em memória para evitar rate limits.
 */
async function fetchFxManifestRepos() {
    // Retorna cache válido se existir
    if (repoCache && (Date.now() - lastFetchTime < CACHE_TTL)) {
        return repoCache;
    }

    // Busca por código requer autenticação na API do GitHub
    if (!process.env.GITHUB_TOKEN) {
        console.error('[githubUtils] GITHUB_TOKEN não configurado.');
        throw new Error('GITHUB_TOKEN não configurado. A busca de código requer um token de acesso.');
    }

    try {
        console.log('[githubUtils] Iniciando busca no GitHub. Query:', `${FILENAME_QUERY} ${USER_QUERY}`);

        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${process.env.GITHUB_TOKEN}`
        };

        let allItems = [];
        let page = 1;
        let totalCount = 0;

        do {
            console.log(`[githubUtils] Buscando página ${page}...`);
            const response = await axios.get(`${GITHUB_API_URL}/search/code`, {
                headers,
                params: {
                    q: `${FILENAME_QUERY} ${USER_QUERY} fork:true`,
                    per_page: 100,
                    page: page
                }
            });

            const items = response.data?.items || [];
            if (items.length === 0) break;

            allItems = allItems.concat(items);
            totalCount = response.data.total_count;

            console.log(`[githubUtils] Página ${page}: ${items.length} itens. Total buscado: ${allItems.length}/${totalCount}`);

            if (allItems.length >= totalCount) break;
            page++;

            // Segurança para não abusar da API
            if (page > 10) break;

        } while (true);

        console.log(`[githubUtils] Busca finalizada. Total de arquivos encontrados: ${allItems.length}`);

        if (allItems.length > 0) {
            const repoMap = new Map();

            for (const item of allItems) {
                if (item.repository) {
                    repoMap.set(item.repository.full_name, {
                        name: item.repository.name,
                        full_name: item.repository.full_name,
                        html_url: item.repository.html_url,
                        description: item.repository.description || 'Sem descrição.'
                    });
                }
            }

            repoCache = Array.from(repoMap.values());
            lastFetchTime = Date.now();
            console.log(`[githubUtils] Cache atualizado com ${repoCache.length} repositórios únicos.`);
            return repoCache;
        }

        return [];
    } catch (error) {
        // Em caso de erro, se tivermos um cache (mesmo expirado), é melhor retornar ele do que falhar tudo?
        if (repoCache) {
            console.error('Erro ao buscar GitHub, usando cache antigo:', error.message);
            return repoCache;
        }
        throw error;
    }
}

module.exports = {
    fetchFxManifestRepos
};
