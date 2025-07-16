"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
exports.default = {
    data: new discord_js_1.ContextMenuCommandBuilder()
        .setName('submit')
        .setNameLocalizations({
        'zh-TW': '提交',
    })
        .setType(discord_js_1.ApplicationCommandType.Message),
    /**
     * @description 提交
     * @param interaction - 交互實例
     * @param locale - 語言
     * @param _args - 參數
     */
    async execute(interaction, locale, ..._args) { },
};
