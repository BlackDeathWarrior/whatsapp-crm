/**
 * Per-account beta gate for the Flows feature.
 *
 * The Flows feature ships dark — code lives in main, but no user-facing
 * surface activates until the owner opts in by adding `'flows'` to their
 * `profiles.beta_features` array. The intent is to dogfood the entire
 * loop (build → trigger → tap → advance → handoff) on a single account
 * before exposing it to teammates or downstream pullers of the OSS.
 *
 * Why this lives in its own module:
 *   - Both client (sidebar nav, /flows page gate) and server (webhook
 *     dispatcher, /api/flows route guards) need to call the same logic.
 *     Pulling it into a single import target keeps the truth in one
 *     place — no env vars, no DB query duplication.
 *   - Once Flows reaches GA, removing the gate is grep-and-delete on a
 *     single import path.
 *
 * The function takes a minimal shape (anything with an optional
 * `beta_features` array of strings) rather than the full `Profile`
 * type so it can be called from places that haven't loaded a full
 * profile row — e.g. webhook handlers that only SELECT this one
 * column.
 */

/** Stable string keys for beta features. Add new ones here. */
export const BETA_FEATURE_FLOWS = "flows" as const;

export interface BetaFeatureCarrier {
  beta_features?: string[] | null;
}

/**
 * Returns `true` if the supplied profile (or any compatible shape with
 * a `beta_features` array) has opted into the Flows beta.
 *
 * Safe to call with `null` / `undefined` / a row that predates the
 * migration — every absent value reads as "not opted in".
 */
export function isFlowsEnabled(
  profile: BetaFeatureCarrier | null | undefined,
): boolean {
  if (!profile) return false;
  const features = profile.beta_features;
  if (!features || !Array.isArray(features)) return false;
  return features.includes(BETA_FEATURE_FLOWS);
}
