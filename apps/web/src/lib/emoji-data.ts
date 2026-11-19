/**
 * Emoji-Auswahl mit deutschen Suchbegriffen (für den Emoji-Picker). Bewusst kuratiert statt aller
 * ~3700 Unicode-Emojis: die gängigen Gefühle, Gesten und Symbole plus Werkstatt, Natur und Feiern.
 * Dargestellt werden die Emojis des Geräts – auf iPhone, iPad und Mac also die von Apple.
 */

export type EmojiGroup = { id: string; label: string; items: readonly (readonly [emoji: string, keywords: string])[] };

export const EMOJI_GROUPS: readonly EmojiGroup[] = [
  {
    id: "smileys",
    label: "Smileys",
    items: [
      ["😀", "grinsen lachen freude"], ["😃", "lachen freude gross"], ["😄", "lachen augen freude"], ["😁", "strahlen grinsen"],
      ["😆", "lachen zugekniffen"], ["😅", "erleichtert schweiss puh"], ["😂", "tränen lachen lustig"], ["🤣", "kugeln lachen boden"],
      ["🙂", "lächeln leicht"], ["🙃", "kopfüber ironie"], ["😉", "zwinkern"], ["😊", "lächeln rot freundlich"],
      ["😇", "heiligenschein unschuldig engel"], ["🥰", "verliebt herzen"], ["😍", "herzaugen verliebt toll"], ["🤩", "sternaugen begeistert wow"],
      ["😘", "kuss herz"], ["😋", "lecker zunge"], ["😛", "zunge frech"], ["😜", "zwinkern zunge"],
      ["🤪", "verrückt albern"], ["🤗", "umarmung umarmen danke"], ["🤭", "hand mund kichern ups"], ["🤫", "psst leise geheim"],
      ["🤔", "nachdenken überlegen frage"], ["🫡", "salutieren gruss"], ["🤐", "mund zu schweigen"], ["😐", "neutral"],
      ["😑", "ausdruckslos"], ["😶", "sprachlos"], ["🫠", "schmelzen verlegen"], ["😏", "grinsen schelmisch"],
      ["😒", "genervt"], ["🙄", "augenrollen"], ["😬", "grimasse peinlich"], ["😌", "erleichtert zufrieden"],
      ["😔", "nachdenklich traurig"], ["😪", "müde schläfrig"], ["😴", "schlafen müde"], ["😷", "maske krank"],
      ["🤒", "fieber krank"], ["🥵", "heiss hitze"], ["🥶", "kalt frieren"], ["🥴", "beschwipst schwindlig"],
      ["😵‍💫", "schwindlig spirale"], ["🤯", "kopf explodiert unglaublich"], ["🥳", "party feiern geburtstag"], ["😎", "cool sonnenbrille"],
      ["🤓", "streber brille"], ["🧐", "monokel prüfen"], ["😕", "verwirrt"], ["🫤", "skeptisch"],
      ["😟", "besorgt"], ["🙁", "traurig leicht"], ["😮", "staunen offen"], ["😯", "überrascht"],
      ["😲", "erstaunt"], ["🥺", "bitte bettelnd"], ["🥹", "gerührt tränen"], ["😢", "weinen träne traurig"],
      ["😭", "heulen weinen"], ["😱", "schreien schock"], ["😖", "frustriert"], ["😞", "enttäuscht"],
      ["😓", "schweiss enttäuscht"], ["😩", "erschöpft"], ["😫", "müde fertig"], ["😤", "triumph schnauben"],
      ["😡", "wütend rot"], ["😠", "wütend ärger"], ["🤬", "fluchen wütend"], ["😈", "teufel frech"],
      ["💀", "totenkopf"], ["💩", "kacke häufchen"], ["🤡", "clown"], ["👻", "geist halloween"],
      ["👽", "alien ausserirdisch"], ["🤖", "roboter"], ["😺", "katze lachen"], ["😻", "katze verliebt"],
    ],
  },
  {
    id: "gesten",
    label: "Gesten",
    items: [
      ["👋", "winken hallo tschüss"], ["🤚", "hand erhoben"], ["✋", "hand stopp"], ["🖖", "vulkanier gruss"],
      ["👌", "ok perfekt"], ["🤌", "finger italienisch"], ["✌️", "peace sieg"], ["🤞", "daumen drücken glück"],
      ["🫰", "fingerherz"], ["🤟", "liebe dich"], ["🤘", "rock"], ["🤙", "anrufen locker"],
      ["👈", "zeigen links"], ["👉", "zeigen rechts"], ["👆", "zeigen oben"], ["👇", "zeigen unten"],
      ["☝️", "zeigefinger wichtig"], ["👍", "daumen hoch gut ja"], ["👎", "daumen runter nein"], ["✊", "faust"],
      ["👊", "faustschlag"], ["👏", "klatschen applaus bravo"], ["🙌", "hände hoch feiern hurra"], ["🫶", "herzhände liebe"],
      ["👐", "offene hände"], ["🤲", "handflächen bitten"], ["🤝", "handschlag abmachung"], ["🙏", "danke bitte beten"],
      ["✍️", "schreiben"], ["💅", "nagellack"], ["💪", "muskel stark kraft"], ["🫵", "du zeigen"],
      ["👀", "augen schauen"], ["🧠", "gehirn idee"], ["🫂", "umarmen menschen"], ["🗣️", "sprechen"],
    ],
  },
  {
    id: "herzen",
    label: "Herzen & Symbole",
    items: [
      ["❤️", "herz rot liebe"], ["🧡", "herz orange"], ["💛", "herz gelb"], ["💚", "herz grün"],
      ["💙", "herz blau"], ["💜", "herz lila violett"], ["🤎", "herz braun"], ["🖤", "herz schwarz"],
      ["🤍", "herz weiss"], ["🩷", "herz rosa"], ["❤️‍🔥", "herz feuer leidenschaft"], ["❤️‍🩹", "herz heilen"],
      ["💖", "herz glitzer"], ["💗", "herz wachsend"], ["💕", "zwei herzen"], ["💞", "herzen kreisen"],
      ["💯", "hundert perfekt"], ["💥", "knall"], ["💫", "schwindlig stern"], ["💬", "sprechblase kommentar"],
      ["💭", "gedanke"], ["💡", "idee glühbirne tipp"], ["🔥", "feuer heiss trend"], ["✨", "glitzer funkeln neu"],
      ["⭐", "stern"], ["🌟", "stern leuchten"], ["⚡", "blitz schnell"], ["🎯", "ziel volltreffer"],
      ["✅", "haken erledigt ok"], ["☑️", "abgehakt"], ["✔️", "häkchen"], ["❌", "kreuz falsch nein"],
      ["❗", "ausrufezeichen wichtig"], ["❓", "fragezeichen"], ["⚠️", "warnung achtung"], ["🚫", "verboten"],
      ["⛔", "kein zutritt"], ["🔔", "glocke benachrichtigung"], ["📣", "megafon ankündigung"], ["📢", "lautsprecher durchsage"],
      ["🆕", "neu"], ["🆓", "gratis kostenlos"], ["🔝", "top"], ["🔜", "bald soon"],
      ["➡️", "pfeil rechts"], ["⬅️", "pfeil links"], ["⬆️", "pfeil oben"], ["⬇️", "pfeil unten"],
      ["🔄", "aktualisieren wiederholen"], ["➕", "plus"], ["➖", "minus"], ["♻️", "recycling nachhaltig"],
      ["🟢", "grün kreis"], ["🟡", "gelb kreis"], ["🔴", "rot kreis"], ["🔵", "blau kreis"],
    ],
  },
  {
    id: "werkstatt",
    label: "Werkstatt & Dinge",
    items: [
      ["🧶", "wolle garn häkeln stricken"], ["🪡", "nadel faden nähen"], ["🧵", "faden garn nähen"], ["✂️", "schere schneiden"],
      ["🪚", "säge holz"], ["🔨", "hammer"], ["🪛", "schraubenzieher"], ["🔧", "schraubenschlüssel"],
      ["🔩", "schraube mutter"], ["⚙️", "zahnrad einstellungen"], ["🧰", "werkzeugkiste"], ["🪵", "holz baumstamm"],
      ["🪜", "leiter"], ["🧱", "ziegel stein"], ["🪣", "eimer"], ["🧲", "magnet"],
      ["📐", "geodreieck winkel"], ["📏", "lineal messen"], ["📌", "pinnadel merken"], ["📎", "büroklammer"],
      ["🎨", "palette malen kunst"], ["🖌️", "pinsel malen"], ["🖍️", "wachsmalstift"], ["✏️", "bleistift"],
      ["🖊️", "kugelschreiber"], ["📝", "notiz schreiben"], ["📒", "notizbuch"], ["📚", "bücher lernen"],
      ["📦", "paket versand"], ["🛍️", "einkaufstüten shopping"], ["🛒", "einkaufswagen"], ["💳", "karte bezahlen"],
      ["💰", "geld sack"], ["🏷️", "etikett preis"], ["🎁", "geschenk"], ["📷", "kamera foto"],
      ["📸", "foto blitz"], ["🎥", "video kamera"], ["📱", "handy smartphone app"], ["💻", "laptop computer"],
      ["🕯️", "kerze"], ["🪴", "topfpflanze"], ["🧺", "korb"], ["🧸", "teddybär"],
      ["🪢", "knoten seil"], ["🧷", "sicherheitsnadel"], ["🧩", "puzzle"], ["🪄", "zauberstab"],
      ["🔑", "schlüssel"], ["🔒", "schloss sicher"], ["🗓️", "kalender termin"], ["⏰", "wecker zeit"],
      ["⏳", "sanduhr warten"], ["📍", "ort markierung"], ["🛠️", "werkzeug hammer schlüssel wartung"], ["🚧", "baustelle wartung"],
    ],
  },
  {
    id: "natur",
    label: "Natur",
    items: [
      ["🌱", "keimling neu wachsen"], ["🌿", "kraut blatt"], ["🍀", "kleeblatt glück"], ["🍃", "blätter wind"],
      ["🍂", "herbstlaub"], ["🍁", "ahornblatt herbst"], ["🌸", "kirschblüte frühling"], ["🌼", "blume gelb"],
      ["🌻", "sonnenblume sommer"], ["🌷", "tulpe"], ["🌹", "rose"], ["💐", "blumenstrauss"],
      ["🌳", "baum"], ["🌲", "tanne nadelbaum"], ["🎄", "weihnachtsbaum"], ["🌵", "kaktus"],
      ["🍄", "pilz"], ["🐚", "muschel"], ["🌍", "erde welt"], ["🏔️", "berg schnee schweiz alpen"],
      ["⛰️", "berg"], ["🌋", "vulkan"], ["🏕️", "zelten camping"], ["🌊", "welle meer"],
      ["☀️", "sonne"], ["🌤️", "sonne wolke"], ["⛅", "wolkig"], ["🌧️", "regen"],
      ["⛈️", "gewitter"], ["❄️", "schnee kalt winter"], ["☃️", "schneemann"], ["🌈", "regenbogen"],
      ["🌙", "mond nacht"], ["⭐", "stern nacht"], ["🐝", "biene"], ["🦋", "schmetterling"],
      ["🐞", "marienkäfer glück"], ["🐌", "schnecke langsam"], ["🐶", "hund"], ["🐱", "katze"],
      ["🐑", "schaf wolle"], ["🦔", "igel"], ["🐻", "bär"], ["🦊", "fuchs"],
    ],
  },
  {
    id: "essen",
    label: "Essen & Trinken",
    items: [
      ["🍎", "apfel"], ["🍐", "birne"], ["🍓", "erdbeere"], ["🍒", "kirschen"],
      ["🍋", "zitrone"], ["🍇", "trauben"], ["🍉", "melone sommer"], ["🥕", "karotte rüebli"],
      ["🥐", "gipfeli croissant"], ["🥨", "brezel"], ["🍞", "brot"], ["🧀", "käse"],
      ["🍕", "pizza"], ["🍝", "pasta"], ["🫕", "fondue käse schweiz"], ["🥗", "salat"],
      ["🍰", "kuchen torte"], ["🎂", "geburtstagstorte"], ["🧁", "cupcake"], ["🍪", "keks guetzli"],
      ["🍫", "schokolade"], ["🍯", "honig"], ["☕", "kaffee pause"], ["🍵", "tee"],
      ["🧃", "saft"], ["🍷", "wein"], ["🍺", "bier"], ["🥂", "anstossen prost feiern"],
    ],
  },
  {
    id: "feiern",
    label: "Feiern & Aktivitäten",
    items: [
      ["🎉", "konfetti feiern party"], ["🎊", "konfettiball"], ["🎈", "ballon"], ["🎀", "schleife"],
      ["🏆", "pokal sieger gewinnen"], ["🥇", "gold erster platz"], ["🥈", "silber zweiter"], ["🥉", "bronze dritter"],
      ["🏅", "medaille"], ["🎖️", "orden"], ["🎗️", "erinnerungsband"], ["🎟️", "ticket eintritt"],
      ["🎫", "ticket"], ["🎭", "theater"], ["🎶", "musik noten"], ["🎵", "note musik"],
      ["🎤", "mikrofon"], ["🎮", "spiel"], ["🧘", "yoga ruhe"], ["🚴", "velo fahrrad"],
      ["🏃", "rennen laufen"], ["⛷️", "ski"], ["🏊", "schwimmen"], ["🎃", "kürbis halloween"],
      ["🎅", "samichlaus weihnachten"], ["🐣", "ostern küken"], ["🥚", "ei ostern"], ["🎆", "feuerwerk silvester"],
    ],
  },
  {
    id: "orte",
    label: "Orte & Flaggen",
    items: [
      ["🏠", "haus zuhause"], ["🏡", "haus garten"], ["🏪", "laden geschäft"], ["🏬", "kaufhaus"],
      ["🏫", "schule"], ["🏛️", "museum"], ["⛪", "kirche"], ["🏰", "schloss"],
      ["🚗", "auto"], ["🚆", "zug bahn"], ["🚌", "bus"], ["✈️", "flugzeug reise"],
      ["🚀", "rakete start launch"], ["🛵", "roller"], ["🚚", "lieferwagen versand"], ["⛵", "segelboot"],
      ["🗺️", "karte"], ["🧭", "kompass"], ["🇨🇭", "schweiz flagge"], ["🇩🇪", "deutschland flagge"],
      ["🇦🇹", "österreich flagge"], ["🇮🇹", "italien flagge"], ["🇫🇷", "frankreich flagge"], ["🇱🇮", "liechtenstein flagge"],
      ["🇪🇺", "europa flagge"], ["🏳️‍🌈", "regenbogenflagge pride"], ["🏁", "zielflagge"], ["🚩", "rote flagge"],
    ],
  },
];

const ALL = EMOJI_GROUPS.flatMap((g) => g.items);

/** Suche über Stichwörter (ohne Gross/Klein, Umlaute tolerant: ae/oe/ue/ss). Leere Suche → nichts. */
export function searchEmoji(query: string, limit = 48): string[] {
  const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").trim();
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const seen = new Set<string>();
  const hits: { e: string; score: number }[] = [];
  for (const [e, kw] of ALL) {
    if (seen.has(e)) continue;
    const words = norm(kw).split(" ");
    let score = 0;
    for (const t of terms) {
      const exact = words.some((w) => w === t);
      const prefix = words.some((w) => w.startsWith(t));
      const part = words.some((w) => w.includes(t));
      if (!part) {
        score = -1;
        break;
      }
      score += exact ? 3 : prefix ? 2 : 1;
    }
    if (score > 0) {
      seen.add(e);
      hits.push({ e, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit).map((h) => h.e);
}

/** Name eines Emojis für Screenreader und Tooltips (erstes Stichwort) */
export function emojiName(emoji: string) {
  return ALL.find(([e]) => e === emoji)?.[1].split(" ")[0] ?? "Emoji";
}
