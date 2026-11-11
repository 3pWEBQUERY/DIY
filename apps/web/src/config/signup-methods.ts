/** Wie ein Konto registriert wurde (User.signupMethod) – Anzeige im Admin-Bereich. */
export const SIGNUP_METHODS = ["EMAIL", "APPLE", "PINTEREST", "ANDROID"] as const;
export type SignupMethod = (typeof SIGNUP_METHODS)[number];

export const SIGNUP_METHOD_LABEL: Record<SignupMethod, string> = {
  EMAIL: "E-Mail",
  APPLE: "Apple",
  PINTEREST: "Pinterest",
  // Vorgesehen für die spätere Android-App (Anmeldung mit Google)
  ANDROID: "Android",
};

export function signupMethodOf(v: string | null | undefined): SignupMethod | null {
  return (SIGNUP_METHODS as readonly string[]).includes(v ?? "") ? (v as SignupMethod) : null;
}
