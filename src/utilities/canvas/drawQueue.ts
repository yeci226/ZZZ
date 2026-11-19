import { EmbedBuilder } from "discord.js";
import Queue from "queue";

/** Max canvases rendered at the same time across every command. */
export const DRAW_CONCURRENCY = 2;
/** A render that takes longer than this frees its slot (it cannot be cancelled, only abandoned). */
export const DRAW_TIMEOUT_MS = 90_000;

type DrawJob = () => Promise<unknown> | unknown;

export function createDrawQueue(
  concurrency = DRAW_CONCURRENCY,
  timeout = DRAW_TIMEOUT_MS,
) {
  const queue = new Queue({ autostart: true, concurrency, timeout });
  const onTimeout = new WeakMap<object, () => unknown>();

  // 'timeout' is dispatched right before the queue calls next() itself, so the
  // slot is always released; we only need to tell the user.
  queue.addEventListener("timeout", (evt: any) => {
    const handler = onTimeout.get(evt.detail.job);
    if (!handler) return;
    try {
      Promise.resolve(handler()).catch(() => {});
    } catch {
      /* ignore */
    }
  });

  return {
    /**
     * Queue a render. The job is wrapped so it can never reject: the `queue`
     * package's default 'error' handler ends the queue and drops every waiting
     * job when one rejects.
     */
    push(job: DrawJob, timeoutHandler?: () => unknown) {
      const wrapped = async () => {
        try {
          await job();
        } catch (error) {
          console.error("[drawQueue] job failed:", error);
        }
      };
      if (timeoutHandler) onTimeout.set(wrapped, timeoutHandler);
      return queue.push(wrapped);
    },
    /**
     * Same meaning as the old unbounded queue's `length` for the
     * "in queue" notice: 1 means "runs now", N means N-1 jobs wait in front.
     */
    get length() {
      return Math.max(1, queue.length - concurrency + 1);
    },
  };
}

/** The one queue every renderer shares. */
export const drawQueue = createDrawQueue();

/** Timeout handler for `drawQueue.push`: show the usual draw-error embed. */
export function drawTimeoutNotifier(interaction: any, tr: any) {
  return async () => {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("#E76161")
          .setTitle(tr("DrawError"))
          .setDescription("`Timeout`")
          .setThumbnail(
            "https://static.wikia.nocookie.net/zenless-zone-zero/images/0/02/Sticker_Set_1_Anby_sob.png",
          ),
      ],
    });
  };
}
