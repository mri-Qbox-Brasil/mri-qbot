const cron = require('node-cron');

function checkResources(client, githubToken) {
}

function resourceWorker(client, githubToken, checkPeriod = '*/1 * * * *') {
    cron.schedule(checkPeriod, () => {
        console.log('Verificando resources...');
        checkResources(client, githubToken);
    });
}

module.exports = { resourceWorker };