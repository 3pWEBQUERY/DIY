import "server-only";
import { customerDetailsSchema, customerFullName, type CheckoutInput, type CustomerDetails } from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";

/**
 * Persönliche Angaben für Bestellungen (Vor-/Nachname, Rechnungsadresse, optional Telefon).
 * Einmal erfasst, im Konto gespeichert und bei jeder Bestellung verwendet. Der jeweilige Shop
 * erhält sie mit der Bestellung (Name und Rechnungs-/Lieferadresse) – sonst niemand.
 */

export async function getCustomerDetails(userId: string): Promise<CustomerDetails | null> {
  const d = await db.customerDetails.findUnique({ where: { userId } });
  if (!d) return null;
  return { firstName: d.firstName, lastName: d.lastName, line1: d.line1, line2: d.line2, postalCode: d.postalCode, city: d.city, country: d.country as CustomerDetails["country"], phone: d.phone };
}

export async function saveCustomerDetails(userId: string, input: unknown) {
  const d = customerDetailsSchema.parse(input);
  await db.customerDetails.upsert({ where: { userId }, create: { userId, ...d }, update: d });
  return d;
}

/** Ältere App-Versionen schicken nur eine Lieferadresse mit Namen → in Vor-/Nachname aufteilen. */
function fromLegacyAddress(a: NonNullable<CheckoutInput["address"]>): CustomerDetails {
  const parts = a.name.trim().split(/\s+/);
  if (parts.length < 2) throw fail.invalid("Bitte gib deinen Vor- und Nachnamen an.", { "details.lastName": "Nachname fehlt" });
  return customerDetailsSchema.parse({ firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1), line1: a.line1, line2: a.line2, postalCode: a.postalCode, city: a.city, country: a.country, phone: "" });
}

/**
 * Angaben für eine Bestellung festlegen: neue Eingabe (und speichern), sonst die gespeicherten.
 * Ohne Angaben ist keine Bestellung möglich – der Shop muss wissen, wer bestellt.
 */
export async function resolveOrderParty(userId: string, data: Pick<CheckoutInput, "details" | "saveDetails" | "shipToOther" | "address">) {
  const saved = await getCustomerDetails(userId);
  const details = data.details ?? saved ?? (data.address && !data.shipToOther ? fromLegacyAddress(data.address) : null);
  if (!details) throw fail.invalid("Bitte gib einmal deinen Namen und deine Adresse an – sie werden für künftige Bestellungen gespeichert.", { "details.firstName": "Pflichtfeld" });
  if (!saved || (data.details && data.saveDetails !== false)) await saveCustomerDetails(userId, details);
  const fullName = customerFullName(details);
  const billing = { name: fullName, line1: details.line1, line2: details.line2, postalCode: details.postalCode, city: details.city, country: details.country };
  const shipping = data.shipToOther && data.address ? data.address : billing;
  return {
    shippingAddress: shipping,
    buyerDetails: { firstName: details.firstName, lastName: details.lastName, name: fullName, phone: details.phone, address: billing },
  };
}

/** Käuferangaben einer Bestellung für die Anzeige (ältere Bestellungen: aus der Lieferadresse). */
export function orderBuyer(o: { buyerDetails: unknown; shippingAddress: unknown }) {
  const d = (o.buyerDetails ?? null) as { name?: string; phone?: string; address?: Record<string, string> } | null;
  const ship = (o.shippingAddress ?? {}) as Record<string, string>;
  return { name: d?.name ?? ship.name ?? null, phone: d?.phone || null, billing: d?.address ?? ship, hasDetails: !!d };
}
