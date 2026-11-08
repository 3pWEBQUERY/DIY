"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function PrintButton({ label = "Als PDF sichern" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("outline", "md")}>
      <Printer size={15} aria-hidden /> {label}
    </button>
  );
}
