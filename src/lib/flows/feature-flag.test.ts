import { describe, it, expect } from "vitest";
import {
  isFlowsEnabled,
  BETA_FEATURE_FLOWS,
} from "./feature-flag";

describe("isFlowsEnabled", () => {
  it("returns false for a null profile", () => {
    expect(isFlowsEnabled(null)).toBe(false);
  });

  it("returns false for an undefined profile", () => {
    expect(isFlowsEnabled(undefined)).toBe(false);
  });

  it("returns false when beta_features is missing", () => {
    expect(isFlowsEnabled({})).toBe(false);
  });

  it("returns false when beta_features is null (pre-migration row)", () => {
    expect(isFlowsEnabled({ beta_features: null })).toBe(false);
  });

  it("returns false for an empty array", () => {
    expect(isFlowsEnabled({ beta_features: [] })).toBe(false);
  });

  it("returns false when only other features are opted in", () => {
    expect(
      isFlowsEnabled({ beta_features: ["ai_replies", "voice_notes"] }),
    ).toBe(false);
  });

  it("returns true when 'flows' is in the array", () => {
    expect(isFlowsEnabled({ beta_features: ["flows"] })).toBe(true);
  });

  it("returns true when 'flows' is in the array alongside others", () => {
    expect(
      isFlowsEnabled({ beta_features: ["ai_replies", "flows", "voice_notes"] }),
    ).toBe(true);
  });

  it("is case-sensitive — only lowercase 'flows' opts in", () => {
    // Belt-and-suspenders: a typo'd 'Flows' or 'FLOWS' must NOT count.
    // This prevents accidental opt-ins from manual SQL edits.
    expect(isFlowsEnabled({ beta_features: ["Flows"] })).toBe(false);
    expect(isFlowsEnabled({ beta_features: ["FLOWS"] })).toBe(false);
  });

  it("guards against non-array values (defensive — DB schema disallows but JSON parsing might)", () => {
    // If something ever feeds the helper a malformed profile (e.g. raw
    // JSON from a webhook payload that bypassed the type system), we'd
    // rather return false than throw mid-request.
    expect(
      isFlowsEnabled({
        // @ts-expect-error — intentional bad input
        beta_features: "flows",
      }),
    ).toBe(false);
    expect(
      isFlowsEnabled({
        // @ts-expect-error — intentional bad input
        beta_features: { flows: true },
      }),
    ).toBe(false);
  });

  it("BETA_FEATURE_FLOWS exports the canonical string", () => {
    // Pinned so callers writing `beta_features.includes('flows')` and
    // callers writing `beta_features.includes(BETA_FEATURE_FLOWS)` can
    // never drift apart.
    expect(BETA_FEATURE_FLOWS).toBe("flows");
    expect(isFlowsEnabled({ beta_features: [BETA_FEATURE_FLOWS] })).toBe(true);
  });
});
