export function AppleButton() {
  return (
    <a
      href="/api/auth/apple"
      className="flex h-12 w-full items-center justify-center gap-3 bg-ink text-[15px] font-semibold text-paper hover:bg-ink-2 rounded-xl"
    >
      <svg width="16" height="19" viewBox="0 0 16 19" aria-hidden fill="currentColor">
        <path d="M13.2 10.1c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.8C3.6 4.8 2.1 5.7 1.3 7.2c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.6-1-2.7-4.1zM10.8 3c.6-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z" />
      </svg>
      Mit Apple fortfahren
    </a>
  );
}
