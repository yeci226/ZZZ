"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const thumbnails = {
    sob: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png',
    wiggle: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bd/Sticker_Set_1_Billy_wiggle.png/',
    smirk: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/3/37/Sticker_Set_1_Nicole_smirk.png',
};
Object.defineProperties(discord_js_1.EmbedBuilder.prototype, {
    addField: {
        value: function (name, value, inline = false) {
            return this.addFields({
                name,
                value,
                inline,
            });
        },
        enumerable: false,
    },
    setConfig: {
        value: function (color, thumbnail = 'None') {
            if (Object.keys(thumbnails).includes(thumbnail))
                this.setThumbnail(thumbnails[thumbnail]);
            return this.setColor(color ?? '#D3CCC0');
        },
        enumerable: false,
    },
});
