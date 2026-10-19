import { resolveZzzRegion } from "../src/utilities/zzz/region.js";

test.each([
  ["100000001", "prod_gf_us"],
  ["150000001", "prod_gf_eu"],
  ["130000001", "prod_gf_jp"],
  ["170000001", "prod_gf_sg"],
])("resolves legacy ZZZ UID %s to %s", (uid, region) => {
  expect(resolveZzzRegion(uid)).toBe(region);
  expect(resolveZzzRegion(uid, null)).toBe(region);
  expect(resolveZzzRegion(uid, "unknown")).toBe(region);
});

test("uses the official role region when it is available", () => {
  expect(resolveZzzRegion("future-uid", "prod_gf_eu")).toBe("prod_gf_eu");
});

test("never defaults an unknown UID to the Taiwan server", () => {
  expect(() => resolveZzzRegion("500000001")).toThrow();
});
