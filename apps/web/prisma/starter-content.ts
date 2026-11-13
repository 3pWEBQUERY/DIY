import type { PrismaClient } from "../src/generated/prisma/client";

/**
 * Erste Inhalte für die Startseite: drei Projektideen der Redaktion zum Nachbauen, je mit einem Beitrag im
 * Feed. Läuft auch in Produktion, aber nur EINMAL (Marker in SystemSetting) – löscht die Redaktion die
 * Inhalte später, werden sie nicht neu angelegt.
 *
 * Bewusst als „Idee“ der Redaktion (kein erfundenes Mitglied, keine erfundenen Erfahrungen): Die Projekte
 * laden ein, sie nachzubauen und den eigenen Nachbau zu zeigen.
 */
const MARKER = "seed.starterContent.v1";

type Starter = {
  slug: string;
  title: string;
  category: string;
  difficulty: number;
  minutes: number;
  budgetMinor: number;
  tags: string[];
  description: string;
  materials: [string, string][];
  tools: string[];
  post: string;
};

const STARTERS: Starter[] = [
  {
    slug: "gehaekelte-sterne-fuer-den-advent",
    title: "Gehäkelte Sterne für den Advent",
    category: "haekeln-stricken",
    difficulty: 1,
    minutes: 45,
    budgetMinor: 900,
    tags: ["advent", "sterne", "resteverwertung", "anfaenger"],
    description: [
      "Kleine Sterne aus Wollresten – als Anhänger für den Adventskranz, als Geschenkanhänger oder an einer Schnur als Girlande. Ein Stern dauert etwa 15 Minuten und eignet sich gut als erstes Häkelprojekt.",
      "So geht's:",
      "1. Fadenring, darin 10 feste Maschen häkeln und mit einer Kettmasche schliessen.",
      "2. Zacken: 4 Luftmaschen, ab der 2. Luftmasche zurück 1 feste Masche, 1 halbes Stäbchen, 1 Stäbchen; die nächste Masche der Runde überspringen und mit einer Kettmasche in der folgenden befestigen. Das Ganze fünfmal – fertig ist der Stern.",
      "3. Fäden vernähen, den Stern feucht in Form ziehen und flach trocknen lassen. Wer mag, steift ihn mit etwas Zuckerwasser.",
      "Tipp: Ein glänzendes Garn (z. B. mercerisierte Baumwolle) lässt die Zacken schärfer wirken.",
      "Zeig uns deinen Nachbau – welche Farben hast du gewählt?",
    ].join("\n\n"),
    materials: [["Baumwollgarn (Reste)", "ca. 5 g pro Stern"], ["Aufhängeband", "20 cm pro Stern"]],
    tools: ["Häkelnadel 3 mm", "Wollnadel", "Schere"],
    post: "Projektidee für die Adventszeit: Sterne aus Wollresten häkeln 🧶 Eine Viertelstunde pro Stern, ideal für Anfänger:innen. Anleitung im Projekt – wir freuen uns auf eure Nachbauten!",
  },
  {
    slug: "kissenhuelle-mit-hotelverschluss",
    title: "Kissenhülle mit Hotelverschluss",
    category: "naehen-textil",
    difficulty: 1,
    minutes: 60,
    budgetMinor: 1500,
    tags: ["kissen", "hotelverschluss", "naehanfaenger", "wohnen"],
    description: [
      "Die einfachste Kissenhülle überhaupt: kein Reissverschluss, keine Knöpfe – die Rückseite überlappt einfach. Mit einem Stück Stoff von etwa 45 × 105 cm ist sie in einer Stunde genäht.",
      "Zuschnitt (für ein Kissen 40 × 40 cm): ein Rechteck 42 × 100 cm. Die Hülle sitzt knapp, damit das Kissen schön prall wirkt.",
      "So geht's:",
      "1. Beide Schmalseiten 1 cm und nochmals 1 cm umbügeln und knappkantig absteppen.",
      "2. Stoff rechts auf rechts legen und so falten, dass die Hülle 40 cm hoch ist und sich die gesäumten Kanten in der Mitte etwa 15 cm überlappen.",
      "3. Oben und unten mit 1 cm Nahtzugabe zusammennähen, Anfang und Ende gut verriegeln – dort zieht es beim Einstecken des Kissens.",
      "4. Ecken schräg zurückschneiden, wenden, Ecken ausformen und bügeln.",
      "Tipp: Leinen oder ein fester Baumwollstoff eignen sich am besten. Den Stoff vorher waschen, damit die Hülle später nicht einläuft.",
    ].join("\n\n"),
    materials: [["Leinen oder fester Baumwollstoff", "45 × 105 cm"], ["Nähgarn", "passend"], ["Kissenfüllung", "40 × 40 cm"]],
    tools: ["Nähmaschine", "Bügeleisen", "Stoffschere", "Stecknadeln"],
    post: "Nähen ohne Reissverschluss: Eine Kissenhülle mit Hotelverschluss ist in einer Stunde fertig – das perfekte erste Nähprojekt. Zuschnitt und Schritte stehen im Projekt.",
  },
  {
    slug: "schneidebrett-aus-eichenholz",
    title: "Schneidebrett aus Eichenholz",
    category: "holz",
    difficulty: 2,
    minutes: 180,
    budgetMinor: 2500,
    tags: ["schneidebrett", "eiche", "kueche", "geschenk"],
    description: [
      "Ein massives Brett für die Küche – aus einem Reststück Eiche oder einem Brett vom Holzhändler. Ohne grosse Maschinen machbar und ein schönes Geschenk.",
      "Holz: unbehandelte Eiche, Ahorn oder Buche, etwa 2 cm stark. Keine Nadelhölzer (harzig) und nichts Verleimtes mit unbekanntem Leim.",
      "So geht's:",
      "1. Form anzeichnen (z. B. 40 × 20 cm mit Griff) und mit der Stichsäge aussägen.",
      "2. Ein Griffloch mit einem 25-mm-Forstnerbohrer bohren – von beiden Seiten, damit nichts ausreisst.",
      "3. Kanten mit der Raspel runden, dann schleifen: Körnung 80, 120, 180 und 240.",
      "4. Mit einem feuchten Tuch abwischen, trocknen lassen und nochmals mit 240 schleifen – so stellen sich die Fasern nicht beim ersten Spülen auf.",
      "5. Mit lebensmittelechtem Öl (z. B. Leinöl oder ein Schneidebrettöl) zweimal einölen und einziehen lassen.",
      "Sicherheit: Ölgetränkte Lappen ausgebreitet trocknen lassen oder in Wasser lagern – sie können sich sonst selbst entzünden.",
    ].join("\n\n"),
    materials: [["Eichenbrett, unbehandelt", "ca. 45 × 22 × 2 cm"], ["Lebensmittelechtes Öl", "50 ml"], ["Schleifpapier", "Körnung 80–240"]],
    tools: ["Stichsäge", "Forstnerbohrer 25 mm", "Raspel", "Schleifklotz", "Schraubzwingen"],
    post: "Aus einem Reststück Eiche wird ein Schneidebrett fürs Leben 🪵 Sägen, bohren, schleifen, ölen – mit Schritt-für-Schritt-Anleitung im Projekt. Wer baut mit?",
  },
];

