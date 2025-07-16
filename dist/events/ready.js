"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_schedule_1 = __importDefault(require("node-schedule"));
const discord_js_1 = require("discord.js");
const index_js_1 = require("@/index.js");
const logger_1 = __importDefault(require("@/utilities/core/logger"));
const auto_daily_1 = __importDefault(require("@/utilities/zzz/auto-daily"));
const auto_redeem_1 = __importDefault(require("@/utilities/zzz/auto-redeem"));
const auto_download_icons_1 = __importDefault(require("@/utilities/zzz/auto-download-icons"));
async function updatePresence() {
    const results = await index_js_1.cluster.broadcastEval((c) => c.guilds.cache.size);
    const totalGuilds = results.reduce((prev, val) => prev + val, 0);
    index_js_1.client.user?.setPresence({
        activities: [{ name: `${totalGuilds} 個伺服器`, type: discord_js_1.ActivityType.Watching }],
        status: 'online',
    });
}
index_js_1.client.on(discord_js_1.Events.ClientReady, async () => {
    new logger_1.default('系統').success(`${index_js_1.client.user?.tag} 已經上線！`);
    (0, auto_daily_1.default)();
    (0, auto_redeem_1.default)();
    (0, auto_download_icons_1.default)();
    node_schedule_1.default.scheduleJob('0 * * * *', function () {
        if (index_js_1.cluster.id == 0) {
            (0, auto_daily_1.default)();
            (0, auto_redeem_1.default)();
        }
    });
    node_schedule_1.default.scheduleJob('0 3 * * *', function () {
        if (index_js_1.cluster.id == 0) {
            (0, auto_download_icons_1.default)();
        }
    });
    setInterval(updatePresence, 10000);
});
