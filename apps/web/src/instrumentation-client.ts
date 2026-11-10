import { announceNavigation } from "@/lib/nav-progress";

/** Start jeder App-Router-Navigation (Link, router.push/replace, Zurück/Vor) – für die Ladeleiste. */
export function onRouterTransitionStart(url: string) {
  announceNavigation(url);
}
