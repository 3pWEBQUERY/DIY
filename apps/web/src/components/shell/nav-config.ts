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
export type NavItem = { href: string; label: string; icon: LucideIcon; auth?: boolean; badge?: "messages" | "notifications"; match?: string[] };

export const MAIN_NAV: NavItem[] = [
  { href: "/feed", label: "Startseite", icon: Home, match: ["/feed"] },
  { href: "/entdecken", label: "Entdecken", icon: Compass, match: ["/entdecken", "/suche"] },
  { href: "/erstellen", label: "Erstellen", icon: PenLine, auth: true },
  { href: "/projekte", label: "Projekte", icon: Layers, match: ["/projekte", "/anleitungen"] },
  { href: "/communities", label: "Communities", icon: Users, match: ["/communities", "/c/"] },
  { href: "/markt", label: "Marktplatz", icon: Store, match: ["/markt", "/warenkorb", "/kasse"] },
  { href: "/blogs", label: "Blogs", icon: BookOpen, match: ["/blogs"] },
  { href: "/nachrichten", label: "Nachrichten", icon: MessageSquare, auth: true, badge: "messages" },
  { href: "/benachrichtigungen", label: "Benachrichtigungen", icon: Bell, auth: true, badge: "notifications" },
  { href: "/profil", label: "Profil", icon: CircleUser, auth: true, match: ["/u/", "/profil"] },
];

export const MOBILE_NAV = ["/feed", "/entdecken", "/erstellen", "/markt", "/profil"];
