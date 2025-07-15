"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = exports.cluster = exports.db = exports.client = void 0;
exports.load = load;
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
Object.assign(process.env, dotenv_1.default.parse(fs_1.default.readFileSync('./.env')));
const discord_js_1 = require("discord.js");
const discord_hybrid_sharding_1 = require("discord-hybrid-sharding");
const discord_hybrid_sharding_2 = require("discord-hybrid-sharding");
const quick_db_1 = require("quick.db");
// Utilities
require("@/utilities");
const getAllFiles_1 = __importDefault(require("@/utilities/getAllFiles"));
const logger_1 = __importDefault(require("@/utilities/core/logger"));
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMessages],
    partials: [
        discord_js_1.Partials.Channel,
        discord_js_1.Partials.Message,
        discord_js_1.Partials.User,
        discord_js_1.Partials.GuildMember,
        discord_js_1.Partials.Reaction,
    ],
    allowedMentions: {
        parse: ['users'],
        repliedUser: false,
    },
    shards: (0, discord_hybrid_sharding_1.getInfo)().SHARD_LIST,
    shardCount: (0, discord_hybrid_sharding_1.getInfo)().TOTAL_SHARDS,
});
exports.client = client;
// Client Variables
const db = new quick_db_1.QuickDB();
exports.db = db;
const cluster = new discord_hybrid_sharding_2.ClusterClient(client);
exports.cluster = cluster;
const commands = {
    slash: new discord_js_1.Collection(),
    message: new discord_js_1.Collection(),
};
exports.commands = commands;
async function getMessageCommands(messageCommandPaths) {
    const result = [];
    for (let path of messageCommandPaths) {
        const file = (await Promise.resolve(`${`file://${path}`}`).then(s => __importStar(require(s))))?.default;
        const splitted = path.split('/');
        const folder = splitted[splitted.length - 2];
        if (file.name) {
            const properties = { folder, ...file };
            commands.message.set(file.name, properties);
            result.push(file);
        }
    }
    return result;
}
async function getSlashCommands(slashCommandPaths) {
    const result = [];
    for (let path of slashCommandPaths) {
        const file = (await Promise.resolve(`${`file://${path}`}`).then(s => __importStar(require(s))))?.default;
        if (file.data && file.execute) {
            commands.slash.set(file.data.name, file);
        }
        else {
            new logger_1.default('系統').error(`${path} 處的指令缺少必要的「資料」或「執行」屬性`);
        }
        commands.slash.set(file.name, file);
        if (file.type === discord_js_1.ApplicationCommandType.Message ||
            file.type === discord_js_1.ApplicationCommandType.User) {
            delete file.description;
        }
        result.push(file.data);
    }
    return result;
}
async function bindEvents(eventPaths) {
    for (let eventPath of eventPaths) {
        await Promise.resolve(`${`file://${eventPath}`}`).then(s => __importStar(require(s)));
    }
}
async function load() {
    // Message command
    const messageCommandPaths = await (0, getAllFiles_1.default)(`${process.cwd()}/src/commands/message`, ['.js', '.ts']);
    const messageCommands = await getMessageCommands(messageCommandPaths);
    // Slash command
    const slashCommandPaths = await (0, getAllFiles_1.default)(`${process.cwd()}/src/commands/slash`, ['.js', '.ts']);
    const slashCommands = await getSlashCommands(slashCommandPaths);
    // Event
    const eventPaths = await (0, getAllFiles_1.default)(`${process.cwd()}/src/events`, [
        '.js',
        '.ts',
    ]);
    await bindEvents(eventPaths);
    new logger_1.default('系統').success(`已載入 ${eventPaths.length} 事件、${slashCommands.length} 斜線指令、${messageCommands.length} 訊息指令`);
    client.on('ready', async () => {
        await client.application?.commands.set(slashCommands);
    });
}
client.login(process.env.NODE_ENV === 'dev' ? process.env.TESTOKEN : process.env.TOKEN);
load();
