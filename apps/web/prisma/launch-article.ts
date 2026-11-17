import type { PrismaClient } from "../src/generated/prisma/client";

/**
 * Blogartikel zum Start: „Werkuno ist online“ – Vision, was heute schon geht, was als Nächstes kommt.
 * Läuft auch in Produktion, aber nur EINMAL (Marker in SystemSetting). Bearbeitet oder löscht die Redaktion den
 * Artikel später im Blog-Editor, wird er nicht neu angelegt.
 *
 * Inhaltlich nur Aussagen, die der Plattform entsprechen (keine erfundenen Zahlen, Daten oder Personen).
 */
const MARKER = "seed.launchArticle.v1";
const SLUG = "werkuno-ist-online";

let n = 0;
const id = () => `l${++n}`;

const BLOCKS = [
  {
    type: "paragraph",
    text: "Heute ist es so weit: **Werkuno ist online.** Ein Ort für alle, die mit den Händen etwas erschaffen – ob Holz, Garn, Stoff, Ton, Papier oder Lötzinn. Hier zeigst du, was auf deiner Werkbank entsteht, lernst von anderen und findest Handgemachtes von Menschen, deren Arbeit du kennst.",
  },
  { type: "heading", level: 2, text: "Warum wir Werkuno gebaut haben" },
  {
    type: "paragraph",
    text: "Selbstgemachtes ist heute über viele Orte verstreut: Fotos in sozialen Netzwerken, Anleitungen in Foren und PDFs, Verkäufe auf Plattformen voller Massenware. Was dabei fast immer verloren geht, ist der Weg – die Skizze, der erste misslungene Versuch, der Trick, der am Ende den Unterschied macht.",
  },
  {
    type: "paragraph",
    text: "Werkuno bringt das zusammen. Ein Projekt beginnt als Idee, wächst mit jedem Journal-Eintrag, wird zur Anleitung, die andere nachbauen – und vielleicht zu einem Stück im Marktplatz. Alles bleibt miteinander verbunden, und man sieht, wie etwas gemacht wurde.",
  },
  { type: "quote", text: "Kleine Ideen. Grosse Projekte.", cite: "Werkuno" },
  { type: "heading", level: 2, text: "Was du heute schon machen kannst" },
  {
    type: "list",
    ordered: false,
    items: [
      "**Projekte dokumentieren** – mit Journal, Zwischenständen, Materialliste und Werkzeugen.",
      "**Anleitungen schreiben und nachbauen** – Schritt für Schritt, mit Schwierigkeitsgrad und Zeitaufwand.",
      "**Communities finden** – Gruppen zu deinem Handwerk oder deiner Region, mit Events und Wettbewerben.",
      "**Bloggen** – längere Geschichten, Erfahrungsberichte und Werkstattwissen.",
      "**Kaufen und verkaufen** – Handgemachtes, Materialsets und digitale Anleitungen im Marktplatz.",
    ],
  },
  { type: "heading", level: 2, text: "Wofür wir stehen" },
  {
    type: "list",
    ordered: false,
    items: [
      "**Deine Inhalte bleiben deine.** Du behältst die Rechte an Fotos, Projekten und Anleitungen. Wer nachbaut, nennt das Original – sichtbar.",
      "**Ein ehrlicher Feed.** Die neuesten Beiträge stehen oben, es gibt keine bezahlten Platzierungen.",
      "**Handgemacht statt Massenware.** Dropshipping und umetikettierte Fertigware haben im Marktplatz keinen Platz. Jeder Shop wird vor dem ersten Verkauf verifiziert.",
      "**Faire, transparente Gebühren.** Mitmachen ist kostenlos. Nur wer verkauft, zahlt eine Provision – und nur, wenn etwas verkauft wird.",
      "**Gemacht in der Schweiz.** Mit Sorgfalt für Datenschutz und für eine Community, in der man sich gerne aufhält.",
    ],
  },
  { type: "heading", level: 2, text: "Was als Nächstes kommt" },
  {
    type: "paragraph",
    text: "Der Start ist erst der Anfang. Woran wir gerade arbeiten:",
  },
  {
    type: "list",
    ordered: false,
    items: [
      "**Die App fürs iPhone** – Projekte unterwegs festhalten, Fortschritt direkt aus der Werkstatt teilen.",
      "**Android** – die App folgt danach auch für Android.",
      "**Deine eigene Adresse** – jedes Profil bekommt eine eigene Subdomain wie *deinname.werkuno.ch*, ideal für Visitenkarte, Instagram oder die eigene Website.",
      "**Mehr Wege zur Anmeldung** – zusätzlich zu E-Mail und Apple auch mit Pinterest.",
      "**Mehr Bauanleitungen im Marktplatz** – von der Redaktion und von euch.",
    ],
  },
  {
    type: "callout",
    tone: "tip",
    text: "Du hast eine Idee, einen Wunsch oder einen Fehler gefunden? [Schreib uns](/kontakt) – wir lesen jede Nachricht und bauen Werkuno gemeinsam mit euch weiter.",
  },
  { type: "divider" },
  {
    type: "paragraph",
    text: "Danke, dass du von Anfang an dabei bist. Leg dein erstes Projekt an, folge Menschen, deren Arbeit dich inspiriert, und zeig uns, was gerade auf deiner Werkbank entsteht. Wir freuen uns darauf.",
  },
].map((b) => ({ id: id(), ...b }));

