const { execSync } = require('child_process');
const readline = require('readline');

// Utilities
const run = (command) => {
    try {
        return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch (e) {
        return '';
    }
};

const runInherit = (command) => {
    try {
        execSync(command, { stdio: 'inherit' });
        return true;
    } catch (e) {
        return false;
    }
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (question, defaultVal) => {
    return new Promise((resolve) => {
        rl.question(`${question} ${defaultVal ? `(${defaultVal}): ` : ''}`, (answer) => {
            resolve(answer.trim() || defaultVal);
        });
    });
};

const main = async () => {
    console.log('🔄 Atualizando repositório...');

    if (!runInherit('git pull')) {
        console.error('❌ Erro: Falha ao executar git pull. Verifique se há conflitos ou mudanças locais.');
        process.exit(1);
    }

    if (!runInherit('git fetch --all --tags')) {
        console.error('❌ Erro: Falha ao executar git fetch.');
        process.exit(1);
    }

    // 1. Detect Main Branch
    let mainBranch = run('git symbolic-ref refs/remotes/origin/HEAD');
    mainBranch = mainBranch.replace('refs/remotes/origin/', '');

    if (!mainBranch) {
        console.error('❌ Erro: Não foi possível detectar a branch principal.');
        process.exit(1);
    }
    console.log(`✅ Branch principal detectada: ${mainBranch}`);

    // 2. Get Last Tag
    const lastTag = run('git tag --sort=-v:refname').split('\n')[0];

    let nextVersion = 'v1.0.0';
    if (lastTag) {
        console.log(`🏷️  Última versão: ${lastTag}`);
        // Simple semver increment patch
        const match = lastTag.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
        if (match) {
            nextVersion = `v${match[1]}.${match[2]}.${parseInt(match[3]) + 1}`;
        }
    } else {
        console.log('ℹ️  Nenhuma tag encontrada. Sugerindo v1.0.0.');
    }

    console.log(`🔮 Próxima versão sugerida: ${nextVersion}`);

    // 3. Prompt for Version
    const tagVersion = await ask('Digite a versão da tag', nextVersion);

    // 4. Confirmation
    const confirmation = await ask(`Deseja continuar criando a tag ${tagVersion}? (S/N)`, 'N');
    if (!confirmation.toLowerCase().startsWith('s')) {
        console.log('🚫 Operação cancelada pelo usuário.');
        rl.close();
        process.exit(0);
    }

    // 5. Create and Push Tag
    console.log(`🚀 Criando tag ${tagVersion} na branch '${mainBranch}'...`);
    if (!runInherit(`git tag "${tagVersion}" "${mainBranch}"`)) {
        console.error(`❌ Erro: Falha ao criar a tag ${tagVersion}.`);
        process.exit(1);
    }

    console.log(`running push...`);
    if (!runInherit(`git push origin "${tagVersion}"`)) {
        console.error(`❌ Erro: Falha ao enviar a tag ${tagVersion} para o GitHub.`);
        process.exit(1);
    }

    console.log(`✨ Tag ${tagVersion} criada e enviada com sucesso!`);
    rl.close();
};

main();
