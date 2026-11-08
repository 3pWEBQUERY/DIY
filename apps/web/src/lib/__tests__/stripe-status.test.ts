import { describe, expect, it } from "vitest";
import { describeStripeNote } from "../stripe-status";

describe("Stripe-Prüfstatus verständlich", () => {
  it("übersetzt Codes ohne technische Begriffe", () => {
    for (const code of ["under_review", "requirements.past_due", "rejected.fraud", "platform_paused", "listed", "irgendwas_neues"]) {
      const d = describeStripeNote(`Stripe: ${code}`)!;
      expect(d.text).not.toMatch(/[a-z]+_[a-z]+/);
      expect(d.title.length).toBeGreaterThan(3);
    }
    expect(describeStripeNote("Stripe: under_review")).toMatchObject({ title: "Wird geprüft", needsAction: false });
    expect(describeStripeNote("Stripe: 2 Angaben ausstehend")).toMatchObject({ title: "Angaben fehlen noch", needsAction: true });
    expect(describeStripeNote("Stripe: 2 Angaben ausstehend")!.text).toContain("2 Angaben");
    expect(describeStripeNote("Stripe: rejected.other")!.tone).toBe("problem");
    expect(describeStripeNote("Testmodus: Verifizierung simuliert")).toBeNull();
    expect(describeStripeNote(null)).toBeNull();
  });
});
