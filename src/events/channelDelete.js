const announce = require("../commands/utility/announce");

module.exports = {
    name: 'channelDelete',
    once: false,
    async execute(channel, client) {
        await announce.onChannelDelete(channel, client);
    }
};