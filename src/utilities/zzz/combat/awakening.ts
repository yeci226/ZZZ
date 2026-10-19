import { integer, record } from "./stats.js";

/** The activation flag and the unlocked level are separate in the official response. */
export function importAwakening(raw: unknown): number {
  const c = record(raw);
  const activated =
    c.awaken_state === "AwakenStateActivated" ||
    c.skills?.some((s: any) => s.awaken_state === "AwakenStateActivated");
  if (!activated) return 0;
  return integer(
    c.skill_awaken?.awaken_level,
    "activated awakening level",
    1,
    6,
  );
}

/** Published Burnice awakening II–VI coefficients; level I changes actions only. */
export function burniceAwakening(level: number, initialEnergyRegen: number) {
  integer(level, "awakening level", 0, 6);
  if (!Number.isFinite(initialEnergyRegen) || initialEnergyRegen < 0)
    throw new Error("Invalid initial energy regeneration");
  const units = Math.max(0, initialEnergyRegen - 1.8) * 10;
  const mastery = [0, 0, 1, 1.3, 1.6, 2, 2.5][level];
  const bonus = [0, 0, 1, 1.25, 1.5, 1.75, 2][level];
  return {
    anomalyMastery: Math.min(25, units * mastery),
    damageBonus: Math.min(20, units * bonus),
    afterburnCooldownMs: level >= 2 ? 1350 : 1500,
  };
}
