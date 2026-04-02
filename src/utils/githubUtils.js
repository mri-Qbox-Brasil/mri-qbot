const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const GITHUB_API_URL = 'https://api.github.com';
const USER_QUERY = 'user:mri-Qbox-Brasil';
const FILENAME_QUERY = 'filename:fxmanifest.lua';
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

let repoCache = null;
let lastFetchTime = 0;

/**
 * Helper to get GitHub headers
 */
function getHeaders() {
    if (!process.env.GITHUB_TOKEN) {
        throw new Error('GITHUB_TOKEN não configurado.');
    }
    return {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${process.env.GITHUB_TOKEN}`
    };
}

/**
 * Busca repositórios que contém fxmanifest.lua para o usuário mri-Qbox-Brasil.
 */
async function fetchFxManifestRepos(forceRefresh = false) {
    if (!forceRefresh && repoCache && (Date.now() - lastFetchTime < CACHE_TTL)) {
        return repoCache;
    }

    try {
        const headers = getHeaders();
        let allItems = [];
        let page = 1;
        let totalCount = 0;

        do {
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

            if (allItems.length >= totalCount) break;
            page++;
            if (page > 10) break;
        } while (true);

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
            return repoCache;
        }
        return [];
    } catch (error) {
        if (repoCache) return repoCache;
        throw error;
    }
}

/**
 * Busca informações de um repositório específico.
 */
async function getRepoInfo(repoFullName) {
    const headers = getHeaders();
    try {
        const response = await axios.get(`${GITHUB_API_URL}/repos/${repoFullName}`, { headers });
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            throw new Error(`Repositório não encontrado: ${repoFullName}. Verifique se o nome está correto.`);
        }
        throw error;
    }
}

/**
 * Lista arquivos de um repositório recursivamente usando a API de Trees.
 */
async function listRepoFiles(repoFullName, branch = 'main') {
    const headers = getHeaders();
    // Primeiro pegamos o hash do commit do branch
    let treeSha;
    try {
        const branchRes = await axios.get(`${GITHUB_API_URL}/repos/${repoFullName}/branches/${branch}`, { headers });
        treeSha = branchRes.data.commit.sha;
    } catch (err) {
        // Tenta master se main falhar
        if (branch === 'main') {
            const branchRes = await axios.get(`${GITHUB_API_URL}/repos/${repoFullName}/branches/master`, { headers });
            treeSha = branchRes.data.commit.sha;
        } else {
            throw err;
        }
    }

    // Depois pegamos a árvore recursiva
    const treeRes = await axios.get(`${GITHUB_API_URL}/repos/${repoFullName}/git/trees/${treeSha}?recursive=1`, { headers });
    return treeRes.data.tree.filter(item => item.type === 'blob');
}

/**
 * Busca o conteúdo de um arquivo.
 */
async function fetchFileContent(repoFullName, path, ref = 'main') {
    const headers = getHeaders();
    const response = await axios.get(`${GITHUB_API_URL}/repos/${repoFullName}/contents/${path}?ref=${ref}`, { headers });
    // GitHub retorna base64
    const content = Buffer.from(response.data.content, 'base64').toString('utf8');
    return content;
}

/**
 * Cria um Pull Request.
 */
async function createPullRequest(repoFullName, { title, body, head, base = 'main' }) {
    const headers = getHeaders();
    const response = await axios.post(`${GITHUB_API_URL}/repos/${repoFullName}/pulls`, {
        title,
        body,
        head,
        base
    }, { headers });
    return response.data;
}

/**
 * Envia um arquivo para um novo branch e cria/atualiza o arquivo.
 */
async function commitAndPush(repoFullName, { path: filePath, content, message, branch, baseBranch = 'main' }) {
    const headers = getHeaders();
    
    // 1. Pegar SHA do base branch
    const baseRes = await axios.get(`${GITHUB_API_URL}/repos/${repoFullName}/git/ref/heads/${baseBranch}`, { headers });
    const baseSha = baseRes.data.object.sha;

    // 2. Criar novo branch se não existir
    try {
        await axios.post(`${GITHUB_API_URL}/repos/${repoFullName}/git/refs`, {
            ref: `refs/heads/${branch}`,
            sha: baseSha
        }, { headers });
    } catch (err) {
        // Ignora se o branch já existe
        if (err.response?.status !== 422) throw err;
    }

    // 3. Pegar SHA do arquivo se existir (para atualização)
    let fileSha;
    try {
        const fileRes = await axios.get(`${GITHUB_API_URL}/repos/${repoFullName}/contents/${filePath}?ref=${branch}`, { headers });
        fileSha = fileRes.data.sha;
    } catch (err) {
        // Ignora se o arquivo não existe
    }

    // 4. Criar/Atualizar arquivo
    const putRes = await axios.put(`${GITHUB_API_URL}/repos/${repoFullName}/contents/${filePath}`, {
        message,
        content: Buffer.from(content).toString('base64'),
        branch,
        sha: fileSha
    }, { headers });

    return putRes.data;
}

module.exports = {
    fetchFxManifestRepos,
    getRepoInfo,
    listRepoFiles,
    fetchFileContent,
    createPullRequest,
    commitAndPush
};
