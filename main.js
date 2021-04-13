const {SlashCreator, GatewayServer, SlashCommand} = require("slash-create");
const Eris = require("eris");
const settings = require("data-store")({path: "settings.json"});
const mysql = require("mysql2");
const reload = require("require-reload")(require);
const fs = require("fs");
const _ = require("lodash");
let ready = false;
let build = fs.readFileSync(".git/refs/heads/master").toString().replace("\n", "");
let botLogChannelId = "";
let pool;
let promisePool;
let modules = {};
let memberships = {};
let guildMemberships = {};
let guildSettings = {};

let initialTime = new Date().getTime();

if (Object.keys(settings.get()).length === 0) {
    settings.set("token", "Paste token here");
    settings.set("applicationId", "Paste application ID here");
    settings.set("publicKey", "Paste public key here");
    settings.set("managers", ["Paste manager ID here"]);
    settings.set("prefix", "w!");
    settings.set("mentionAsPrefix", true);
    settings.set("botLogChannelId", "Paste channel ID here");
    settings.set("database", {
        host: "",
        user: "",
        password: "",
        database: "",
        waitForConnections: true,
        connectionLimit: 10
    });
    console.log("[!] 'settings.json' has been generated. Please insert your details accordingly and restart Warden.");
    process.exit(1);
}

if (!settings.get("token") || typeof settings.get("token") !== "string" || settings.get("token") === "Paste token here") {
    settings.set("token", "Paste token here");
    console.log("[!] Unable to start Warden: No bot token provided");
    process.exit(1);
}

if (!settings.get("applicationId") || typeof settings.get("applicationId") !== "string" || settings.get("applicationId") === "Paste application ID here") {
    settings.set("applicationId", "Paste application ID here");
    console.log("[!] Unable to start Warden: No application ID provided");
    process.exit(1);
}

if (!settings.get("publicKey") || typeof settings.get("publicKey") !== "string" || settings.get("publicKey") === "Paste public key here") {
    settings.set("publicKey", "Paste public key here");
    console.log("[!] Unable to start Warden: No public key provided");
    process.exit(1);
}

if (!settings.get("managers") || typeof settings.get("managers") !== "object" || settings.get("managers").length < 1 || settings.get("managers") === ["Paste manager ID here"]) {
    settings.set("managers", ["Paste manager ID here"]);
    console.log("[!] Unable to start Warden: No manager ID provided");
    process.exit(1);
}

if (!settings.get("botLogChannelId") || typeof settings.get("botLogChannelId") !== "string" || settings.get("botLogChannelId") === "Paste channel ID here") {
    settings.set("botLogChannelId", "Paste channel ID here");
    console.log("[!] Invalid bot log channel ID provided, messages won't be sent");
}
else {
    botLogChannelId = settings.get("botLogChannelId");
}

if (!settings.get("database")) {
    settings.set("database", {
        host: "",
        user: "",
        password: "",
        database: "",
        waitForConnections: true,
        connectionLimit: 10
    });
    console.log("[!] Unable to start Warden: No database provided");
    process.exit(1);
}
else {
    pool = mysql.createPool(settings.get("database"));
    promisePool = pool.promise();
    promisePool.query("SELECT 1")
        .then(() => {
            console.log("[✓] Successfully established connection to database");
        })
        .catch(err => {
            console.log("[!] Unable to start Warden: Invalid database provided (detailed error below)");
            console.log(err);
            process.exit(1);
        });
    databaseSync().then(() => {
        settings.get("managers").forEach(managerId => {
            if (!(managerId in memberships) || (managerId in memberships && memberships[managerId]["manager"] === 0)) {
                console.log(`[!] Manager ID '${managerId}' is present in the settings file but not a manager in the database`);
            }
        });
        Object.keys(memberships).filter(memberId => memberships[memberId]["manager"] === 1).forEach(memberId => {
            if (!settings.get("managers").includes(memberships[memberId]["userid"])) {
                console.log(`[!] Manager ID '${memberId}' is present in the database but not a manager in the settings file`);
            }
        });
    });
}

