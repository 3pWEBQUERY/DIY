"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Vorschau-URLs (URL.createObjectURL) mit Aufräumen: Jede URL hält die Datei im Speicher, bis sie
 * freigegeben wird. `create` merkt sich die URL, `revoke` gibt eine frei, beim Aushängen alle.
 */
export function useObjectUrls() {
  const urls = useRef(new Set<string>());
  const create = useCallback((file: Blob) => {
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    return url;
  }, []);
  const revoke = useCallback((url: string | null | undefined) => {
    if (!url || !urls.current.has(url)) return;
    urls.current.delete(url);
    URL.revokeObjectURL(url);
  }, []);
  useEffect(() => {
    const set = urls.current;
    return () => {
      set.forEach((u) => URL.revokeObjectURL(u));
      set.clear();
    };
  }, []);
  return { create, revoke };
}
