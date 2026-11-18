import type { Metadata } from "next";

export const metadata: Metadata = { title: "Passwort vergessen", robots: { index: false, follow: false } };

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