if (!settings.get("prefix")) {
    settings.set("prefix", "w!");
    console.log("[!] Defaulted Warden's prefix to 'w!'");
}

if (!settings.get("mentionAsPrefix") || typeof settings.get("mentionAsPrefix") !== "boolean") {
    settings.set("mentionAsPrefix", true);
    console.log("[!] Enabled Mention As Prefix by default");
}

console.log("[^] Loading modules...");
try {
    let files = fs.readdirSync("modules", {withFileTypes: true});
    files.forEach((f, i) => {
        if (!f.isDirectory()) {
            console.log(`[!] Unable to start Warden: Non-folder (${f.name}) in modules folder`);
            process.exit(1);
        }
        if (f.name.includes(" ")) {
            console.log(`[!] Unable to start Warden: Module name contains space (${f.name})`);
            process.exit(1);
        }
        console.log(`[^] Loading module '${f.name}' (${i+1}/${files.length})`);
        modules[f.name] = {};
        try {
            let subfiles = fs.readdirSync(`modules/${f.name}`, {withFileTypes: true});
            if (subfiles.length === 0) {
                console.log(`[!] No actions found in '${f.name}'`);
            }
            else {
                subfiles.forEach((sf, idx) => {
                    if (!sf.isFile()) {
                        console.log(`[!] Unable to start Warden: Non-file (${sf.name}) in '${f.name}' folder`);
                        process.exit(1);
                    }
                    let split = sf.name.split(".");
                    if (split[split.length - 1] !== "js") {
                        console.log(`[!] Unable to start Warden: Non-JS file (${sf.name}) in '${f.name}' folder`);
                        process.exit(1);
                    }
                    if (sf.name.includes(" ")) {
                        console.log(`[!] Unable to start Warden: Action name contains space (${sf.name.slice(0, -3)})`);
                        process.exit(1);
                    }
                    console.log(`[^] Loading action '${sf.name.slice(0, -3)}' (${idx+1}/${subfiles.length})`);
                    modules[f.name][sf.name.slice(0, -3)] = reload(`./modules/${f.name}/${sf.name}`);
                    console.log(`[✓] Loaded action '${sf.name.slice(0, -3)}' (${idx+1}/${subfiles.length})`);
                });
            }
            subfiles = null;
        }
        catch (err) {
            console.log(`[!] Unable to read module '${f.name}' (detailed error below)`);
            console.log(err);
        }
        console.log(`[✓] Loaded module '${f.name}' (${i+1}/${files.length})`);
    });
}
catch (err) {
    console.log("[!] Unable to start Warden: Could not read modules folder (detailed error below)");
    console.log(err);
    process.exit(1);
}

const bot = new Eris(`Bot ${settings.get("token")}`);

const creator = new SlashCreator({
    applicationID: settings.get("applicationId"),
    publicKey: settings.get("publicKey"),
    token: settings.get("token"),
});
creator.on("commandRun", (cmd, res, ctx) => {
    console.log(`[S] ${!!ctx.guildID ? `${bot.guilds.get(ctx.guildID).name} (${ctx.guildID}) | ` : ""}${ctx.user.username}#${ctx.user.discriminator} (${ctx.user.id}): CMD ${ctx.commandName}, OPT ${JSON.stringify(ctx.options)}`);
});
creator.on("commandError", (cmd, err) => {
    console.log("[!] An error occurred with Slash Commands (commandError) (detailed error below)");
    console.log(err);
});
creator.on("error", err => {
    console.log("[!] An error occurred with Slash Commands (error) (detailed error below)");
    console.log(err);
});

