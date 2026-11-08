import { FeatureGate } from "@/components/feature/feature-gate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag="messages.new" back={{ href: "/nachrichten", label: "Zu deinen Nachrichten" }}>
      {children}
    </FeatureGate>
  );
}
