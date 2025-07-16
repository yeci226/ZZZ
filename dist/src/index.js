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
exports.commands = exports.cluster = exports.database = exports.client = void 0;
exports.load = load;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const discord_js_1 = require("discord.js");
const discord_hybrid_sharding_1 = require("discord-hybrid-sharding");
const quick_db_1 = require("quick.db");
// Utilities
const logger_1 = __importDefault(require("@/utilities/core/logger"));
const utilities_1 = require("@/utilities");
console.log(process.env.NODE_ENV === 'dev' ? process.env.TEST_TOKEN : process.env.TOKEN);
/**
 * @description Discord 客戶端
 */
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMessages],
    partials: [discord_js_1.Partials.Channel, discord_js_1.Partials.Message, discord_js_1.Partials.User, discord_js_1.Partials.GuildMember, discord_js_1.Partials.Reaction],
    allowedMentions: {
        parse: ['users'],
        repliedUser: false,
    },
    shards: (0, discord_hybrid_sharding_1.getInfo)().SHARD_LIST,
    shardCount: (0, discord_hybrid_sharding_1.getInfo)().TOTAL_SHARDS,
});
exports.client = client;
/**
 * @description 集群客戶端
 */
const cluster = new discord_hybrid_sharding_1.ClusterClient(client);
exports.cluster = cluster;
/**
 * @description 資料庫
 */
const database = new quick_db_1.QuickDB();
exports.database = database;
/**
 * @description 指令集合
 */
const commands = {
    slash: new discord_js_1.Collection(),
    message: new discord_js_1.Collection(),
};
exports.commands = commands;
/**
 * @description 獲取訊息指令
 * @param paths - 訊息指令檔案路徑
 * @returns 訊息指令
 */
async function getMessageCommands(paths) {
    const result = [];
    for (let path of paths) {
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
/**
 * @description 獲取斜線指令
 * @param paths - 斜線指令檔案路徑
 * @returns 斜線指令
 */
async function getSlashCommands(paths) {
    const result = [];
    for (let path of paths) {
        const file = (await Promise.resolve(`${`file://${path}`}`).then(s => __importStar(require(s))))?.default;
        if (file.data && file.execute) {
            commands.slash.set(file.data.name, file);
        }
        else {
            new logger_1.default('系統').error(`${path} 處的指令缺少必要的「資料」或「執行」屬性`);
        }
        commands.slash.set(file.name, file);
        if (file.type === discord_js_1.ApplicationCommandType.Message || file.type === discord_js_1.ApplicationCommandType.User) {
            delete file.description;
        }
        result.push(file.data);
    }
    return result;
}
/**
 * @description 綁定事件
 * @param paths - 事件檔案路徑
 */
async function bindEvents(paths) {
    for (let path of paths) {
        await Promise.resolve(`${`file://${path}`}`).then(s => __importStar(require(s)));
    }
}
/**
 * @description 載入指令
 */
async function load() {
    // 訊息指令
    const messageCommandPaths = await (0, utilities_1.getAllFiles)(`${process.cwd()}/src/commands/message`, ['.js', '.ts']);
    const messageCommands = await getMessageCommands(messageCommandPaths);
    // 斜線指令
    const slashCommandPaths = await (0, utilities_1.getAllFiles)(`${process.cwd()}/src/commands/slash`, ['.js', '.ts']);
    const slashCommands = await getSlashCommands(slashCommandPaths);
    // 事件
    const eventPaths = await (0, utilities_1.getAllFiles)(`${process.cwd()}/src/events`, ['.js', '.ts']);
    await bindEvents(eventPaths);
    new logger_1.default('系統').success(`已載入 ${eventPaths.length} 事件、${slashCommands.length} 斜線指令、${messageCommands.length} 訊息指令`);
    client.on('ready', async () => {
        await client.application?.commands.set(slashCommands);
    });
}
client.login(process.env.NODE_ENV === 'dev' ? process.env.TEST_TOKEN : process.env.TOKEN);
load();
