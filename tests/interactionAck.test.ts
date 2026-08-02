import { replyOrFollowUp } from "../src/utilities/shared/index.js";
import { MessageFlags } from "discord.js";

describe("replyOrFollowUp", () => {
  it("edits the deferred initial reply instead of creating a follow-up", async () => {
    const editReply = jest.fn().mockResolvedValue("edited");
    const followUp = jest.fn().mockResolvedValue("followed-up");
    const interaction = {
      deferred: true,
      replied: false,
      editReply,
      followUp,
      reply: jest.fn(),
    };
    const payload = { content: "error", flags: 64 };

    await expect(replyOrFollowUp(interaction, payload)).resolves.toBe("edited");
    expect(editReply).toHaveBeenCalledWith({ content: "error" });
    expect(followUp).not.toHaveBeenCalled();
  });

  it("uses a follow-up after a deferred interaction already edited its reply", async () => {
    const editReply = jest.fn().mockResolvedValue("edited");
    const followUp = jest.fn().mockResolvedValue("followed-up");
    const interaction = {
      deferred: true,
      replied: true,
      editReply,
      followUp,
      reply: jest.fn(),
    };
    const payload = { content: "second error" };

    await expect(replyOrFollowUp(interaction, payload)).resolves.toBe("followed-up");
    expect(followUp).toHaveBeenCalledWith(payload);
    expect(editReply).not.toHaveBeenCalled();
  });

  it("uses a follow-up only after an interaction already replied", async () => {
    const editReply = jest.fn().mockResolvedValue("edited");
    const followUp = jest.fn().mockResolvedValue("followed-up");
    const interaction = {
      deferred: false,
      replied: true,
      editReply,
      followUp,
      reply: jest.fn(),
    };
    const payload = { content: "error" };

    await expect(replyOrFollowUp(interaction, payload)).resolves.toBe("followed-up");
    expect(followUp).toHaveBeenCalledWith(payload);
    expect(editReply).not.toHaveBeenCalled();
  });

  it("creates the initial reply when the interaction is unacknowledged", async () => {
    const reply = jest.fn().mockResolvedValue("replied");
    const interaction = {
      deferred: false,
      replied: false,
      reply,
      editReply: jest.fn(),
      followUp: jest.fn(),
    };
    const payload = { content: "ok" };

    await expect(replyOrFollowUp(interaction, payload)).resolves.toBe("replied");
    expect(reply).toHaveBeenCalledWith(payload);
  });

  it("removes Ephemeral when editing a deferred reply but preserves Components V2", async () => {
    const editReply = jest.fn().mockResolvedValue("edited");
    const interaction = {
      deferred: true,
      replied: false,
      editReply,
      followUp: jest.fn(),
      reply: jest.fn(),
    };
    const payload = {
      content: "error",
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    };

    await replyOrFollowUp(interaction, payload);

    expect(editReply).toHaveBeenCalledWith({
      content: "error",
      flags: MessageFlags.IsComponentsV2,
    });
  });
});
