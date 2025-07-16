"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const index_1 = require("@/index");
const logger_1 = __importDefault(require("@/utilities/core/logger"));
const webhook = process.env.ERR_WEBHOOK ? new discord_js_1.WebhookClient({ url: process.env.ERR_WEBHOOK }) : null;
index_1.client.on('error', (error) => {
    new logger_1.default('系統').error(`錯誤訊息：${error.message}`);
    if (webhook) {
        webhook.send({
            embeds: [new discord_js_1.EmbedBuilder().setTimestamp().setDescription(`${error.message}`)],
        });
    }
});
index_1.client.on('warn', (error) => {
    new logger_1.default('系統').warn(`警告訊息：${error.message}`);
});
process.on('unhandledRejection', (error) => {
    new logger_1.default('系統').error(`錯誤訊息：${error.message}`);
    if (webhook) {
        webhook.send({
            embeds: [new discord_js_1.EmbedBuilder().setTimestamp().setDescription(`${error.message}`)],
        });
    }
});
process.on('uncaughtException', console.error);
