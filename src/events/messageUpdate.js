const { Events } = require('discord.js');
const geminiModerator = require('../workers/geminiModerator.js');
const announce = require('../commands/utility/announce.js');

module.exports = {
    name: Events.MessageUpdate,
    execute(oldMessage, newMessage, client) {
        client.logger.debug('[messageUpdate] Processando atualização de mensagem');
        geminiModerator.onMessageUpdate(oldMessage, newMessage);
        announce.onMessageUpdate(oldMessage, newMessage);
    },
};
