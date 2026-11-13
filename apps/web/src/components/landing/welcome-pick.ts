/**
 * Bildwahl für die mobile Startseite: zufällig, aber nie das zuletzt gezeigte Bild; `/?bild=1` … erzwingt eines
 * (zum Prüfen). Setzt `data-show` am Bildrahmen, CSS blendet nur dieses Bild ein.
 *
 * Bewusst ohne Abhängigkeiten und ohne äussere Variablen: Die Funktion wird zusätzlich als Text in ein
 * Inline-Skript geschrieben (`Function.prototype.toString`), damit das Bild schon vor dem Start von React
 * feststeht – und läuft im Browser erneut, falls die Seite per Client-Navigation ohne dieses Skript entsteht.
 */
export function pickWelcomeBackground(el: Element | null, n: number) {
  if (!el || el.getAttribute("data-show")) return;
  var key = "werkuno.welcome.last";
  var forced = Number(new URLSearchParams(window.location.search).get("bild"));
  var last = -1;
  var i;
  try {
    last = Number(window.localStorage.getItem(key) ?? -1);
  } catch (e) {}
  if (forced >= 1 && forced <= n) {
    i = forced - 1;
  } else {
    i = Math.floor(Math.random() * (n - 1));
    if (last >= 0 && last < n && i >= last) i++;
    try {
      window.localStorage.setItem(key, String(i));
    } catch (e) {}
  }
  el.setAttribute("data-show", String(i));
}
