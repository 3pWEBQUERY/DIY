import {
  Home,
  Compass,
  PenLine,
  Layers,
  Users,
  Store,
  BookOpen,
  MessageSquare,
  Bell,
  CircleUser,
  type LucideIcon,
} from "lucide-react";

/** Hauptnavigation in der Reihenfolge der PRD §6.2. */
export type NavItem = { href: string; label: string; icon: LucideIcon; auth?: boolean; badge?: "messages" | "notifications"; match?: string[]; hint?: string };

export const MAIN_NAV: NavItem[] = [
  { href: "/feed", label: "Startseite", hint: "Dein Feed aus Werkstätten, denen du folgst", icon: Home, match: ["/feed"] },
  { href: "/entdecken", label: "Entdecken", hint: "Trends, Kategorien & Suche", icon: Compass, match: ["/entdecken", "/suche"] },
  { href: "/erstellen", label: "Erstellen", hint: "Beitrag, Projekt, Anleitung oder Produkt", icon: PenLine, auth: true },
  { href: "/projekte", label: "Projekte", hint: "Projekte & Schritt-für-Schritt-Anleitungen", icon: Layers, match: ["/projekte", "/anleitungen"] },
  { href: "/communities", label: "Communities", hint: "Gruppen rund um dein Handwerk", icon: Users, match: ["/communities", "/c/", "/events"] },
  { href: "/markt", label: "Marktplatz", hint: "Material, Werkzeug & Pläne von Makern", icon: Store, match: ["/markt", "/warenkorb", "/kasse"] },
  { href: "/blogs", label: "Blogs", hint: "Längere Texte aus den Werkstätten", icon: BookOpen, match: ["/blogs"] },
  { href: "/nachrichten", label: "Nachrichten", hint: "Direktnachrichten & Anfragen", icon: MessageSquare, auth: true, badge: "messages" },
  { href: "/benachrichtigungen", label: "Benachrichtigungen", hint: "Reaktionen, Follower & Bestellungen", icon: Bell, auth: true, badge: "notifications" },
  { href: "/profil", label: "Profil", hint: "Deine Werkstatt", icon: CircleUser, auth: true, match: ["/u/", "/profil"] },
];

export const MOBILE_NAV = ["/feed", "/entdecken", "/erstellen", "/markt", "/profil"];
