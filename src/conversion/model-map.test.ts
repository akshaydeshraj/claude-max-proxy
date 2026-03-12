import { describe, it, expect } from "vitest";
import { mapEffort, getAvailableModels } from "./model-map.js";

describe("mapEffort", () => {
  it("maps valid effort values", () => {
    expect(mapEffort("low")).toBe("low");
    expect(mapEffort("medium")).toBe("medium");
    expect(mapEffort("high")).toBe("high");
  });

  it("returns undefined for missing/invalid effort", () => {
    expect(mapEffort(undefined)).toBeUndefined();
    expect(mapEffort("")).toBeUndefined();
    expect(mapEffort("invalid")).toBeUndefined();
  });
});

describe("getAvailableModels", () => {
  it("returns all current models", () => {
    const models = getAvailableModels();
    expect(models).toHaveLength(3);
    expect(models.map((m) => m.id)).toEqual([
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
    ]);
    for (const model of models) {
      expect(model.object).toBe("model");
      expect(model.owned_by).toBe("anthropic");
    }
  });
});
