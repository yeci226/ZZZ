import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import { ZenlessZoneZero } from "@yeci226/hoyoapi";
import Queue from "queue";

const drawQueue = new Queue({ autostart: true });

function selectFont(locale: string): string {
  const map: Record<string, string> = {
    "zh-TW": "TW",
    "zh-CN": "CN",
    vi: "VI",
    ja: "JP",
    ko: "KR",
    fr: "FR",
  };
  return map[locale] ?? "EN";
}

function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

interface RelicSet {
  setKey: string;
  name: string;
  count: number;
  iconUrl: string | null;
}

function getRelicSets(relics: any[], ornaments: any[]): RelicSet[] {
  const map = new Map<string, RelicSet>();
  for (const piece of [...relics, ...ornaments]) {
    const k = String(Math.floor(piece.id / 100));
    if (!map.has(k)) {
      map.set(k, {
        setKey: k,
        name: piece.name,
        count: 0,
        iconUrl: piece.icon ?? null,
      });
    }
    map.get(k)!.count++;
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export async function handleTeamDraw(
  interaction: ChatInputCommandInteraction,
  tr: any,
  zzz: ZenlessZoneZero,
  agentIds: string[],
  bangbooId: string | null,
): Promise<void> {
  drawQueue.push(async () => {
    try {
      const locale = (interaction as any).locale ?? "en";
      const font = selectFont(locale);

      // Fetch agent data
      const agents = (
        await Promise.all(
          agentIds.map((id) =>
            zzz.record.character(parseInt(id)).catch(() => null),
          ),
        )
      ).filter(Boolean) as any[];

      if (agents.length === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe76161 as any)
              .setTitle(tr("DrawError") || "Error")
              .setDescription(
                tr("team_NoAgentData") || "Could not retrieve agent data.",
              ),
          ],
        });
        return;
      }

      // Fetch bangboo if needed
      let bangboo: any = null;
      if (bangbooId) {
        try {
          const record = await zzz.record.records();
          bangboo =
            ((record as any).buddy_list as any[]).find(
              (b: any) => String(b.id) === bangbooId,
            ) ?? null;
        } catch {
          // bangboo fetch failed, continue without it
        }
      }

      // Preload images
      const agentImages = await Promise.all(
        agents.map((a: any) =>
          loadImage(a.image || a.icon).catch(() => null),
        ),
      );
      const equipImages = await Promise.all(
        agents.map((a: any) =>
          a.equip?.icon ? loadImage(a.equip.icon).catch(() => null) : null,
        ),
      );
      const bangbooImage = bangboo?.bangboo_rectangle_url
        ? await loadImage(bangboo.bangboo_rectangle_url).catch(() => null)
        : null;

      // Canvas dimensions
      const CARD_WIDTH = 420;
      const CARD_GAP = 20;
      const BANGBOO_W = 220;
      const PAD = 40;
      const CANVAS_W =
        PAD * 2 +
        agents.length * CARD_WIDTH +
        (agents.length - 1) * CARD_GAP +
        (bangboo ? CARD_GAP + BANGBOO_W : 0);
      const CANVAS_H = 900;

      const canvas = createCanvas(CANVAS_W, CANVAS_H);
      const ctx = canvas.getContext("2d");

      // Background
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Draw agent cards
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const agentImg = agentImages[i];
        const equipImg = equipImages[i];
        const cx = PAD + i * (CARD_WIDTH + CARD_GAP);
        const cy = PAD;

        // Card bg
        drawRoundedRect(
          ctx,
          cx,
          cy,
          CARD_WIDTH,
          CANVAS_H - PAD * 2,
          20,
          "rgba(40,40,60,0.95)",
        );

        // Portrait (top 360px, rounded top corners)
        if (agentImg) {
          ctx.save();
          ctx.beginPath();
          (ctx as any).roundRect(cx, cy, CARD_WIDTH, 360, [20, 20, 0, 0]);
          ctx.clip();
          ctx.drawImage(agentImg, cx, cy, CARD_WIDTH, 360);
          ctx.restore();
        }

        // Gradient overlay
        const grad = ctx.createLinearGradient(cx, cy + 240, cx, cy + 360);
        grad.addColorStop(0, "rgba(40,40,60,0)");
        grad.addColorStop(1, "rgba(40,40,60,0.97)");
        ctx.fillStyle = grad;
        ctx.fillRect(cx, cy + 240, CARD_WIDTH, 120);

        // Agent name
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold 26px ${font}`;
        ctx.textAlign = "left";
        const name = (agent as any).name_mi18n ?? agent.name ?? "Unknown";
        ctx.fillText(name, cx + 16, cy + 324);

        // Level + rank
        ctx.fillStyle = "#aaaaaa";
        ctx.font = `18px ${font}`;
        ctx.fillText(`Lv.${agent.level}  ✦${agent.rank}`, cx + 16, cy + 350);

        let y = cy + 382;

        // W-Engine section
        ctx.fillStyle = "#f0c060";
        ctx.font = `bold 17px ${font}`;
        ctx.fillText(tr("team_Equip") || "W-Engine", cx + 16, y);
        y += 22;

        if (agent.equip) {
          if (equipImg) {
            ctx.drawImage(equipImg, cx + 16, y, 44, 44);
          }
          ctx.fillStyle = "#ffffff";
          ctx.font = `15px ${font}`;
          const equipName =
            agent.equip.name.length > 18
              ? agent.equip.name.slice(0, 18) + "…"
              : agent.equip.name;
          ctx.fillText(equipName, cx + 70, y + 15);
          ctx.fillStyle = "#aaaaaa";
          ctx.font = `13px ${font}`;
          ctx.fillText(
            `Lv.${agent.equip.level}  R${agent.equip.star}`,
            cx + 70,
            y + 34,
          );
          y += 58;
        } else {
          ctx.fillStyle = "#666666";
          ctx.font = `14px ${font}`;
          ctx.fillText(tr("team_NoEquip") || "No W-Engine", cx + 16, y + 14);
          y += 28;
        }

        y += 10;

        // Drive Discs section
        ctx.fillStyle = "#80c0ff";
        ctx.font = `bold 17px ${font}`;
        ctx.fillText(tr("team_Relics") || "Drive Discs", cx + 16, y);
        y += 22;

        const sets = getRelicSets(agent.relics ?? [], agent.ornaments ?? []);
        if (sets.length === 0) {
          ctx.fillStyle = "#666666";
          ctx.font = `14px ${font}`;
          ctx.fillText(
            tr("team_NoRelics") || "No Drive Discs",
            cx + 16,
            y + 14,
          );
        } else {
          for (const s of sets.slice(0, 3)) {
            // Try to draw set icon
            if (s.iconUrl) {
              try {
                const setImg = await loadImage(s.iconUrl);
                ctx.drawImage(setImg, cx + 16, y, 32, 32);
              } catch {
                /* skip icon */
              }
            }

            // Piece count badge color
            ctx.fillStyle =
              s.count >= 4
                ? "#f0c060"
                : s.count >= 2
                  ? "#80c0ff"
                  : "#aaaaaa";
            ctx.font = `bold 13px ${font}`;
            ctx.fillText(`${s.count}pc`, cx + 56, y + 12);

            // Set name
            ctx.fillStyle = "#ffffff";
            ctx.font = `13px ${font}`;
            const setName =
              s.name.length > 16 ? s.name.slice(0, 16) + "…" : s.name;
            ctx.fillText(setName, cx + 90, y + 24);
            y += 40;
          }
        }
      }

      // Draw bangboo card
      if (bangboo) {
        const bx = PAD + agents.length * (CARD_WIDTH + CARD_GAP);
        const by = PAD;

        drawRoundedRect(ctx, bx, by, BANGBOO_W, 340, 20, "rgba(40,40,60,0.95)");

        if (bangbooImage) {
          ctx.save();
          ctx.beginPath();
          (ctx as any).roundRect(bx, by, BANGBOO_W, 200, [20, 20, 0, 0]);
          ctx.clip();
          ctx.drawImage(bangbooImage, bx, by, BANGBOO_W, 200);
          ctx.restore();
        }

        ctx.fillStyle = "#ffffff";
        ctx.font = `bold 18px ${font}`;
        ctx.textAlign = "left";
        ctx.fillText(bangboo.name, bx + 12, by + 226);

        ctx.fillStyle = "#aaaaaa";
        ctx.font = `15px ${font}`;
        ctx.fillText(
          `Lv.${bangboo.level ?? "?"}  ★${bangboo.star ?? 1}`,
          bx + 12,
          by + 250,
        );
      }

      // Export
      const buf = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(buf, { name: "team.png" });
      await interaction.editReply({ files: [attachment] });
    } catch (error: any) {
      console.error("[/team] draw error:", error);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe76161 as any)
              .setTitle(tr("DrawError") || "Error")
              .setDescription(`\`${error?.message ?? error}\``),
          ],
        });
      } catch {
        /* ignore reply error */
      }
    }
  });
}