// thanks: https://gist.github.com/flangofas/714f401b63a1c3d84aaa
function msToTime(miliseconds, format) {
    let days, hours, minutes, seconds, total_hours, total_minutes, total_seconds;

    total_seconds = parseInt(Math.floor(miliseconds / 1000));
    total_minutes = parseInt(Math.floor(total_seconds / 60));
    total_hours = parseInt(Math.floor(total_minutes / 60));
    days = parseInt(Math.floor(total_hours / 24));

    seconds = parseInt(total_seconds % 60);
    minutes = parseInt(total_minutes % 60);
    hours = parseInt(total_hours % 24);

    switch(format) {
        case 's':
            return total_seconds;
        case 'm':
            return total_minutes;
        case 'h':
            return total_hours;
        case 'd':
            return days;
        default:
            return { d: days, h: hours, m: minutes, s: seconds };
    }
}
function msToTimeString(msObject) {
    return `${msObject["d"] > 0 ? `${msObject["d"]} day${msObject["d"] === 1 ? "" : "s"}, ` : ""}${msObject["h"] > 0 ? `${msObject["h"]} hr${msObject["h"] === 1 ? "" : "s"}, ` : ""}${msObject["m"] > 0 ? `${msObject["m"]} min${msObject["m"] === 1 ? "" : "s"}, ` : ""}${msObject["s"] > 0 ? `${msObject["s"]} sec${msObject["s"] === 1 ? "" : "s"}, ` : ""}`.slice(0, -2);
}
// thanks: https://stackoverflow.com/a/15762794/13293007
function roundTo(n, digits) {
    let negative = false;
    if (digits === undefined) {digits = 0;}
    if (n < 0) {negative = true; n = n * -1;}
    let multiplicator = Math.pow(10, digits);
    n = parseFloat((n * multiplicator).toFixed(11));
    n = (Math.round(n) / multiplicator).toFixed(digits);
    if (negative) {n = (n * -1).toFixed(digits);}
    if (digits === 0) {n = parseInt(n, 10);}
    return n;
}
function getUserId(cont, types=null, guildId) {
    if (types === null) {
        types = ["mention", "id", "nickname", "username"];
    }
    let userId;
    if (types.includes("mention") && cont.startsWith("<@") && cont.endsWith(">")) {
        userId = cont.replace(/<@!?/, "").replace(/>/, "");
        if (!bot.users.get(userId)) {
            userId = "";
        }
    }
    if (!userId && types.includes("id")) {
        userId = cont;
        if (!bot.users.get(userId)) {
            userId = "";
        }
    }
    if (!userId && types.includes("nickname") && guildId) {
        let guildMember = bot.guilds.get(guildId).members.find(u => u.nick && u.nick.toLowerCase() === cont.toLowerCase());
        if (guildMember) {
            userId = guildMember.id;
        }
    }
    if (!userId && types.includes("username") && guildId) {
        if (cont.includes("#")) {
            let split = cont.split("#");
            let guildMember = bot.guilds.get(guildId).members.find(u => `${u.username}#${u.discriminator}` === `${split[0]}#${split[1]}`);
            if (guildMember) {
                userId = guildMember.id;
            }
        }
        else {
            let guildMember = bot.guilds.get(guildId).members.find(u => u.username.toLowerCase() === cont.toLowerCase());
            if (guildMember) {
                userId = guildMember.id;
            }
        }
    }
    if (!userId) {
        userId = "";
    }
    return userId;
}
function getPermsMatch(userPerms, perms) {
    let permsMissing = [];
    perms.forEach(p => {
        if (!userPerms.has(p)) {
            permsMissing.push(p);
        }
    });
    return permsMissing;
}
async function databaseSync() {
    let m = await promisePool.query("SELECT * FROM `memberships`");
    let g = await promisePool.query("SELECT * FROM `guilds`");
    let s = await promisePool.query("SELECT * FROM `guilds_warden`");
    m[0].forEach(me => {
        memberships[me["userid"]] = me;
    });
    g[0].forEach(gm => {
        guildMemberships[gm["guildid"]] = gm;
    });
    s[0].forEach(gs => {
        guildSettings[gs["guildid"]] = gs;
    });
}
async function slashManagerRejection(ctx) {
    return ctx.send({
        embeds: [
            {
                description: "You need to be a **Manager** to use that.",
                color: 0x2518a0
            }
        ]
    });
}
async function slashPermissionRejection(ctx, permsArray) {
    let target = permsArray.shift();
    return ctx.send({
        embeds: [
            {
                description: `${target === "self" ? "I am" : "You are"} missing permission${permsArray.length !== 1 ? "s" : ""}: ${permsArray.map(r => `**${_.startCase(r)}**`).join(", ")}`,
                color: 0x2518a0
            }
        ]
    });
}

