import { readFileSync } from "node:fs";
import { join } from "node:path";

import { shouldLoadCommand } from "../src/utilities/getAllFiles.js";

describe("development-only command loading", () => {
  it("keeps development commands out of production", () => {
    expect(shouldLoadCommand({ developmentOnly: true }, "production")).toBe(
      false,
    );
    expect(shouldLoadCommand({ developmentOnly: true }, undefined)).toBe(false);
    expect(shouldLoadCommand({ developmentOnly: true }, "dev")).toBe(true);
  });

  it("loads the actual Mystery Maze command in production", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "commands", "slash", "zzz", "mysterymaze.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/developmentOnly:\s*true/);
    expect(shouldLoadCommand({}, "production")).toBe(true);
    expect(shouldLoadCommand({}, "dev")).toBe(true);
  });

  it("loads normal commands in every environment", () => {
    expect(shouldLoadCommand({}, "production")).toBe(true);
  });
});

describe("commands moved to settings", () => {
  it.each(["automimo", "reminder", "locale"])("never registers a stale compiled %s module", name => {
    for (const env of ["dev", "production", undefined]) {
      expect(shouldLoadCommand({ data: { name } }, env)).toBe(false);
    }
  });
  it.each(["settings", "daily", "codes"])("continues registering %s", name => {
    expect(shouldLoadCommand({ data: { name } }, "production")).toBe(true);
  });
});

describe("interknot wiring", () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), "src", ...p), "utf8");
  it("keeps /interknot development-only until launch", () => {
    expect(read("commands", "slash", "zzz", "interknot.ts")).toMatch(/developmentOnly:\s*true/);
  });
  it.each(["modal.ts", "interactionCreate.ts", "selectMenu.ts"])("generic %s handler leaves ik: interactions alone", (file) => {
    // These handlers ack or reply to everything they do not skip, which would break ik: modals and deferUpdate.
    expect(read("events", file)).toMatch(/startsWith\("ik:"\)/);
  });
  it("both selectMenu.ts listeners leave ik: interactions alone", () => {
    const source = read("events", "selectMenu.ts");
    expect(source.split("client.on(").length - 1).toBe(2);
    expect(source.match(/startsWith\("ik:"\)/g)).toHaveLength(2);
  });
});