export async function starterContent(db: PrismaClient, authorId: string) {
  if (await db.systemSetting.findUnique({ where: { key: MARKER } })) return;
  const now = Date.now();
  let created = 0;
  for (const [i, s] of STARTERS.entries()) {
    // Nicht doppelt anlegen, falls es den Slug beim Konto schon gibt (z. B. Demo-Daten)
    if (await db.project.findFirst({ where: { ownerId: authorId, slug: s.slug }, select: { id: true } })) continue;
    // Gestaffelt, damit die Reihenfolge auf der Startseite stabil ist (neueste zuerst)
    const at = new Date(now - (STARTERS.length - i) * 60_000);
    const project = await db.project.create({
      data: {
        ownerId: authorId,
        slug: s.slug,
        title: s.title,
        description: s.description,
        category: s.category,
        tags: s.tags,
        difficulty: s.difficulty,
        estimatedMinutes: s.minutes,
        budgetMinor: s.budgetMinor,
        status: "IDEA",
        visibility: "PUBLIC",
        state: "PUBLISHED",
        isFeatured: true,
        publishedAt: at,
        createdAt: at,
        updatedAt: at,
        qualityScore: 0.8,
        materials: { create: s.materials.map(([name, quantity], k) => ({ name, quantity, position: k })) },
        tools: { create: s.tools.map((name, k) => ({ name, position: k })) },
      },
    });
    await db.post.create({
      data: { authorId, kind: "PROJECT_SHOWCASE", body: s.post, projectId: project.id, category: s.category, publishedAt: at, createdAt: at, qualityScore: 0.8 },
    });
    await db.userProfile.update({ where: { userId: authorId }, data: { projectCount: { increment: 1 }, postCount: { increment: 1 } } });
    created++;
  }
  await db.systemSetting.create({ data: { key: MARKER, value: { created, at: new Date(now).toISOString() } } });
  if (created) console.log(`→ ${created} Startprojekte der Redaktion angelegt`);
}
