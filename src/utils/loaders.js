const fs = require('fs');
const path = require('path');

async function loadCommands(client, commandsPath = './src/commands') {
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
                        console.warn(`[AVISO] O comando em "${filePath}" não possui um nome definido.`);
                        continue;
                    }

                    client.commands.set(command.data.name, command);
                    commands.push(command.data.toJSON());
                } catch (err) {
                    console.error(`[ERRO] Falha ao carregar o comando em "${filePath}":`, err);
                }
            }
        }
    }

    readFiles(commandsPath);
    return commands;
}

async function loadEvents(client, eventsPath = './src/events') {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    let loadedCount = 0;

    for (const file of eventFiles) {
        const filePath = path.resolve(eventsPath, file);
        try {
            const event = require(filePath);

            if (!event?.name || typeof event.execute !== 'function') {
                console.warn(`[AVISO] O evento em "${filePath}" está malformado (sem nome ou função execute).`);
                continue;
            }

            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
            }

            loadedCount++;
        } catch (err) {
            console.error(`[ERRO] Falha ao carregar o evento em "${filePath}":`, err);
        }
    }

    console.log(`Eventos registrados: ${loadedCount}/${eventFiles.length}`);
}

module.exports = { loadCommands, loadEvents };