exports.settings = settings;
exports.reload = reload;
exports.build = build;
exports.promisePool = promisePool;
exports.modules = modules;
exports.bot = bot;
exports.msToTime = msToTime;
exports.msToTimeString = msToTimeString;
exports.roundTo = roundTo;
exports.getUserId = getUserId;
exports.getPermsMatch = getPermsMatch;
exports.databaseSync = databaseSync;
exports.slashManagerRejection = slashManagerRejection;
exports.slashPermissionRejection = slashPermissionRejection;

bot.on("ready", () => {
    if (!ready) {
        let timeTaken = (new Date().getTime() - initialTime) / 1000;
        let startupLogs = [];
        startupLogs.push(`[✓] Warden started successfully (took ${timeTaken}s)`);
        startupLogs.push(`[>] Running build: ${build}`);
        if (settings.get("lastBuild") !== build) {
            if (settings.get("lastBuild")) {
                startupLogs.push(`[>] Previous build: ${settings.get("lastBuild")}`);
            }
            settings.set("lastBuild", build);
        }
        startupLogs.push(`[>] Loaded modules: ${Object.keys(modules).length > 0 ? Object.keys(modules).map(moduleName => `${moduleName} (${Object.keys(modules[moduleName]).length})`).join(", ") : "None"}`);
        startupLogs.push(`[>] Logged in to Discord as ${bot.user.username}#${bot.user.discriminator} (${bot.user.id})`);
        startupLogs.push(`[>] Connected to ${bot.guilds.size} guild${bot.guilds.size === 1 ? "" : "s"}`);
        startupLogs.push(`[>] Invite link: https://discord.com/oauth2/authorize?client_id=${bot.user.id}&scope=bot&permissions=8`);
        console.log(startupLogs.join("\n"));
        if (botLogChannelId !== "") {
            bot.createMessage(botLogChannelId, {
                embed: {
                    description: "```" + startupLogs.join("\n") + "```",
                    color: 0x2518a0
                }
            }).catch(() => {
                botLogChannelId = "";
                console.log("[!] Invalid bot log channel ID provided, messages won't be sent");
            });
        }
        initialTime = null;
        timeTaken = null;
        ready = true;
        bot.options.defaultImageFormat = "png";
        bot.editStatus("dnd", {name: "for suspicious activity", type: 3});

        let slashCommands = [];
        Object.keys(modules).forEach(module => {
            Object.keys(modules[module]).forEach(action => {
                if ("slash" in modules[module][action]) {
                    let slash = class Command extends SlashCommand {
                        constructor(creator) {
                            if (modules[module][action]["slash"].guildOnly) {
                                delete modules[module][action]["slash"].guildOnly;
                                modules[module][action]["slash"].guildIDs = bot.guilds.map(g => g.id);
                            }
                            super(creator, modules[module][action]["slash"]);
                        }
                    }
                    slash.prototype.run = modules[module][action]["slashAction"];
                    slashCommands.push(slash);
                    slash = null;
                }
            });
        });

        creator
            .withServer(new GatewayServer(handler => {
                bot.on("rawWS", event => {
                    if (event.t === "INTERACTION_CREATE") {
                        handler(event.d);
                    }
                });
            }))
            .registerCommands(slashCommands)
            .syncCommands();
    }
});

bot.on("connect", id => {
    console.log(`[^] Shard ${id} connecting...`);
});

bot.on("error", (err, id) => {
    console.log(`[^] Shard ${id} encountered an error (detailed error below)`);
    console.log(err);
});

bot.on("shardDisconnect", (err, id) => {
    console.log(`[^] Shard ${id} disconnected${err ? " (detailed error below)" : ""}`);
    if (err) {
        console.log(err);
    }
});

bot.on("shardPreReady", id => {
    console.log(`[^] Shard ${id} pre-ready`);
});

bot.on("shardReady", id => {
    console.log(`[✓] Shard ${id} ready`);
});

bot.on("shardResume", id => {
    console.log(`[✓] Shard ${id} resumed`);
});

