import { ChannelType, PermissionsBitField } from "discord.js";
import { validateNotificationChannelForUser } from "../src/utilities/core/notificationValidation.js";

const F = PermissionsBitField.Flags;

function fakeChannel(userBits: bigint[], botBits: bigint[], type = ChannelType.GuildText) {
  const user = { id: "user" };
  const bot = { id: "bot" };
  return {
    user,
    bot,
    channel: {
      type,
      archived: false,
      locked: false,
      isThread: () => false,
      permissionsFor: (target: any) => new PermissionsBitField(target.id === "bot" ? botBits : userBits),
    } as any,
  };
}

describe("notification channel validation", () => {
  it("requires view/send for the target user and view/send/attach for the bot", () => {
    const valid = fakeChannel(
      [F.ViewChannel, F.SendMessages],
      [F.ViewChannel, F.SendMessages, F.AttachFiles],
    );
    expect(validateNotificationChannelForUser(valid.channel, valid.user as any, valid.bot as any)).toEqual({ ok: true });

    const noAttachment = fakeChannel(
      [F.ViewChannel, F.SendMessages],
      [F.ViewChannel, F.SendMessages],
    );
    expect(validateNotificationChannelForUser(noAttachment.channel, noAttachment.user as any, noAttachment.bot as any))
      .toEqual({ ok: false, reason: "bot_cannot_attach" });
  });

  it("rejects voice channels and archived threads", () => {
    const voice = fakeChannel([], [], ChannelType.GuildVoice);
    expect(validateNotificationChannelForUser(voice.channel, voice.user as any, voice.bot as any).reason).toBe("unsupported");
    const thread = fakeChannel([F.ViewChannel], [F.ViewChannel], ChannelType.PublicThread);
    thread.channel.isThread = () => true;
    thread.channel.archived = true;
    expect(validateNotificationChannelForUser(thread.channel, thread.user as any, thread.bot as any).reason).toBe("unsupported");
  });
});
