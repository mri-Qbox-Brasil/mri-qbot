const fs = require('fs');
const path = require('path');

async function loadCommands(client, commandsPath = './src/commands') {
    client.logger.info('Iniciando carregamento de comandos...');
    const commands = [];

    function readFiles(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.resolve(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                readFiles(filePath);
            } else if (file.endsWith('.js')) {
                try {
                    const command = require(filePath);

                    if (!command?.data?.name) {
                        client.logger.warn(`[AVISO] O comando em "${filePath}" não possui um nome definido.`);
                        continue;
                    }

                    client.commands.set(command.data.name, command);
                    commands.push(command.data.toJSON());
                } catch (err) {
                    client.logger.error(`[ERRO] Falha ao carregar o comando em "${filePath}":`, { stack: err?.stack || err });
                }
            }
        }
    }

    readFiles(commandsPath);
    client.logger.info(`Comandos carregados: ${commands.length}`);
    return commands;
}

async function loadEvents(client, eventsPath = './src/events') {
    client.logger.info('Iniciando carregamento de eventos...');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    let loadedCount = 0;
    for (const file of eventFiles) {
        const filePath = path.resolve(eventsPath, file);
        try {
            const event = require(filePath);

            if (!event?.name || typeof event.execute !== 'function') {
                client.logger.warn(`[AVISO] O evento em "${filePath}" está malformado (sem nome ou função execute).`);
                continue;
            }

            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
            }

            loadedCount++;
        } catch (err) {
            client.logger.error(`[ERRO] Falha ao carregar o evento em "${filePath}":`, { stack: err?.stack || err });
        }
    }

    client.logger.info(`Eventos registrados: ${loadedCount}/${eventFiles.length}`);
}

function safeCount(x) {
    if (!x) return 0;
    if (Array.isArray(x)) return x.length;
    if (typeof x.size === 'number') return x.size;
    if (typeof x.length === 'number') return x.length;
    if (typeof x === 'object') return Object.keys(x).length;
    return 0;
}

module.exports = { loadCommands, loadEvents };