bot.on("messageCreate", msg => {
    let prefix;
    let mention = false;
    let guild = "guild" in msg.channel;
    if (guild && msg.channel.guild.id in guildSettings) {
        prefix = guildSettings[msg.channel.guild.id].prefix;
    }
    else {
        prefix = settings.get("prefix");
    }
    if (settings.get("mentionAsPrefix") && msg.mentions.length > 0 && msg.mentions[0].id === bot.user.id) {
        let firstContent = msg.content.split(" ")[0];
        if ([`<@${bot.user.id}>`, `<@!${bot.user.id}>`].includes(firstContent)) {
            prefix = `${firstContent} `;
            mention = true;
        }
    }
    if (msg.content.startsWith(prefix)) {
        let content = msg.content.replace(prefix, "");
        if (mention) {
            let count = (content.match(/<@!?(\d+)>/g) || []).length;
            if (count === 0)  {
                msg.mentions.splice(0, 1);
            }
        }
        let cmd = content.split(" ")[0].toLowerCase();
        let body = content.split(" ").slice(1).join(" ");
        if (cmd) {
            Object.keys(modules).forEach(module => {
                Object.keys(modules[module]).forEach(action => {
                    if ("commands" in modules[module][action] && modules[module][action]["commands"].includes(cmd) && "action" in modules[module][action] && typeof modules[module][action]["action"] === "function") {
                        let actionFunction = modules[module][action]["action"];
                        let result = actionFunction({prefix: prefix, cmd: cmd, body: body, guild: guild, message: msg, slash: false});
                        console.log(`[C] ${guild ? `${msg.channel.guild.name} (${msg.channel.guild.id}) | ` : ""}${msg.author.username}#${msg.author.discriminator} (${msg.author.id}): ${msg.content}`);
                        switch (result) {
                            case "usage":
                                let resultMessage;
                                if ("usage" in modules[module][action]) {
                                    let usage = modules[module][action]["usage"].replace(/%cmd%/g, cmd).replace(/%mention%/g, msg.author.mention);
                                    resultMessage = `Usage: ${prefix}${usage}`;
                                }
                                else {
                                    resultMessage = "Command execution failed with no reason specified.";
                                }
                                msg.channel.createMessage({
                                    messageReferenceID: msg.id,
                                    embed: {
                                        description: resultMessage,
                                        color: 0x2518a0
                                    }
                                });
                                break;
                            case "manager":
                                msg.channel.createMessage({
                                    messageReferenceID: msg.id,
                                    embed: {
                                        description: "You need to be a **Manager** to use that.",
                                        color: 0x2518a0
                                    }
                                });
                                break;
                            case "guild":
                                msg.channel.createMessage({
                                    messageReferenceID: msg.id,
                                    embed: {
                                        description: "You need to be in a server to use that.",
                                        color: 0x2518a0
                                    }
                                });
                                break;
                            case "user":
                                msg.channel.createMessage({
                                    messageReferenceID: msg.id,
                                    embed: {
                                        description: "You need to be in Direct Messages to use that.",
                                        color: 0x2518a0
                                    }
                                });
                                break;
                            default:
                                if (Array.isArray(result)) {
                                    let target = result.shift();
                                    msg.channel.createMessage({
                                        messageReferenceID: msg.id,
                                        embed: {
                                            description: `${target === "self" ? "I am" : "You are"} missing permission${result.length !== 1 ? "s" : ""}: ${result.map(r => `**${_.startCase(r)}**`).join(", ")}`,
                                            color: 0x2518a0
                                        }
                                    });
                                }
                                break;
                        }
                    }
                });
            });
        }
    }
    else if (msg.content === prefix.trim() && mention) {
        msg.channel.createMessage({
            messageReferenceID: msg.id,
            embed: {
                description: `The prefix in this server is \`${guild && msg.channel.guild.id in guildSettings ? guildSettings[msg.channel.guild.id].prefix : settings.get("prefix")}\`.\nYou may also mention me, following it with a command.`,
                color: 0x2518a0
            }
        });
    }
});

bot.connect();