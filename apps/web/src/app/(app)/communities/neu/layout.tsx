import { FeatureGate } from "@/components/feature/feature-gate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag="communities.create" back={{ href: "/communities", label: "Zu den Communities" }}>
      {children}
    </FeatureGate>
  );
}
