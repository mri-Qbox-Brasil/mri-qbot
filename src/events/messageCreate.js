const inviteBlocker = require('../commands/blockers/inviteblocker');
const geminiModerator = require('../commands/blockers/geminiModerator');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        await inviteBlocker.onMessageCreate(message);
        await geminiModerator.onMessageCreate(message);
    },
};
