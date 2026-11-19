/**
 * Arbeitsansichten ohne App-Navigation: Druckfassung (PDF) und Werkstatt-Modus einer Anleitung.
 * Bewusst ohne Seitenleiste, damit nichts vom Inhalt ablenkt – weder auf Papier noch an der Werkbank.
 */
export default function WerkstattLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper print:bg-white">{children}</div>;
}
