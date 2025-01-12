const inviteBlocker = require('../commands/blockers/inviteblocker');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        await inviteBlocker.onMessageCreate(message);
    },
};