function plain(blocks: typeof BLOCKS) {
  const strip = (t: string) => t.replace(/\*\*|\*|\[([^\]]+)\]\([^)]+\)/g, "$1");
  return blocks
    .flatMap((b) => ("text" in b && b.text ? [strip(b.text as string)] : "items" in b ? (b.items as string[]).map(strip) : []))
    .join("\n\n");
}

export async function launchArticle(db: PrismaClient, authorId: string) {
  if (await db.systemSetting.findUnique({ where: { key: MARKER } })) return;
  const exists = await db.blogArticle.findUnique({ where: { authorId_slug: { authorId, slug: SLUG } }, select: { id: true } });
  if (!exists) {
    const title = "Werkuno ist online";
    const dek = "Ein Zuhause für alles, was mit den Händen entsteht: warum wir Werkuno gebaut haben, was du heute schon machen kannst – und was als Nächstes kommt.";
    const plainText = plain(BLOCKS);
    const words = `${title} ${dek} ${plainText}`.split(/\s+/).filter(Boolean).length;
    const category = await db.articleCategory.upsert({ where: { slug: "neuigkeiten" }, create: { slug: "neuigkeiten", name: "Neuigkeiten" }, update: {} });
    const now = new Date();
    const article = await db.blogArticle.create({
      data: {
        authorId,
        slug: SLUG,
        title,
        dek,
        coverUrl: "/placeholders/artikel-1280.webp",
        blocks: BLOCKS,
        plainText,
        readingMinutes: Math.max(1, Math.round(words / 200)),
        categoryId: category.id,
        tags: ["werkuno", "start", "community"],
        seoTitle: "Werkuno ist online – die Community für Selbstgemachtes",
        seoDescription: "Werkuno ist online: Projekte dokumentieren, Anleitungen teilen, Communities finden und Handgemachtes verkaufen. Unsere Vision und was als Nächstes kommt.",
        state: "PUBLISHED",
        isFeatured: true,
        publishedAt: now,
        revisions: { create: { title, blocks: BLOCKS } },
      },
    });
    await db.post.create({
      data: {
        authorId,
        kind: "ARTICLE",
        articleId: article.id,
        body: "Werkuno ist online! 🎉 Warum wir Werkuno gebaut haben, wofür wir stehen und was als Nächstes kommt – jetzt im Blog.",
        publishedAt: now,
        qualityScore: 0.8,
      },
    });
    await db.userProfile.update({ where: { userId: authorId }, data: { postCount: { increment: 1 } } }).catch(() => {});
    console.log("→ Blogartikel „Werkuno ist online“ veröffentlicht");
  }
  await db.systemSetting.create({ data: { key: MARKER, value: { at: new Date().toISOString(), skipped: Boolean(exists) } } });
}
