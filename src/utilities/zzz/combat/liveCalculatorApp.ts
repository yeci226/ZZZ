import express from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { importLiveTeam } from "./liveBuild.js";
import {
  calculateLiveRotation,
  DEFAULT_DAMAGE_CONDITIONS,
  referenceAttacks,
} from "./liveCalculator.js";

/** Local development workbench. No account access, bot login, database writes or production gate changes. */
export function createLiveCalculatorApp(
  snapshot: { team: unknown; fetchedAt?: string },
  htmlPath = resolve("src/assets/combat/live-calculator.html"),
) {
  const team = importLiveTeam(snapshot.team);
  const attacks = Object.fromEntries(
    team.map((a) => [a.id, referenceAttacks(a)]),
  );
  const token = randomBytes(24).toString("hex");
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host ?? "")) {
      res.sendStatus(403);
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    next();
  });
  app.get("/", (_req, res) =>
    res
      .type("html")
      .send(
        readFileSync(htmlPath, "utf8").replace("__CALCULATOR_TOKEN__", token),
      ),
  );
  app.use("/api", (req, res, next) => {
    const supplied = req.get("X-Calculator-Token") ?? "";
    if (
      supplied.length !== token.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
    ) {
      res.sendStatus(403);
      return;
    }
    next();
  });
  app.get("/api/team", (_req, res) =>
    res.json({
      fetchedAt: snapshot.fetchedAt,
      team,
      attacks,
      defaults: DEFAULT_DAMAGE_CONDITIONS,
    }),
  );
  app.post("/api/calculate", express.json({ limit: "64kb" }), (req, res) => {
    try {
      res.json(calculateLiveRotation(team, req.body));
    } catch (error) {
      res
        .status(400)
        .json({
          error: error instanceof Error ? error.message : "Calculation failed",
        });
    }
  });
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(error?.type === "entity.too.large" ? 413 : 400)
        .json({ error: "Invalid calculation request" });
    },
  );
  return app;
}
