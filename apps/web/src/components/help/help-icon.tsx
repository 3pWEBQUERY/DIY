import { BookOpen, Compass, Hammer, LayoutGrid, Lock, MessageCircle, PenLine, Ruler, Settings2, ShieldCheck, ShoppingBag, Smartphone, Sparkles, Store, UserRound, Users, type LucideIcon } from "lucide-react";
import type { HelpIcon as HelpIconName } from "@/lib/help/content";

const ICONS: Record<HelpIconName, LucideIcon> = {
  user: UserRound,
  settings: Settings2,
  feed: LayoutGrid,
  hammer: Hammer,
  book: BookOpen,
  pen: PenLine,
  users: Users,
  message: MessageCircle,
  compass: Compass,
  ruler: Ruler,
  bag: ShoppingBag,
  store: Store,
  sparkles: Sparkles,
  shield: ShieldCheck,
  phone: Smartphone,
  lock: Lock,
};

export function HelpIcon({ name, size = 18, className }: { name: HelpIconName; size?: number; className?: string }) {
  const I = ICONS[name];
  return <I size={size} aria-hidden className={className} />;
}
