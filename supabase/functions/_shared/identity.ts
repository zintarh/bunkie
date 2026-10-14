// Identity provider adapter. The provider is still an open decision (see the architecture page),
// so only the interface and a test double exist. Plug the chosen provider in behind `identity`.

export type NinResult = { found: boolean; dobMatches: boolean; maskedName: string; gender: "female" | "male" | null; ref: string };
export type CheckResult = { passed: boolean; ref: string; reason?: string };

export interface IdentityProvider {
  name: string;
  lookupNin(nin: string, dob: string): Promise<NinResult>;
  liveness(selfiePath: string, userId: string): Promise<CheckResult>;
  callUpLetter(docPath: string, stateCode: string, userId: string): Promise<CheckResult>;
  proofOfAddress(kind: string, value: string, userId: string): Promise<CheckResult>;
  /** NYSC Certificate of National Service, for hosts who served before. Name must match the NIN. */
  dischargeCertificate(docPath: string, certificateNumber: string, userId: string): Promise<CheckResult>;
}

/** Passes everything. Only allowed when ALLOW_TEST_VERIFICATION=true (never in production). */
const testProvider: IdentityProvider = {
  name: "test",
  async lookupNin(nin, dob) {
    // NINs ending in 0 are "male", others "female", so both household paths can be tried.
    return { found: true, dobMatches: dob.length === 10, maskedName: "A****e C. O*****o", gender: nin.endsWith("0") ? "male" : "female", ref: `test-${crypto.randomUUID()}` };
  },
  async liveness() {
    return { passed: true, ref: `test-${crypto.randomUUID()}` };
  },
  async callUpLetter() {
    return { passed: true, ref: `test-${crypto.randomUUID()}` };
  },
  async proofOfAddress() {
    return { passed: true, ref: `test-${crypto.randomUUID()}` };
  },
  async dischargeCertificate() {
    return { passed: true, ref: `test-${crypto.randomUUID()}` };
  },
};

export function identity(): IdentityProvider {
  const chosen = Deno.env.get("IDENTITY_PROVIDER") ?? "test";
  if (chosen === "test") {
    if (Deno.env.get("ALLOW_TEST_VERIFICATION") !== "true") {
      throw new Error("No identity provider is configured. Set IDENTITY_PROVIDER, or ALLOW_TEST_VERIFICATION=true in development.");
    }
    return testProvider;
  }
  throw new Error(`Identity provider "${chosen}" isn't implemented yet.`);
}
