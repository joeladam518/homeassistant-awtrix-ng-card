import { describe, expect, it } from "vitest";

import hacs from "../hacs.json";

// Runs against the built file (npm run build first), the same file Home Assistant loads.
describe("dist bundle", () => {
  it("is the file the Marketplace installs", () => {
    expect(hacs.filename).toBe("awtrix-ng-card.js");
  });

  it("defines the clock card and its editor", async () => {
    // @ts-expect-error -- the built file has no type declarations
    await import("../dist/awtrix-ng-card.js");
    expect(customElements.get("awtrix-ng-card")).toBeDefined();
    expect(customElements.get("awtrix-ng-card-editor")).toBeDefined();
    expect(window.customCards?.map((c) => c.type)).toEqual(["awtrix-ng-card"]);
  });
});
