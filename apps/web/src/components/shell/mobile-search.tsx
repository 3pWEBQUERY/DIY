"use client";

import { Search } from "lucide-react";
import { openCommandPalette } from "./command-palette";

export function MobileSearchButton() {
  return (
    <button onClick={openCommandPalette} className="grid size-10 place-items-center" aria-label="Suchen">
      <Search size={20} strokeWidth={1.6} />
    </button>
  );
}
