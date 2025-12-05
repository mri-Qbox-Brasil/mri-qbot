const { Events } = require('discord.js');
const announce = require("../commands/utility/announce");

module.exports = {
    name: Events.ChannelDelete,
    execute(channel, client) {
        announce.onChannelDelete(channel, client);
    }
};