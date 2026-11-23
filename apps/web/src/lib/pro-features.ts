import { BarChart3, CalendarClock, FileText, Film, LayoutTemplate, Mail, MessageSquareLock, Palette, Percent, Printer, Timer, type LucideIcon } from "lucide-react";

/**
 * Funktionen von Creator Pro – eine Liste für die Pro-Seite und alle gesperrten Einstiege.
 * Ohne Pro führen Einstiege nach `/studio/pro?funktion=<key>`; dort steht die Funktion zuerst.
 */
export const PRO_FEATURE_KEYS = ["schaufenster", "medienkit", "statistik", "videos", "provision", "newsletter", "aktionen", "kalender", "kommentare", "profil-design", "pdf-branding"] as const;
export type ProFeatureKey = (typeof PRO_FEATURE_KEYS)[number];

/** Werte aus den Systemeinstellungen, die in den Beschreibungen stehen */
export type ProFeatureValues = {
  featuredMax: number;
  videoProText: string;
  videoStdText: string;
  feeText: string;
  proFeeText: string;
  newsletters: number;
};

export type ProFeature = { key: ProFeatureKey; icon: LucideIcon; title: string; text: string };

export function proFeatures(v: ProFeatureValues): ProFeature[] {
  return [
    { key: "schaufenster", icon: LayoutTemplate, title: "Profil mit Schaufenster", text: `Bis zu ${v.featuredMax} Projekte ganz oben in deinem Profil hervorheben – und das Pro-Kennzeichen neben deinem Namen.` },
    { key: "medienkit", icon: FileText, title: "Medienkit für Kooperationen", text: "Eine Seite mit deinen besten Arbeiten und echten, erklärten Zahlen. Teilbar per Link, druckbar als PDF." },
    { key: "statistik", icon: BarChart3, title: "Statistik über 12 Monate", text: "Verläufe über ein ganzes Jahr statt 12 Wochen – und alle Zahlen als CSV für Excel oder Numbers." },
    { key: "videos", icon: Film, title: "Längere Videos", text: `Videos bis ${v.videoProText} statt ${v.videoStdText}.` },
    { key: "provision", icon: Percent, title: "Tiefere Provision im Shop", text: `${v.proFeeText} statt ${v.feeText} auf den Warenwert jedes Verkaufs.` },
    { key: "newsletter", icon: Mail, title: "Newsletter an deine Follower", text: `Neue Projekte, Anleitungen oder Drops direkt ins Postfach – sofort oder geplant, mit Öffnungen und Klicks. Bis zu ${v.newsletters} Newsletter in 30 Tagen.` },
    { key: "aktionen", icon: Timer, title: "Shop-Aktionen mit Countdown", text: "Zeitlich begrenzte Rabatte auf den ganzen Shop oder ausgewählte Stücke – mit Countdown auf Karten, Produktseite und im Shop, automatisch an und aus." },
    { key: "kalender", icon: CalendarClock, title: "Planen und Inhaltskalender", text: "Projekte und Anleitungen zu einem festen Zeitpunkt veröffentlichen – und alles Geplante und Veröffentlichte im Kalender sehen." },
    { key: "kommentare", icon: MessageSquareLock, title: "Kommentare im Griff", text: "Einen Kommentar oben anheften, Kommentare mit bestimmten Wörtern automatisch ausblenden und Kommentare je Inhalt schliessen." },
    { key: "profil-design", icon: Palette, title: "Eigenes Profil-Design", text: "Akzentfarbe, Titelbild und Reihenfolge der Bereiche selbst wählen – im Web und in der iOS-App." },
    { key: "pdf-branding", icon: Printer, title: "Anleitungs-PDF mit deinem Branding", text: "Druck- und PDF-Version deiner Anleitungen mit deinem Logo, Namen und Link samt QR-Code." },
  ];
}

export function isProFeatureKey(v: unknown): v is ProFeatureKey {
  return typeof v === "string" && (PRO_FEATURE_KEYS as readonly string[]).includes(v);
}

/** Ziel für gesperrte Einstiege: Pro-Seite mit hervorgehobener Funktion */
export function proHref(key: ProFeatureKey) {
  return `/studio/pro?funktion=${key}#funktion-${key}`;
}
