import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIGNUP_METHOD_LABEL, signupMethodOf } from "@/config/signup-methods";
import { SHARE_LOGOS } from "@/components/social/share-logos.data";

const APPLE_PATH =
  "M13.2 10.1c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.8C3.6 4.8 2.1 5.7 1.3 7.2c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.6-1-2.7-4.1zM10.8 3c.6-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z";

/** Kleines Symbol für die Registrierungsart (E-Mail, Apple, Pinterest, Android) mit Tooltip. */
export function SignupMethodIcon({ method, size = 16, withLabel = false, className }: { method: string | null | undefined; size?: number; withLabel?: boolean; className?: string }) {
  const m = signupMethodOf(method);
  const label = m ? SIGNUP_METHOD_LABEL[m] : "Unbekannt";
  const icon =
    m === "APPLE" ? (
      <svg width={size * 0.85} height={size} viewBox="0 0 16 19" fill="currentColor" aria-hidden className="text-ink">
        <path d={APPLE_PATH} />
      </svg>
    ) : m === "PINTEREST" ? (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={SHARE_LOGOS.pinterest.color} aria-hidden>
        <path d={SHARE_LOGOS.pinterest.d} />
      </svg>
    ) : m === "ANDROID" ? (
      // Android-Roboterkopf (vereinfacht)
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="#3DDC84">
        <path d="M3 18a9 9 0 0 1 18 0z" />
        <path d="M6.2 7.2 4.6 4.6M17.8 7.2l1.6-2.6" stroke="#3DDC84" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8.3" cy="13.6" r="1.1" fill="#fff" />
        <circle cx="15.7" cy="13.6" r="1.1" fill="#fff" />
      </svg>
    ) : m === "EMAIL" ? (
      <Mail size={size} className="text-muted" aria-hidden />
    ) : (
      <span className="text-muted" aria-hidden>–</span>
    );
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={`Registriert über ${label}`}>
      {icon}
      {withLabel ? <span>{label}</span> : <span className="sr-only">Registriert über {label}</span>}
    </span>
  );
}
