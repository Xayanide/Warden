module.exports.commands = ["ping", "pong"];
module.exports.usage = "%cmd%";
module.exports.description = "Check if Warden is currently available.";
module.exports.action = function (details) {
    if (details["body"] !== "") {
        return "usage";
    }
    if ("guild" in details["message"].channel) {
        details["message"].channel.createMessage({
            messageReferenceID: details["message"].id,
            embed: {
                description: `${details["cmd"] === "ping" ? "Pong" : "Ping"}! | ${details["message"].member.guild.shard.latency.toString()}ms`,
                color: 0x2518a0
            }
        });
    }
    else {
        details["message"].addReaction("cross:621336829601382421");
    }
    return true;
}

module.exports.slash = {
    name: "ping",
    description: "Check if Warden is currently available."
};
module.exports.slashAction = async function(ctx) {
    await ctx.send({
        embeds: [
            {
                description: `Pong!`,
                color: 0x2518a0
            }
        ]
    });
}