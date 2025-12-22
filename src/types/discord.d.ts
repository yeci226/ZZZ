import { Collection, EmbedBuilder } from "discord.js";
import { ClusterClient } from "discord-hybrid-sharding";
import { QuickDB } from "quick.db";

declare module "discord.js" {
    export interface Client {
        db: QuickDB;
        cluster: ClusterClient<Client>;
        commands: {
            slash: Collection<string, any>;
            message: Collection<string, any>;
        };
    }

    export interface EmbedBuilder {
        addField(name: string, value: string, inline?: boolean): this;
        setConfig(color?: any, thumbnail?: string): this;
    }
}
