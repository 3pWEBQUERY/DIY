import { SHARE_LOGOS } from "@/components/social/share-logos.data";

/** „Mit Pinterest fortfahren“ – Markenfarbe, weisses Logo (Pinterest-Markenrichtlinien). */
export function PinterestButton({ href = "/api/auth/pinterest", label = "Mit Pinterest fortfahren" }: { href?: string; label?: string }) {
  return (
    <a href={href} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl text-[15px] font-semibold text-white hover:opacity-90" style={{ background: SHARE_LOGOS.pinterest.color }}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="currentColor">
        <path d={SHARE_LOGOS.pinterest.d} />
      </svg>
      {label}
    </a>
  );
}
