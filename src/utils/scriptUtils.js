const crypto = require('crypto');
const githubUtils = require('./githubUtils');

/**
 * Gera hash MD5 de um conteúdo.
 * @param {string} content 
 * @returns {string} hash
 */
function generateHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Analisa a estrutura de um repositório, identificando arquivos e gerando hashes.
 * @param {string} repoFullName 
 * @returns {Promise<Object>} analysis
 */
async function analyzeRepository(repoFullName) {
    const repoInfo = await githubUtils.getRepoInfo(repoFullName);
    const branch = repoInfo.default_branch;
    const files = await githubUtils.listRepoFiles(repoFullName, branch);

    const analysis = {
        repoName: repoFullName,
        version: repoInfo.pushed_at, // Usando data do último push como versão simples
        files: {},
        protected: [],
        hasFxManifest: false,
        hasConfig: false
    };

    // Heurística para arquivos protegidos e identificação de manifest/config
    for (const file of files) {
        const path = file.path;
        
        // Identificar arquivos principais
        if (path.toLowerCase() === 'fxmanifest.lua') analysis.hasFxManifest = true;
        if (path.toLowerCase().includes('config.lua')) {
            analysis.hasConfig = true;
            analysis.protected.push(path);
        }

        // Adicionar arquivos de configuração comuns ao 'protected'
        if (path.includes('config/') || path.includes('settings/')) {
            analysis.protected.push(path);
        }
    }

    return analysis;
}

/**
 * Gera hashes para todos os arquivos (isso pode ser demorado se houver muitos arquivos).
 * @param {string} repoFullName 
 * @param {Array} fileList - Lista retornada por listRepoFiles
 * @returns {Promise<Object>} map of path -> hash
 */
async function generateAllHashes(repoFullName, fileList) {
    const hashes = {};
    const repoInfo = await githubUtils.getRepoInfo(repoFullName);
    const branch = repoInfo.default_branch;

    // Fazemos em paralelo mas com limite para não estourar a API/memória
    const BATCH_SIZE = 5;
    for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
        const batch = fileList.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (file) => {
            try {
                // Se o arquivo for binary (imagem, etc), o hash do git blob pode ser usado em vez de baixar tudo
                // Mas para consistência com o que o usuário quer (MD5 do conteúdo), baixamos.
                // Na verdade, a API de tree já dá o 'sha' que é o hash git. Poderíamos usar ele.
                // O requisito pede MD5 ou SHA1. Vamos baixar o conteúdo para garantir o MD5 do texto.
                const content = await githubUtils.fetchFileContent(repoFullName, file.path, branch);
                hashes[file.path] = generateHash(content);
            } catch (err) {
                console.error(`Erro ao processar hash de ${file.path}:`, err.message);
            }
        }));
    }

    return hashes;
}

/**
 * Compara snapshot salvo com estado remoto.
 */
function compareSnapshots(localSnapshot, remoteFiles, remoteHashes) {
    const result = {
        unchanged: [],
        modifiedLocal: [], // Arquivo estava no protected do snapshot e mudou no remoto
        modifiedRemote: [], // Arquivo não estava no protected e mudou no remoto
        conflict: [],
        new: [],
        deleted: []
    };

    const localFiles = localSnapshot.files || {};
    const protectedFiles = localSnapshot.protected || [];

    // Check remote files against local
    for (const [path, remoteHash] of Object.entries(remoteHashes)) {
        const localHash = localFiles[path];

        if (!localHash) {
            result.new.push(path);
        } else if (localHash === remoteHash) {
            result.unchanged.push(path);
        } else {
            // Mudou
            if (protectedFiles.includes(path)) {
                result.modifiedLocal.push(path); // É uma "modificação local" protegida
            } else {
                result.modifiedRemote.push(path);
            }
        }
    }

    // Check deleted files
    for (const path of Object.keys(localFiles)) {
        if (!remoteHashes[path]) {
            result.deleted.push(path);
        }
    }

    return result;
}

module.exports = {
    generateHash,
    analyzeRepository,
    generateAllHashes,
    compareSnapshots
};
