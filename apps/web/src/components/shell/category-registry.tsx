"use client";

import { setCategoryRegistry, type CategoryInfo } from "@werkraum/shared";

/**
 * Überträgt die Kategorie-Overrides (Admin → Kategorien) in den Browser, damit Client-
 * Komponenten (Karten, Auswahlen) dieselben Namen zeigen wie der Server. Wird vor den
 * übrigen Kindern gerendert und setzt die Registry synchron.
 */
export function CategoryRegistrySync({ data }: { data: CategoryInfo[] }) {
  setCategoryRegistry(data);
  return null;
}
