module.exports.commands = ["ping", "pong"];
module.exports.usage = "%cmd%";
module.exports.description = "Check if Warden is currently available.";
module.exports.action = function (details) {
    if (details["body"] !== "") {
        return "usage";
    }
    details["message"].channel.createMessage({
        messageReference: details["message"].id,
        embed: {
            description: `${details["cmd"] === "ping" ? "Pong" : "Ping"}!${details["guild"] ? ` | ${details["message"].member.guild.shard.latency.toString()}ms` : ""}`,
            color: 0x2518a0
        }
    });
    return true;
}

module.exports.slash = {
    name: "ping",
    description: "Check if Warden is currently available.",
    deferEphemeral: false
};
module.exports.slashAction = async function(ctx) {
    await ctx.defer();
    const bot = require("../../main.js").bot;
    await ctx.send({
        embeds: [
            {
                description: `Pong!${!!ctx.guildID ? ` | ${bot.guilds.get(ctx.guildID).shard.latency.toString()}ms` : ""}`,
                color: 0x2518a0
            }
        ]
    });
}