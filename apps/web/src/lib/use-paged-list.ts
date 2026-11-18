"use client";

import { useCallback, useState } from "react";

type State<T> = { items: T[]; cursor: string | null; initial: T[]; key: string; extended: boolean };

/**
 * Cursor-Liste mit serverseitig gerenderter erster Seite.
 *
 * - Neuer Kontext (`resetKey`, z. B. Filter oder Feed-Art) → Liste neu beginnen.
 * - Gleicher Kontext, neue erste Seite (router.refresh nach Melden, Stummschalten, Folgen …) →
 *   erste Seite per id einmischen, bereits nachgeladene Seiten und Cursor bleiben erhalten.
 *   Einträge der alten ersten Seite, die in der neuen fehlen, verschwinden (gelöscht/ausgeblendet).
 */
export function usePagedList<T extends { id: string }>(initial: T[], initialCursor: string | null, resetKey: string) {
  const [state, setState] = useState<State<T>>(() => ({ items: initial, cursor: initialCursor, initial, key: resetKey, extended: false }));

  let current = state;
  if (state.key !== resetKey || (state.initial !== initial && !state.extended)) {
    current = { items: initial, cursor: initialCursor, initial, key: resetKey, extended: false };
    setState(current);
  } else if (state.initial !== initial) {
    const fresh = new Set(initial.map((x) => x.id));
    const oldFirst = new Set(state.initial.map((x) => x.id));
    current = { ...state, initial, items: [...initial, ...state.items.filter((x) => !fresh.has(x.id) && !oldFirst.has(x.id))] };
    setState(current);
  }

  /** Nachgeladene Seite anhängen (ohne Dubletten). */
  const append = useCallback((page: T[], nextCursor: string | null) => {
    setState((s) => {
      const ids = new Set(s.items.map((x) => x.id));
      return { ...s, items: [...s.items, ...page.filter((x) => !ids.has(x.id))], cursor: nextCursor, extended: true };
    });
  }, []);

  /** Ganze Liste ersetzen (z. B. nachdem alles nachgeladen wurde). */
  const replace = useCallback((items: T[], cursor: string | null) => {
    setState((s) => ({ ...s, items, cursor, extended: true }));
  }, []);

  return { items: current.items, cursor: current.cursor, append, replace };
}
