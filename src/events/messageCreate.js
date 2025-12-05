const { Events } = require('discord.js');
const inviteBlocker = require('../commands/blockers/inviteblocker');
const geminiModerator = require('../workers/geminiModerator.js');
const announce = require('../commands/utility/announce.js');

module.exports = {
    name: Events.MessageCreate,
    execute(message, client) {
        client.logger.debug('[messageCreate] Nova mensagem recebida');
        inviteBlocker.onMessageCreate(message);
        geminiModerator.onMessageCreate(message);
        announce.onMessageCreate(message);
    },
};
