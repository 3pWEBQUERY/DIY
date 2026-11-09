import { getSetting } from "@/server/settings";

/**
 * Aktuelle Provision aus den Systemeinstellungen (Admin konfigurierbar) – statt fester Zahlen im Text,
 * damit AGB, Hilfe und Richtlinien nie vom tatsächlich berechneten Satz abweichen.
 */
export async function FeePercent() {
  const feeBps = await getSetting("commerce.feeBps");
  return <>{(feeBps / 100).toLocaleString("de-CH", { maximumFractionDigits: 2 })} %</>;
}
