import { FeatureGate } from "@/components/feature/feature-gate";

/** Bereich ist an das Feature-Flag „marketplace“ gekoppelt (Admin → System). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag="marketplace" back={{ href: "/feed", label: "Zum Feed" }}>
      {children}
    </FeatureGate>
  );
}
