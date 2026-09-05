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
