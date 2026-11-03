/**
 * Seed: Grunddaten (Materialien, Werkzeuge, Einstellungen, Admin) und optional
 * glaubwürdige Demo-Inhalte (SEED_DEMO=true). Idempotent: bestehende Demo-Daten
 * werden nicht dupliziert.
 *
 *   pnpm db:seed                    → Grunddaten + Admin
 *   SEED_DEMO=true pnpm db:seed     → zusätzlich Demo-Community
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ProjectStatus } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/crypto";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const days = (n: number) => new Date(Date.now() - n * 86400_000);
const hours = (n: number) => new Date(Date.now() - n * 3600_000);
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length]!;

// ───────────────────────── Grunddaten ─────────────────────────

const MATERIAL_CATS: [string, string, [string, string, string][]][] = [
  ["garne", "Garne", [["Baumwollgarn", "Garn", "g"], ["Merinowolle", "Garn", "g"], ["Alpakagarn", "Garn", "g"], ["Leinengarn", "Garn", "g"], ["Bändchengarn", "Garn", "g"], ["Sockenwolle", "Garn", "g"]]],
  ["stoffe", "Stoffe", [["Baumwollstoff", "Stoff", "m"], ["Leinen", "Stoff", "m"], ["Jersey", "Stoff", "m"], ["Canvas", "Stoff", "m"], ["Vlieseline", "Einlage", "m"], ["Futterstoff", "Stoff", "m"]]],
  ["holz", "Holzarten", [["Eiche massiv", "Holz", "m²"], ["Buche", "Holz", "m²"], ["Kiefer", "Holz", "m²"], ["Birke Multiplex", "Plattenwerkstoff", "m²"], ["Arve", "Holz", "m²"]]],
  ["farben", "Farben & Oberflächen", [["Leinölfirnis", "Öl", "ml"], ["Kreidefarbe", "Farbe", "ml"], ["Acrylfarbe", "Farbe", "ml"], ["Hartwachsöl", "Öl", "ml"], ["Schellack", "Lack", "ml"]]],
  ["kleber", "Klebstoffe", [["Holzleim D3", "Leim", "ml"], ["Textilkleber", "Kleber", "ml"], ["Heissklebesticks", "Kleber", "Stk"], ["Buchbinderleim", "Leim", "ml"]]],
  ["papier", "Papier", [["Aquarellpapier 300 g", "Papier", "Blatt"], ["Origamipapier", "Papier", "Blatt"], ["Graupappe 2 mm", "Karton", "Blatt"], ["Japanpapier", "Papier", "Blatt"]]],
  ["keramik", "Keramikmaterialien", [["Steinzeugton", "Ton", "kg"], ["Porzellanmasse", "Ton", "kg"], ["Transparentglasur", "Glasur", "ml"], ["Engobe", "Glasur", "ml"]]],
  ["druck", "3D-Druckmaterialien", [["PLA Filament", "Filament", "g"], ["PETG Filament", "Filament", "g"], ["TPU Filament", "Filament", "g"]]],
  ["elektronik", "Elektronik", [["ESP32 Board", "Mikrocontroller", "Stk"], ["WS2812B LED-Streifen", "LED", "m"], ["Lötzinn bleifrei", "Verbrauch", "g"], ["Netzteil 5 V 3 A", "Stromversorgung", "Stk"]]],
];
const TOOLS = ["Häkelnadel 4 mm", "Häkelnadel 3,5 mm", "Rundstricknadel 4 mm", "Nähmaschine", "Stoffschere", "Stecknadeln", "Bügeleisen", "Japansäge", "Akkuschrauber", "Stechbeitel-Set", "Schleifpapier K120–K240", "Schraubzwingen", "Töpferscheibe", "Modellierwerkzeuge", "Lötkolben", "Multimeter", "3D-Drucker", "Cutter", "Falzbein", "Pinselset"];

async function baseData() {
  for (const [cslug, name, mats] of MATERIAL_CATS) {
    const cat = await db.materialCategory.upsert({ where: { slug: cslug }, create: { slug: cslug, name }, update: { name } });
    for (const [mname, type, unit] of mats) {
      await db.material.upsert({
        where: { slug: slug(mname) },
        create: {
          slug: slug(mname),
          name: mname,
          type,
          unit,
          categoryId: cat.id,
          safetyInfo: cslug === "farben" ? "Ölgetränkte Lappen können sich selbst entzünden – ausgebreitet trocknen lassen oder in Wasser lagern." : cslug === "elektronik" ? "Nur mit Schutzkleinspannung arbeiten. Netzspannung gehört in Fachhände." : "",
        },
        update: {},
      });
    }
  }
  for (const t of TOOLS) await db.tool.upsert({ where: { slug: slug(t) }, create: { slug: slug(t), name: t, safetyInfo: /säge|beitel|cutter|lötkolben/i.test(t) ? "Schutzausrüstung tragen, vom Körper weg arbeiten." : "" }, update: {} });
  for (const [slugv, name] of [["werkstattwissen", "Werkstattwissen"], ["materialkunde", "Materialkunde"], ["erfahrungsbericht", "Erfahrungsbericht"], ["inspiration", "Inspiration"]]) {
    await db.articleCategory.upsert({ where: { slug: slugv! }, create: { slug: slugv!, name: name! }, update: {} });
  }
  await db.featureFlag.upsert({ where: { key: "marketplace" }, create: { key: "marketplace", enabled: true, description: "Marktplatz für verifizierte Verkäufer" }, update: {} });
  await db.featureFlag.upsert({ where: { key: "digital-products" }, create: { key: "digital-products", enabled: false, description: "Verkauf digitaler Anleitungen (Web)" }, update: {} });
  await db.featureFlag.upsert({ where: { key: "local-feed" }, create: { key: "local-feed", enabled: false, description: "Feed „Lokal“ (Phase 4)" }, update: {} });
}

async function admin() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@werkraum.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "Werkraum-Admin-2026!";
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return exists;
  console.log(`→ Admin angelegt: ${email}`);
  return db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: "SUPERADMIN",
      emailVerifiedAt: new Date(),
      adultConfirmedAt: new Date(),
      termsAcceptedAt: new Date(),
      onboardedAt: new Date(),
      profile: { create: { handle: "werkraum", displayName: "WERKRAUM Redaktion", bio: "Die Redaktion hinter WERKRAUM. Wir kuratieren, moderieren und hören zu.", categories: ["haekeln-stricken", "naehen-textil", "holz"], region: "Zürich" } },
      preference: { create: { interests: ["haekeln-stricken", "naehen-textil", "holz"] } },
    },
  });
}

// ───────────────────────── Demo-Community ─────────────────────────

type Creator = { handle: string; name: string; region: string; country?: string; bio: string; cats: string[] };
const CREATORS: Creator[] = [
  { handle: "lena.haekelt", name: "Lena Brunner", region: "Zürich", bio: "Häkle seit drei Wintern. Naturgarne, alte Muster, neue Formen. Zeige gern, wie es wirklich aussieht – Fehler inklusive.", cats: ["haekeln-stricken", "wohnen-deko"] },
  { handle: "mattia.holz", name: "Mattia Rossi", region: "Lugano", bio: "Schreiner im Nebenberuf. Massivholz, Handwerkzeuge, keine Spanplatten. Arve riecht nach Zuhause.", cats: ["holz", "moebel-upcycling"] },
  { handle: "sophie.naeht", name: "Sophie Keller", region: "Bern", bio: "Nähe meine Garderobe selbst – slow, fair, mit Leinen. Schnittmuster-Nerd.", cats: ["naehen-textil", "schmuck-accessoires"] },
  { handle: "jonas.makes", name: "Jonas Meier", region: "Basel", bio: "Elektronik, Löten, kleine Smart-Home-Basteleien. Alles mit 5 Volt und Geduld.", cats: ["elektronik-maker", "3d-druck"] },
  { handle: "aylin.ton", name: "Aylin Demir", region: "Winterthur", bio: "Töpfere in einer Gemeinschaftswerkstatt. Wulsttechnik, Raku, viel Staub.", cats: ["keramik", "wohnen-deko"] },
  { handle: "nora.upcycling", name: "Nora Huber", region: "Luzern", bio: "Rette Möbel aus der Brockenstube. Kreidefarbe, Leinöl und eine Schwäche für Messinggriffe.", cats: ["moebel-upcycling", "wohnen-deko"] },
  { handle: "felix.druckt", name: "Felix Wagner", region: "Wien", country: "AT", bio: "3D-Druck für den Alltag: Halterungen, Ersatzteile, kleine Helfer. Alles parametrisch.", cats: ["3d-druck", "elektronik-maker"] },
  { handle: "clara.papier", name: "Clara Schmid", region: "St. Gallen", bio: "Buchbinden, Falten, Schneiden. Papier ist das geduldigste Material der Welt.", cats: ["papier-basteln", "festlich"] },
  { handle: "elias.garten", name: "Elias Frei", region: "Thun", bio: "Hochbeete, Kräuterspiralen, Saatgut tauschen. Mein Balkon ist ein Experiment.", cats: ["garten-pflanzen", "holz"] },
  { handle: "mira.strickt", name: "Mira Baumann", region: "München", country: "DE", bio: "Strickt Pullover für alle, die frieren. Farbverliebt, aber immer Naturfaser.", cats: ["haekeln-stricken", "naehen-textil"] },
  { handle: "luca.schmuck", name: "Luca Steiner", region: "Chur", bio: "Silberschmuck aus Altmetall. Jede Kette erzählt die Geschichte ihres Vorgängers.", cats: ["schmuck-accessoires"] },
  { handle: "hanna.malt", name: "Hanna Graf", region: "Freiburg", bio: "Aquarell und Gouache. Skizzenbücher auf jeder Wanderung.", cats: ["malen-zeichnen", "kinder-familie"] },
];

type ProjectSeed = {
  owner: string;
  title: string;
  cat: string;
  status: ProjectStatus;
  difficulty: number;
  est: number;
  act?: number;
  budget?: number;
  tags: string[];
  desc: string;
  materials: [string, string][];
  tools: string[];
  journal: { body: string; milestone?: string; problem?: string; solution?: string; minutes?: number; ago: number }[];
  featured?: boolean;
};

const PROJECTS: ProjectSeed[] = [
  {
    owner: "lena.haekelt",
    title: "Markttasche aus Baumwollgarn",
    cat: "haekeln-stricken",
    status: "COMPLETED",
    difficulty: 2,
    est: 600,
    act: 720,
    budget: 3800,
    tags: ["tasche", "netzmuster", "baumwolle", "anfaenger"],
    featured: true,
    desc: "Eine robuste Einkaufstasche im Netzmuster, die zusammengeknüllt in jede Jackentasche passt. Der Boden wird in Runden gehäkelt, der Korpus im Filetmuster – ideal als erstes grösseres Projekt.\n\nIch habe recyceltes Baumwollgarn verwendet; die Tasche trägt problemlos 6 kg Gemüse.",
    materials: [["Baumwollgarn", "300 g"], ["Maschenmarkierer", "4 Stk"]],
    tools: ["Häkelnadel 4 mm", "Stoffschere"],
    journal: [
      { body: "Boden fertig: 12 Runden feste Maschen, flach und ohne Wellen. Endlich!", milestone: "Boden", minutes: 120, ago: 26 },
      { body: "Netzmuster begonnen. Nach 5 Runden gemerkt, dass die Tasche schief wird.", problem: "Maschenzahl pro Runde nicht konstant – die Tasche drehte sich spiralförmig.", solution: "Maschenmarkierer an den Rundenanfang und nach jeder Runde nachgezählt.", minutes: 180, ago: 22 },
      { body: "Henkel doppelt gehäkelt, damit sie sich nicht ausleiern. Fertig und schon dreimal im Einsatz.", milestone: "Fertig", minutes: 90, ago: 18 },
    ],
  },
  {
    owner: "lena.haekelt",
    title: "Granny-Square-Decke in Herbstfarben",
    cat: "haekeln-stricken",
    status: "IN_PROGRESS",
    difficulty: 3,
    est: 3000,
    budget: 12000,
    tags: ["granny-square", "decke", "wolle"],
    desc: "48 Grannys in sechs Farben – Senf, Rost, Moos, Creme, Tannengrün und ein bisschen Pflaume. Verbunden wird am Schluss mit Kettmaschen von hinten, damit eine schöne Naht entsteht.",
    materials: [["Merinowolle", "1200 g"], ["Wollnadel", "1 Stk"]],
    tools: ["Häkelnadel 4 mm"],
    journal: [
      { body: "Farbschema festgelegt und 6 Probe-Grannys gehäkelt. Die Pflaume war fast zu dunkel.", milestone: "Farbprobe", minutes: 150, ago: 14 },
      { body: "24 von 48 Grannys fertig. Halbzeit!", milestone: "Halbzeit", minutes: 600, ago: 6 },
      { body: "Fäden vernähen ist das eigentliche Projekt. Tipp: direkt nach jedem Granny vernähen.", problem: "Hunderte lose Fäden.", solution: "Ab jetzt beim Häkeln einhäkeln statt nachträglich vernähen.", minutes: 120, ago: 2 },
    ],
  },
  {
    owner: "mattia.holz",
    title: "Dreibeiniger Melkschemel aus Arve",
    cat: "holz",
    status: "COMPLETED",
    difficulty: 3,
    est: 480,
    act: 540,
    budget: 6500,
    tags: ["arve", "schemel", "handwerkzeug", "keilzapfen"],
    featured: true,
    desc: "Ein Schemel wie früher auf der Alp: drei gespreizte Beine, mit Keilen in die Sitzfläche getrieben. Ohne Schrauben, nur Holz und Leim. Die Arve stammt aus einem Sturmholzlager im Engadin.",
    materials: [["Arve", "0,2 m²"], ["Holzleim D3", "50 ml"], ["Leinölfirnis", "100 ml"]],
    tools: ["Japansäge", "Stechbeitel-Set", "Schraubzwingen", "Schleifpapier K120–K240"],
    journal: [
      { body: "Sitzfläche aus einem Stück ausgesägt, Rohling 38 mm stark.", milestone: "Rohling", minutes: 90, ago: 40 },
      { body: "Bohrwinkel für die Beine: 12° Spreizung. Mit einer Schmiege und einem Hilfsklotz gebohrt.", problem: "Erster Versuch: Loch zu steil, Bein stand schief.", solution: "Bohrlehre aus Restholz gebaut, die den Winkel fixiert.", minutes: 150, ago: 36 },
      { body: "Keile eingetrieben, bündig abgesägt, zweimal geölt. Er steht wackelfrei – auch auf dem Kopfsteinpflaster.", milestone: "Fertig", minutes: 300, ago: 30 },
    ],
  },
  {
    owner: "mattia.holz",
    title: "Wandregal mit Schwalbenschwanz",
    cat: "holz",
    status: "PLANNING",
    difficulty: 4,
    est: 900,
    budget: 15000,
    tags: ["eiche", "schwalbenschwanz", "regal"],
    desc: "Ein schlichtes Wandregal aus Eiche, die Ecken handgeschnitten mit offenen Schwalbenschwänzen. Ziel: Übungsstück für sauberes Anreissen.",
    materials: [["Eiche massiv", "0,6 m²"], ["Hartwachsöl", "150 ml"]],
    tools: ["Japansäge", "Stechbeitel-Set", "Schraubzwingen"],
    journal: [{ body: "Zeichnung fertig, Holz bestellt. Probeverbindungen in Kiefer geplant.", milestone: "Planung", ago: 3 }],
  },
  {
    owner: "sophie.naeht",
    title: "Leinenkleid mit Taschen",
    cat: "naehen-textil",
    status: "COMPLETED",
    difficulty: 3,
    est: 720,
    act: 660,
    budget: 9500,
    tags: ["leinen", "kleid", "schnittmuster", "taschen"],
    featured: true,
    desc: "Ein weites Sommerkleid aus gewaschenem Leinen mit eingesetzten Nahttaschen (natürlich!). Der Schnitt ist selbst konstruiert, Grösse 38, Länge midi.",
    materials: [["Leinen", "2,8 m"], ["Vlieseline", "0,3 m"]],
    tools: ["Nähmaschine", "Stoffschere", "Stecknadeln", "Bügeleisen"],
    journal: [
      { body: "Stoff vorgewaschen – Leinen läuft gern 5 % ein. Danach zugeschnitten.", milestone: "Zuschnitt", minutes: 120, ago: 33 },
      { body: "Halsausschnitt mit Beleg verarbeitet, Kappnähte an den Seiten.", problem: "Beleg wölbte sich nach aussen.", solution: "Beleg knappkantig untersteppen – liegt jetzt flach.", minutes: 240, ago: 29 },
      { body: "Saum mit 4 cm umgebügelt und blind gesäumt. Trage es seit einer Woche täglich.", milestone: "Fertig", minutes: 300, ago: 25 },
    ],
  },
  {
    owner: "sophie.naeht",
    title: "Upcycling-Jacke aus alten Jeans",
    cat: "naehen-textil",
    status: "IN_PROGRESS",
    difficulty: 4,
    est: 960,
    tags: ["denim", "upcycling", "patchwork"],
    desc: "Vier ausgediente Jeans werden zu einer Patchwork-Jacke. Jede Hose bringt einen anderen Blauton mit.",
    materials: [["Futterstoff", "1,5 m"], ["Canvas", "0,5 m"]],
    tools: ["Nähmaschine", "Stoffschere"],
    journal: [
      { body: "Hosen aufgetrennt und nach Farbton sortiert. Überraschend viel nutzbare Fläche.", ago: 9, minutes: 180 },
      { body: "Rückenteil gepatcht. Die Nähmaschine kämpft mit 6 Lagen Denim.", problem: "Nadel bricht an den Kreuzungsnähten.", solution: "Jeansnadel Stärke 110 und Nähte vorher flach hämmern.", ago: 4, minutes: 240 },
    ],
  },
  {
    owner: "jonas.makes",
    title: "Smarte Leselampe mit ESP32",
    cat: "elektronik-maker",
    status: "COMPLETED",
    difficulty: 4,
    est: 600,
    act: 780,
    budget: 4500,
    tags: ["esp32", "led", "smart-home", "5v"],
    desc: "Eine Leselampe mit warmweissen LEDs, dimmbar per Drehknopf und per App. Gehäuse aus Birke-Multiplex, Elektronik ausschliesslich mit 5 V (Steckernetzteil).",
    materials: [["ESP32 Board", "1 Stk"], ["WS2812B LED-Streifen", "0,5 m"], ["Netzteil 5 V 3 A", "1 Stk"], ["Birke Multiplex", "0,1 m²"]],
    tools: ["Lötkolben", "Multimeter", "Akkuschrauber"],
    journal: [
      { body: "Schaltung auf dem Breadboard getestet. Firmware basiert auf ESPHome.", milestone: "Prototyp", minutes: 240, ago: 20 },
      { body: "LEDs flackerten bei voller Helligkeit.", problem: "Spannungsabfall auf dem Streifen.", solution: "Kondensator 1000 µF am Eingang + Einspeisung an beiden Enden.", minutes: 120, ago: 16 },
      { body: "Gehäuse verleimt, alles verbaut. Läuft seit zwei Wochen stabil.", milestone: "Fertig", minutes: 420, ago: 11 },
    ],
  },
  {
    owner: "aylin.ton",
    title: "Vase in Wulsttechnik",
    cat: "keramik",
    status: "COMPLETED",
    difficulty: 3,
    est: 420,
    act: 480,
    budget: 2500,
    tags: ["wulsttechnik", "steinzeug", "vase"],
    featured: true,
    desc: "Eine bauchige Vase, Wulst für Wulst aufgebaut und aussen glattgestrichen, innen sichtbar gelassen. Glasiert mit einer seidenmatten Transparentglasur über weisser Engobe.",
    materials: [["Steinzeugton", "2,5 kg"], ["Engobe", "100 ml"], ["Transparentglasur", "200 ml"]],
    tools: ["Modellierwerkzeuge"],
    journal: [
      { body: "Boden ausgerollt und die ersten 10 Wülste gesetzt.", milestone: "Boden", minutes: 90, ago: 45 },
      { body: "Ab der Schulter wurde die Wand zu weich und sackte ein.", problem: "Ton zu feucht für die Höhe.", solution: "Mit Heissluftföhn kurz antrocknen und erst dann weiterbauen.", minutes: 120, ago: 43 },
      { body: "Schrühbrand bei 950 °C, Glasurbrand bei 1240 °C. Kein Riss!", milestone: "Gebrannt", minutes: 60, ago: 31 },
    ],
  },
  {
    owner: "aylin.ton",
    title: "Sechs Espressotassen",
    cat: "keramik",
    status: "IN_PROGRESS",
    difficulty: 4,
    est: 600,
    tags: ["drehen", "tassen", "set"],
    desc: "Ein Set Espressotassen auf der Scheibe gedreht – Ziel: sechs gleich grosse. Gar nicht so einfach.",
    materials: [["Porzellanmasse", "2 kg"]],
    tools: ["Töpferscheibe", "Modellierwerkzeuge"],
    journal: [{ body: "Acht gedreht, sechs ausgewählt. Henkel morgen.", ago: 1, minutes: 180 }],
  },
  {
    owner: "nora.upcycling",
    title: "Kommode aus der Brocki – zweites Leben",
    cat: "moebel-upcycling",
    status: "COMPLETED",
    difficulty: 2,
    est: 600,
    act: 540,
    budget: 9000,
    tags: ["kreidefarbe", "kommode", "brockenstube", "messing"],
    featured: true,
    desc: "Für CHF 40 gekauft, abgeschliffen, salbeigrün gestrichen und mit Messinggriffen versehen. Die Schubladen laufen dank Wachs wieder wie neu.",
    materials: [["Kreidefarbe", "750 ml"], ["Hartwachsöl", "100 ml"], ["Schleifpapier", "10 Bogen"]],
    tools: ["Schleifpapier K120–K240", "Pinselset", "Akkuschrauber"],
    journal: [
      { body: "Alter Lack war überraschend hartnäckig. Zwei Tage schleifen.", ago: 50, minutes: 360 },
      { body: "Farbe blätterte an der Kante ab.", problem: "Fettreste auf der Oberfläche.", solution: "Mit Spiritus entfetten, dann Haftgrund.", ago: 48, minutes: 60 },
      { body: "Griffe montiert. Sie steht jetzt im Flur und alle fragen, wo es die zu kaufen gibt.", milestone: "Fertig", ago: 44, minutes: 120 },
    ],
  },
  {
    owner: "felix.druckt",
    title: "Parametrische Kabelhalter",
    cat: "3d-druck",
    status: "COMPLETED",
    difficulty: 2,
    est: 180,
    act: 150,
    budget: 400,
    tags: ["openscad", "petg", "ordnung"],
    desc: "Kabelhalter für die Schreibtischkante, parametrisch in OpenSCAD: Plattenstärke und Kabeldurchmesser einstellbar. Gedruckt in PETG, damit sie nicht spröde werden.",
    materials: [["PETG Filament", "40 g"]],
    tools: ["3D-Drucker"],
    journal: [
      { body: "Erste Version brach beim Aufschieben.", problem: "PLA zu spröde, Wand zu dünn.", solution: "PETG und 3 statt 2 Perimeter.", ago: 12, minutes: 60 },
      { body: "Version 3 passt perfekt. Datei kommt bald als Anleitung.", milestone: "Fertig", ago: 10, minutes: 90 },
    ],
  },
  {
    owner: "clara.papier",
    title: "Japanische Bindung: Skizzenbuch",
    cat: "papier-basteln",
    status: "COMPLETED",
    difficulty: 2,
    est: 180,
    act: 200,
    budget: 1800,
    tags: ["buchbinden", "japanbindung", "skizzenbuch"],
    desc: "Ein A5-Skizzenbuch mit japanischer Vierloch-Bindung. Umschlag aus Graupappe mit Japanpapier bezogen, Inhalt 40 Blatt Aquarellpapier.",
    materials: [["Aquarellpapier 300 g", "20 Blatt"], ["Graupappe 2 mm", "2 Blatt"], ["Japanpapier", "2 Blatt"], ["Buchbinderleim", "30 ml"]],
    tools: ["Falzbein", "Cutter"],
    journal: [{ body: "Bindung mit Leinenzwirn. Das Buch liegt nicht ganz flach – bei japanischer Bindung normal.", milestone: "Fertig", ago: 15, minutes: 200 }],
  },
  {
    owner: "elias.garten",
    title: "Hochbeet aus Lärchenholz",
    cat: "garten-pflanzen",
    status: "COMPLETED",
    difficulty: 2,
    est: 480,
    act: 600,
    budget: 22000,
    tags: ["hochbeet", "laerche", "balkon"],
    desc: "Ein Balkon-Hochbeet 120 × 60 cm auf Rollen, aus unbehandelter Lärche. Innen mit Noppenfolie ausgekleidet.",
    materials: [["Kiefer", "1,5 m²"]],
    tools: ["Akkuschrauber", "Japansäge"],
    journal: [
      { body: "Gewicht unterschätzt: voll befüllt fast 200 kg.", problem: "Balkon-Traglast.", solution: "Nur 2/3 Erde, unten Blähton – und Traglast beim Vermieter erfragt.", ago: 60, minutes: 120 },
      { body: "Erste Radieschen geerntet!", milestone: "Ernte", ago: 20 },
    ],
  },
  {
    owner: "mira.strickt",
    title: "Raglanpullover von oben",
    cat: "haekeln-stricken",
    status: "IN_PROGRESS",
    difficulty: 3,
    est: 2400,
    budget: 14000,
    tags: ["raglan", "top-down", "merino", "pullover"],
    desc: "Ein klassischer Raglanpullover, top-down gestrickt, damit die Länge beim Anprobieren angepasst werden kann. Farbe: Tannengrün.",
    materials: [["Merinowolle", "650 g"]],
    tools: ["Rundstricknadel 4 mm"],
    journal: [
      { body: "Maschenprobe gewaschen und gespannt: 22 M × 30 R. Passt.", milestone: "Maschenprobe", ago: 18, minutes: 90 },
      { body: "Passe fertig, Ärmelmaschen stillgelegt.", milestone: "Passe", ago: 8, minutes: 480 },
    ],
  },
  {
    owner: "luca.schmuck",
    title: "Siegelring aus geerbtem Silber",
    cat: "schmuck-accessoires",
    status: "COMPLETED",
    difficulty: 5,
    est: 600,
    act: 720,
    tags: ["silber", "giessen", "siegelring"],
    desc: "Aus einem alten Silberbesteck meiner Grossmutter wurde ein Siegelring. Eingeschmolzen, gegossen, gefeilt und poliert.",
    materials: [],
    tools: ["Stechbeitel-Set"],
    journal: [{ body: "Guss im Sepiaschalen-Verfahren. Zwei Fehlgüsse, dann hat es geklappt.", problem: "Lufteinschlüsse.", solution: "Gusskanal vergrössert und Schale besser entlüftet.", milestone: "Fertig", ago: 35, minutes: 720 }],
  },
  {
    owner: "hanna.malt",
    title: "Aquarell-Wanderbuch Berner Oberland",
    cat: "malen-zeichnen",
    status: "IN_PROGRESS",
    difficulty: 2,
    est: 1200,
    tags: ["aquarell", "skizzenbuch", "berge"],
    desc: "Jede Wanderung eine Doppelseite. Reduzierte Palette mit nur fünf Farben.",
    materials: [["Aquarellpapier 300 g", "1 Buch"]],
    tools: ["Pinselset"],
    journal: [
      { body: "Oeschinensee: das Türkis war mit fünf Farben eine Herausforderung.", ago: 7, minutes: 90 },
      { body: "Niesen im Nebel – weniger ist mehr.", ago: 2, minutes: 60 },
    ],
  },
];

const REMIXES: { owner: string; of: string; title: string; deviations: string; status: ProjectStatus }[] = [
  { owner: "mira.strickt", of: "Markttasche aus Baumwollgarn", title: "Markttasche in Leinengarn", deviations: "Leinengarn statt Baumwolle, kürzere Henkel und ein Innenfach.", status: "COMPLETED" },
  { owner: "sophie.naeht", of: "Markttasche aus Baumwollgarn", title: "Netztasche für den Wochenmarkt", deviations: "Doppelter Boden für Gläser.", status: "IN_PROGRESS" },
  { owner: "elias.garten", of: "Dreibeiniger Melkschemel aus Arve", title: "Gartenhocker aus Robinie", deviations: "Robinie für draussen, Sitzfläche dicker.", status: "COMPLETED" },
  { owner: "hanna.malt", of: "Kommode aus der Brocki – zweites Leben", title: "Kinderzimmerkommode in Ocker", deviations: "Ocker statt Salbei, Holzknöpfe statt Messing.", status: "COMPLETED" },
];

const TUTORIALS = [
  {
    author: "lena.haekelt",
    project: "Markttasche aus Baumwollgarn",
    title: "Markttasche im Netzmuster häkeln",
    cat: "haekeln-stricken",
    difficulty: 2,
    minutes: 600,
    summary: "Von der ersten Luftmasche bis zum Henkel: eine robuste Einkaufstasche im Netzmuster. Ideal als erstes grösseres Häkelprojekt.",
    materials: [["Baumwollgarn", "300 g"], ["Maschenmarkierer", "4 Stk"]],
    tools: [["Häkelnadel 4 mm", ""], ["Wollnadel", ""]],
    steps: [
      { title: "Fadenring und erste Runde", body: "Lege einen Fadenring und häkle 8 feste Maschen hinein. Zieh den Ring fest zu und schliesse die Runde mit einer Kettmasche.", minutes: 15, tip: "Ein Maschenmarkierer am Rundenanfang erspart dir später das Zählen." },
      { title: "Boden in Runden zunehmen", body: "Nimm in jeder Runde gleichmässig 8 Maschen zu, bis der Boden etwa 22 cm Durchmesser hat (ca. 12 Runden). Der Boden muss flach liegen.", minutes: 120, tip: "Wellt sich der Boden, nimmst du zu viel zu. Wölbt er sich, zu wenig." },
      { title: "Netzmuster beginnen", body: "Häkle *1 Stäbchen, 2 Luftmaschen, 2 Maschen überspringen* rundherum. Jede Runde versetzt beginnen.", minutes: 300 },
      { title: "Rand verstärken", body: "Häkle 4 Runden feste Maschen für einen stabilen Rand.", minutes: 60 },
      { title: "Henkel häkeln", body: "Für jeden Henkel 60 Luftmaschen anschlagen und mit festen Maschen doppelt behäkeln. Sicher vernähen.", minutes: 90, tip: "Doppelt gehäkelte Henkel leiern weniger aus." },
    ],
  },
  {
    author: "mattia.holz",
    project: "Dreibeiniger Melkschemel aus Arve",
    title: "Melkschemel mit Keilzapfen bauen",
    cat: "holz",
    difficulty: 3,
    minutes: 480,
    summary: "Ein traditioneller Dreibein-Schemel ganz ohne Schrauben. Du lernst schräge Bohrungen, Keilzapfen und eine natürliche Ölbehandlung.",
    materials: [["Arve", "0,2 m²"], ["Holzleim D3", "50 ml"], ["Leinölfirnis", "100 ml"]],
    tools: [["Japansäge", ""], ["Stechbeitel-Set", ""], ["Akkuschrauber", "mit 25-mm-Forstnerbohrer"]],
    steps: [
      { title: "Sitzfläche zuschneiden", body: "Säge eine runde Sitzfläche mit 30 cm Durchmesser aus einem 38 mm starken Brett. Kanten mit dem Hobel brechen.", minutes: 60, safety: "Werkstück immer fest einspannen und vom Körper weg sägen.", safetyKinds: ["SHARP_TOOLS"] },
      { title: "Bohrlehre bauen", body: "Säge einen Restholzklotz auf 12° an. Er führt den Bohrer für alle drei Beine im gleichen Winkel.", minutes: 30, tip: "Diese Lehre ist das Geheimnis eines wackelfreien Schemels." },
      { title: "Beinlöcher bohren", body: "Markiere die Löcher im Abstand von 120° auf einem Kreis mit 10 cm Radius. Bohre mit Lehre durch.", minutes: 45, safety: "Schutzbrille tragen. Beim Austritt des Bohrers splittert das Holz – Opferholz unterlegen.", safetyKinds: ["POWER_TOOLS"] },
      { title: "Beine und Keile", body: "Beine auf 45 cm ablängen, Zapfen auf 25 mm abrunden und einsägen. Keile aus Hartholz zuschneiden.", minutes: 120 },
      { title: "Verleimen und verkeilen", body: "Leim in die Löcher, Beine einschlagen, Keile quer zur Faser der Sitzfläche eintreiben. Überstand bündig absägen.", minutes: 60 },
      { title: "Ölen", body: "Zweimal mit Leinölfirnis behandeln, dazwischen 24 h trocknen.", minutes: 30, safety: "Ölgetränkte Lappen können sich selbst entzünden. Ausgebreitet trocknen lassen oder in Wasser legen.", safetyKinds: ["CHEMICALS"] },
    ],
  },
  {
    author: "aylin.ton",
    project: "Vase in Wulsttechnik",
    title: "Gefässe in Wulsttechnik aufbauen",
    cat: "keramik",
    difficulty: 3,
    minutes: 420,
    summary: "Die älteste Aufbautechnik der Keramik – ohne Töpferscheibe. Du lernst, Wülste gleichmässig zu rollen, zu verbinden und eine stabile Wand aufzubauen.",
    materials: [["Steinzeugton", "2,5 kg"], ["Engobe", "100 ml"]],
    tools: [["Modellierwerkzeuge", ""], ["Rollholz", ""]],
    steps: [
      { title: "Ton vorbereiten", body: "Knete den Ton im Stierkopf-Verfahren, bis keine Luftblasen mehr vorhanden sind.", minutes: 20 },
      { title: "Boden ausrollen", body: "Rolle eine 8 mm starke Platte aus und schneide einen Kreis mit 10 cm Durchmesser.", minutes: 15 },
      { title: "Wülste rollen und setzen", body: "Rolle fingerdicke Wülste. Raue die Kontaktflächen auf, bestreiche sie mit Schlicker und setze Wulst auf Wulst.", minutes: 180, tip: "Arbeite in Etappen: Nach 6–8 Wülsten den Ton etwas anziehen lassen." },
      { title: "Wand verstreichen", body: "Verstreiche die Wülste aussen mit einem Modellierholz von unten nach oben. Innen darf die Struktur sichtbar bleiben.", minutes: 60 },
      { title: "Trocknen und brennen", body: "Langsam unter Folie trocknen lassen. Schrühbrand bei 950 °C, Glasurbrand nach Herstellerangabe.", minutes: 30, safety: "Brennöfen erreichen über 1200 °C. Nur nach Einweisung bedienen.", safetyKinds: ["HEAT"] },
    ],
  },
  {
    author: "jonas.makes",
    project: "Smarte Leselampe mit ESP32",
    title: "LED-Streifen sicher mit dem ESP32 steuern",
    cat: "elektronik-maker",
    difficulty: 4,
    minutes: 240,
    summary: "Adressierbare LEDs am ESP32 – mit Pegelwandler, Kondensator und sauberer Stromversorgung. Ausschliesslich Schutzkleinspannung (5 V).",
    materials: [["ESP32 Board", "1 Stk"], ["WS2812B LED-Streifen", "0,5 m"], ["Netzteil 5 V 3 A", "1 Stk"]],
    tools: [["Lötkolben", ""], ["Multimeter", ""]],
    steps: [
      { title: "Strombedarf berechnen", body: "Jede LED zieht bei Vollweiss bis 60 mA. 30 LEDs → 1,8 A. Wähle ein Netzteil mit Reserve.", minutes: 15 },
      { title: "Schaltung aufbauen", body: "5 V und GND vom Netzteil direkt an den Streifen, Datenleitung über 330 Ω an GPIO 16. 1000-µF-Kondensator am Eingang.", minutes: 60, safety: "Nur fertige, geprüfte Steckernetzteile verwenden. Niemals an 230 V arbeiten.", safetyKinds: ["ELECTRICITY"] },
      { title: "Löten", body: "Kabel verzinnen, Lötpads verzinnen, dann verbinden. Mit Schrumpfschlauch isolieren.", minutes: 60, safety: "Lötkolben wird über 300 °C heiss. Ablage nutzen, gut lüften.", safetyKinds: ["HEAT", "DUST"] },
      { title: "Firmware flashen", body: "ESPHome installieren, Konfiguration mit light: platform: neopixelbus anlegen und per USB flashen.", minutes: 45 },
    ],
  },
];

const COMMUNITIES = [
  { slug: "haekelkreis-zuerich", name: "Häkelkreis Zürich", cat: "haekeln-stricken", owner: "lena.haekelt", desc: "Wir treffen uns jeden zweiten Donnerstag im Kreis 4 – und hier dazwischen. Anfänger:innen herzlich willkommen.", region: "Zürich", featured: true },
  { slug: "slow-fashion-naehen", name: "Slow Fashion Nähen", cat: "naehen-textil", owner: "sophie.naeht", desc: "Kleidung selbst nähen, reparieren, umarbeiten. Tipps zu Stoffen aus fairer Produktion.", featured: true },
  { slug: "werkbank-holz", name: "Werkbank Holz", cat: "holz", owner: "mattia.holz", desc: "Massivholz, Handwerkzeug, Holzverbindungen. Fragen sind willkommen, Spanplatten-Witze auch." },
  { slug: "brocki-upcycling", name: "Brocki-Funde & Upcycling", cat: "moebel-upcycling", owner: "nora.upcycling", desc: "Zeig deine Brockenstube-Schätze – vorher und nachher." },
  { slug: "maker-basel", name: "Maker Basel", cat: "elektronik-maker", owner: "jonas.makes", desc: "Löten, Drucken, Programmieren. Monatliches Repair-Café im Gundeli.", region: "Basel" },
  { slug: "keramik-werkstatt", name: "Offene Keramikwerkstatt", cat: "keramik", owner: "aylin.ton", desc: "Austausch zu Ton, Glasuren und Brennkurven.", visibility: "REQUEST" as const },
];

const POSTS: { author: string; body: string; cat?: string; project?: string; ago: number }[] = [
  { author: "lena.haekelt", body: "Granny Nummer 24 ist fertig – Halbzeit bei der Herbstdecke! Wer verrät mir den besten Trick zum Fäden-Vernähen?", cat: "haekeln-stricken", project: "Granny-Square-Decke in Herbstfarben", ago: 0.2 },
  { author: "mattia.holz", body: "Neue Arvenbretter aus dem Engadin sind angekommen. Dieser Duft in der Werkstatt …", cat: "holz", ago: 0.6 },
  { author: "aylin.ton", body: "Acht Espressotassen gedreht, sechs ausgewählt. Die anderen zwei werden Pinselbecher. Nichts wird verschwendet.", cat: "keramik", project: "Sechs Espressotassen", ago: 1 },
  { author: "sophie.naeht", body: "Kleiner Reminder: Leinen IMMER vorwaschen. Meine erste Bluse ist heute bauchfrei. 😅\n\nIm Ernst: 5 % Einlaufen ist normal.", cat: "naehen-textil", ago: 1.4 },
  { author: "jonas.makes", body: "Repair-Café am Samstag im Gundeli: Wir hatten 14 Geräte, 11 laufen wieder. Am liebsten: ein Toaster von 1978.", cat: "elektronik-maker", ago: 2 },
  { author: "nora.upcycling", body: "Heute in der Brocki für CHF 15: ein Nachttisch aus den 60ern. Furnier leicht beschädigt, aber die Form! Projekt startet am Wochenende.", cat: "moebel-upcycling", ago: 2.5 },
  { author: "felix.druckt", body: "Wer braucht noch Kabelhalter für dicke Tischplatten? Die OpenSCAD-Datei hat jetzt einen Parameter für bis zu 50 mm.", cat: "3d-druck", project: "Parametrische Kabelhalter", ago: 3 },
  { author: "mira.strickt", body: "Passe fertig! Jetzt kommt der meditative Teil: glatt rechts in Runden bis zum Bund.", cat: "haekeln-stricken", project: "Raglanpullover von oben", ago: 3.5 },
  { author: "hanna.malt", body: "Niesen im Nebel. Manchmal ist das Weisse des Papiers die schönste Farbe.", cat: "malen-zeichnen", project: "Aquarell-Wanderbuch Berner Oberland", ago: 4 },
  { author: "clara.papier", body: "Für alle, die mit Buchbinden anfangen wollen: Ein Falzbein aus Knochen ist die beste 12-Franken-Investition.", cat: "papier-basteln", ago: 5 },
  { author: "elias.garten", body: "Saatgut-Tausch am Thunersee am 15.: Ich bringe Pro-Specie-Rara-Tomaten mit. Wer kommt?", cat: "garten-pflanzen", ago: 6 },
  { author: "luca.schmuck", body: "Altsilber hat eine Geschichte. Dieser Ring war mal ein Kaffeelöffel – und davor ein Erbstück.", cat: "schmuck-accessoires", project: "Siegelring aus geerbtem Silber", ago: 7 },
  { author: "mattia.holz", body: "Probeverbindungen für das Schwalbenschwanz-Regal in Kiefer. Nummer 3 ist endlich spaltfrei.", cat: "holz", project: "Wandregal mit Schwalbenschwanz", ago: 8 },
  { author: "sophie.naeht", body: "Denim-Jacke: Rückenteil gepatcht. Jeansnadel 110 und Nähte flach hämmern – sonst bricht die Nadel.", cat: "naehen-textil", project: "Upcycling-Jacke aus alten Jeans", ago: 9 },
  { author: "werkraum", body: "Willkommen im WERKRAUM! 🧶 Diese Woche im Fokus: Häkeln, Stricken und Nähen. Teilt eure aktuellen Projekte – auch die halbfertigen. Gerade die.", ago: 10 },
];

const COMMENTS = [
  "Wunderschön! Welches Garn hast du genau verwendet?",
  "Das motiviert mich, mein eigenes Projekt endlich anzufangen.",
  "Danke für den Tipp mit der Bohrlehre – genau das hat mir gefehlt.",
  "Hast du die Masse irgendwo notiert? Würde das gern nachbauen.",
  "Die Farbkombination ist grossartig.",
  "Wie lange hat das ungefähr gedauert?",
  "Genau so ging es mir auch – gut zu wissen, dass das normal ist.",
  "Gespeichert für den nächsten Winter!",
];

async function demo(adminId: string) {
  if (await db.userProfile.findUnique({ where: { handle: "lena.haekelt" } })) {
    console.log("→ Demo-Daten existieren bereits – übersprungen.");
    return;
  }
  const pw = await hashPassword(process.env.DEMO_PASSWORD ?? "Werkraum-Demo-2026!");
  const users = new Map<string, string>();
  users.set("werkraum", adminId);
  for (const [i, c] of CREATORS.entries()) {
    const u = await db.user.create({
      data: {
        email: `${c.handle.replace(/\./g, "-")}@demo.werkraum.local`,
        passwordHash: pw,
        emailVerifiedAt: new Date(),
        adultConfirmedAt: new Date(),
        termsAcceptedAt: new Date(),
        onboardedAt: new Date(),
        lastSeenAt: hours(i * 3),
        createdAt: days(90 - i * 4),
        profile: { create: { handle: c.handle, displayName: c.name, bio: c.bio, region: c.region, country: c.country ?? "CH", categories: c.cats, dmPolicy: "EVERYONE" } },
        preference: { create: { interests: c.cats } },
      },
    });
    users.set(c.handle, u.id);
  }
  const uid = (h: string) => users.get(h)!;

  // Folgen – dichtes, aber nicht vollständiges Netz
  const handles = [...users.keys()];
  for (const [i, a] of handles.entries()) {
    for (const [j, b] of handles.entries()) {
      if (a === b) continue;
      if ((i * 7 + j * 3) % 5 < 2 || b === "lena.haekelt" || b === "werkraum") {
        await db.follow.create({ data: { followerId: uid(a), followeeId: uid(b), createdAt: days(((i + j) % 60) + 1) } });
      }
    }
  }

  // Projekte
  const projectIds = new Map<string, string>();
  for (const [i, p] of PROJECTS.entries()) {
    const created = days(p.journal[0]?.ago ? p.journal[0].ago + 2 : 10);
    const pr = await db.project.create({
      data: {
        ownerId: uid(p.owner),
        slug: slug(p.title),
        title: p.title,
        description: p.desc,
        category: p.cat,
        tags: p.tags,
        difficulty: p.difficulty,
        estimatedMinutes: p.est,
        actualMinutes: p.act,
        budgetMinor: p.budget,
        status: p.status,
        isFeatured: !!p.featured,
        publishedAt: created,
        completedAt: p.status === "COMPLETED" ? days(p.journal[p.journal.length - 1]?.ago ?? 1) : null,
        createdAt: created,
        updatedAt: days(p.journal[p.journal.length - 1]?.ago ?? 1),
        qualityScore: 0.6 + (p.journal.length > 2 ? 0.2 : 0),
        viewCount: 120 + ((i * 97) % 900),
        materials: { create: p.materials.map(([name, quantity], k) => ({ name, quantity, position: k })) },
        tools: { create: p.tools.map((name, k) => ({ name, position: k })) },
        updates: {
          create: p.journal.map((j) => ({
            authorId: uid(p.owner),
            body: j.body,
            milestone: j.milestone,
            problem: j.problem,
            solution: j.solution,
            minutes: j.minutes,
            happenedAt: days(j.ago),
            createdAt: days(j.ago),
          })),
        },
      },
    });
    projectIds.set(p.title, pr.id);
    await db.userProfile.update({ where: { userId: uid(p.owner) }, data: { projectCount: { increment: 1 } } });
  }

  // Nachbauten
  for (const r of REMIXES) {
    const orig = projectIds.get(r.of)!;
    const o = await db.project.findUniqueOrThrow({ where: { id: orig }, include: { materials: true } });
    const pr = await db.project.create({
      data: {
        ownerId: uid(r.owner),
        slug: slug(r.title),
        title: r.title,
        description: `Nachbau von „${o.title}“. ${r.deviations}`,
        category: o.category,
        tags: o.tags.slice(0, 3),
        difficulty: o.difficulty,
        estimatedMinutes: o.estimatedMinutes,
        status: r.status,
        publishedAt: days(5),
        createdAt: days(6),
        remixNote: r.deviations,
        materials: { create: o.materials.map((m, k) => ({ name: m.name, quantity: m.quantity, position: k })) },
        incoming: undefined,
        outgoing: { create: { toId: orig, kind: "REMIX", deviations: r.deviations } },
        updates: { create: [{ authorId: uid(r.owner), body: `Angefangen – inspiriert von @${(await db.userProfile.findUniqueOrThrow({ where: { userId: o.ownerId } })).handle}. ${r.deviations}`, happenedAt: days(5) }] },
      },
    });
    projectIds.set(r.title, pr.id);
    await db.project.update({ where: { id: orig }, data: { remixCount: { increment: 1 } } });
    await db.userProfile.update({ where: { userId: uid(r.owner) }, data: { projectCount: { increment: 1 } } });
  }

  // Anleitungen mit Versionen
  for (const t of TUTORIALS) {
    const tutorial = await db.tutorial.create({
      data: {
        authorId: uid(t.author),
        slug: slug(t.title),
        title: t.title,
        summary: t.summary,
        category: t.cat,
        difficulty: t.difficulty,
        minutes: t.minutes,
        projectId: projectIds.get(t.project),
        state: "PUBLISHED",
        publishedAt: days(12),
        isFeatured: true,
        viewCount: 400,
        completionCount: 12,
        safetyKinds: [...new Set(t.steps.flatMap((s) => (s as { safetyKinds?: string[] }).safetyKinds ?? []))],
      },
    });
    const version = await db.tutorialVersion.create({
      data: {
        tutorialId: tutorial.id,
        version: 1,
        changeNote: "Erste Veröffentlichung",
        materials: t.materials.map(([name, quantity]) => ({ name, quantity })),
        tools: t.tools.map(([name, note]) => ({ name, note })),
        publishedAt: days(12),
        steps: {
          create: t.steps.map((s, k) => ({
            stableKey: randomUUID(),
            position: k,
            title: s.title,
            body: s.body,
            minutes: s.minutes,
            tip: (s as { tip?: string }).tip,
            safety: (s as { safety?: string }).safety,
            safetyKinds: (s as { safetyKinds?: string[] }).safetyKinds ?? [],
          })),
        },
      },
    });
    await db.tutorial.update({ where: { id: tutorial.id }, data: { currentVersionId: version.id } });
    await db.post.create({ data: { authorId: uid(t.author), kind: "TUTORIAL", body: `Neue Anleitung: ${t.title}. ${t.summary}`, tutorialId: tutorial.id, category: t.cat, publishedAt: days(12), qualityScore: 0.8 } });
  }

  // Communities
  for (const c of COMMUNITIES) {
    const members = handles.filter((h, i) => h === c.owner || (i + c.slug.length) % 3 !== 0);
    await db.community.create({
      data: {
        slug: c.slug,
        name: c.name,
        description: c.desc,
        category: c.cat,
        visibility: c.visibility ?? "PUBLIC",
        ownerId: uid(c.owner),
        region: c.region,
        isFeatured: !!c.featured,
        memberCount: members.length,
        rules: {
          create: [
            { position: 0, title: "Freundlich bleiben", body: "Kritik am Werk, nie an der Person." },
            { position: 1, title: "Originale nennen", body: "Wer nachbaut oder Muster verwendet, nennt die Quelle." },
            { position: 2, title: "Keine Werbung ohne Bezug", body: "Eigene Produkte nur mit Projektbezug teilen." },
          ],
        },
        members: { create: members.map((h) => ({ userId: uid(h), role: h === c.owner ? "OWNER" : "MEMBER" })) },
      },
    });
  }
  const zh = await db.community.findUniqueOrThrow({ where: { slug: "haekelkreis-zuerich" } });
  await db.post.create({ data: { authorId: uid("lena.haekelt"), communityId: zh.id, body: "Nächstes Treffen: Donnerstag, 19 Uhr im Café Zähringer. Thema: Amigurumi für Anfänger:innen. Bringt Nadel 3 mm mit!", isPinned: true, isAnnouncement: true, category: "haekeln-stricken", publishedAt: hours(20) } });
  await db.communityChallenge.create({ data: { communityId: zh.id, title: "Novemberdecke", description: "Ein Granny pro Tag – wer schafft 30?", startsAt: days(3), endsAt: days(-27) } });

  // Beiträge, Kommentare, Likes
  const postIds: string[] = [];
  for (const [i, p] of POSTS.entries()) {
    const post = await db.post.create({
      data: {
        authorId: uid(p.author),
        body: p.body,
        category: p.cat,
        projectId: p.project ? projectIds.get(p.project) : undefined,
        kind: p.project ? "PROJECT_SHOWCASE" : "TEXT",
        publishedAt: days(p.ago),
        createdAt: days(p.ago),
        qualityScore: p.project ? 0.75 : 0.55,
      },
    });
    postIds.push(post.id);
    const likers = handles.filter((h, j) => h !== p.author && (i + j) % 3 !== 1);
    for (const h of likers) await db.reaction.create({ data: { userId: uid(h), targetType: "POST", targetId: post.id } });
    const n = (i % 3) + 1;
    for (let k = 0; k < n; k++) {
      const author = pick(handles.filter((h) => h !== p.author), i + k * 5);
      await db.comment.create({ data: { authorId: uid(author), targetType: "POST", targetId: post.id, postId: post.id, body: pick(COMMENTS, i * 3 + k), createdAt: days(Math.max(0, p.ago - 0.1)) } });
    }
    await db.post.update({ where: { id: post.id }, data: { likeCount: likers.length, commentCount: n } });
    await db.userProfile.update({ where: { userId: uid(p.author) }, data: { postCount: { increment: 1 } } });
  }
  // Fortschrittseinträge zusätzlich im Feed
  const recentUpdates = await db.projectUpdate.findMany({ where: { happenedAt: { gte: days(10) } }, include: { project: true } });
  for (const u of recentUpdates) {
    await db.post.create({ data: { authorId: u.authorId, kind: "PROJECT_UPDATE", body: u.body, projectId: u.projectId, projectUpdateId: u.id, category: u.project.category, publishedAt: u.happenedAt, qualityScore: 0.7, likeCount: 3 } });
  }

  // Projekt-Interaktionen
  for (const [title, id] of projectIds) {
    const likers = handles.filter((_, j) => (j + title.length) % 2 === 0);
    for (const h of likers) {
      await db.reaction.create({ data: { userId: uid(h), targetType: "PROJECT", targetId: id } }).catch(() => {});
    }
    const savers = handles.filter((_, j) => (j + title.length) % 3 === 0);
    for (const h of savers) await db.bookmark.create({ data: { userId: uid(h), targetType: "PROJECT", targetId: id } }).catch(() => {});
    await db.project.update({ where: { id }, data: { likeCount: likers.length, saveCount: savers.length } });
  }
  const q = projectIds.get("Dreibeiniger Melkschemel aus Arve")!;
  await db.comment.create({ data: { authorId: uid("elias.garten"), targetType: "PROJECT", targetId: q, body: "Welchen Durchmesser haben die Zapfen? 25 mm?", isQuestion: true } });
  await db.comment.create({ data: { authorId: uid("mattia.holz"), targetType: "PROJECT", targetId: q, body: "Genau, 25 mm – bei Arve reicht das locker.", isAnswer: true } });
  await db.project.update({ where: { id: q }, data: { commentCount: 2 } });

  // Shops & Produkte (ohne Stripe nicht kaufbar, aber sichtbar)
  const shops = [
    { owner: "lena.haekelt", slug: "lenas-maschen", name: "Lenas Maschen", tagline: "Gehäkeltes aus Naturgarn", products: [["Markttasche Netzmuster, Natur", "UNIQUE", 5900, "Markttasche aus Baumwollgarn"], ["Granny-Kissen Senf", "SMALL_BATCH", 4500, null], ["Häkelset Markttasche", "KIT", 3400, "Markttasche aus Baumwollgarn"]] },
    { owner: "aylin.ton", slug: "atelier-aylin", name: "Atelier Aylin", tagline: "Keramik aus Winterthur", products: [["Wulstvase, seidenmatt", "UNIQUE", 12000, "Vase in Wulsttechnik"], ["Espressotasse, 2er-Set", "SMALL_BATCH", 6800, "Sechs Espressotassen"]] },
    { owner: "mattia.holz", slug: "bottega-mattia", name: "Bottega Mattia", tagline: "Massivholz aus dem Tessin", products: [["Melkschemel Arve", "MADE_TO_ORDER", 24000, "Dreibeiniger Melkschemel aus Arve"], ["Schneidebrett Nussbaum", "SMALL_BATCH", 7900, null]] },
  ] as const;
  for (const s of shops) {
    const shop = await db.shop.create({
      data: {
        ownerId: uid(s.owner),
        slug: s.slug,
        name: s.name,
        tagline: s.tagline,
        description: `${s.tagline}. Jedes Stück entsteht von Hand in meiner Werkstatt.`,
        status: "ACTIVE",
        shippingPolicy: "Versand mit der Schweizerischen Post innert 3 Werktagen. Abholung nach Absprache möglich.",
        returnPolicy: "Rückgabe innert 14 Tagen in unbenutztem Zustand. Auf Bestellung gefertigte Stücke sind vom Umtausch ausgeschlossen.",
        verification: { create: { state: "VERIFIED", legalName: CREATORS.find((c) => c.handle === s.owner)!.name, country: "CH" } },
      },
    });
    await db.roleAssignment.create({ data: { userId: uid(s.owner), role: "VERIFIED_SELLER" } });
    for (const [title, kind, price, project] of s.products) {
      const product = await db.product.create({
        data: {
          shopId: shop.id,
          slug: slug(title),
          title,
          description: `${title} – handgefertigt von ${s.name}. Jedes Stück ist leicht unterschiedlich; das ist kein Fehler, sondern Handwerk.`,
          kind,
          category: CREATORS.find((c) => c.handle === s.owner)!.cats[0]!,
          priceMinor: price,
          status: "ACTIVE",
          materials: kind === "KIT" ? "Baumwollgarn, Anleitung, Maschenmarkierer" : "Naturmaterialien",
          productionDays: kind === "MADE_TO_ORDER" ? 14 : 3,
          projectId: project ? projectIds.get(project) : null,
          publishedAt: days(8),
          inventory: { create: { onHand: kind === "UNIQUE" ? 1 : 6 } },
        },
      });
      void product;
    }
  }

  // Redaktionelle Kollektionen
  const featured = await db.project.findMany({ where: { isFeatured: true }, select: { id: true } });
  await db.editorialCollection.create({ data: { slug: "erste-projekte", title: "Dein erstes Projekt", kicker: "Für Einsteiger:innen", description: "Fünf Projekte, die an einem Wochenende gelingen.", items: featured.slice(0, 4).map((p) => ({ type: "project", id: p.id })), position: 0 } });
  const tuts = await db.tutorial.findMany({ select: { id: true } });
  await db.editorialCollection.create({ data: { slug: "werkstattwissen", title: "Werkstattwissen", kicker: "Anleitungen", description: "Techniken, die bleiben.", items: tuts.map((t) => ({ type: "tutorial", id: t.id })), position: 1 } });
  await db.editorialCollection.create({ data: { slug: "herbst-am-werktisch", title: "Herbst am Werktisch", kicker: "Saisonal", description: "Decken, Pullover und warme Farben.", season: "herbst", items: [projectIds.get("Granny-Square-Decke in Herbstfarben"), projectIds.get("Raglanpullover von oben")].filter(Boolean).map((id) => ({ type: "project", id })), position: 2 } });

  // Blogartikel
  const art = await db.blogArticle.create({
    data: {
      authorId: uid("sophie.naeht"),
      slug: "warum-ich-nur-noch-leinen-naehe",
      title: "Warum ich nur noch Leinen nähe",
      dek: "Ein Erfahrungsbericht über einen Stoff, der mit jedem Waschen schöner wird – und über die Kunst des Vorwaschens.",
      state: "PUBLISHED",
      publishedAt: days(4),
      readingMinutes: 4,
      tags: ["leinen", "slow-fashion"],
      blocks: [
        { type: "paragraph", text: "Vor drei Jahren habe ich mein erstes Kleidungsstück aus Leinen genäht. Heute besteht fast meine ganze Sommergarderobe daraus. Hier ist, was ich gelernt habe." },
        { type: "heading", level: 2, text: "Vorwaschen ist nicht optional" },
        { type: "paragraph", text: "Leinen läuft beim ersten Waschen um bis zu **5 Prozent** ein. Wer das ignoriert, näht für eine kleinere Version von sich selbst." },
        { type: "callout", tone: "tip", text: "Wasche den Stoff so, wie du später das fertige Kleidungsstück waschen wirst – inklusive Trockner, falls du ihn nutzt." },
        { type: "heading", level: 2, text: "Kappnähte statt Overlock" },
        { type: "paragraph", text: "Leinen franst. Kappnähte schliessen die Kanten sauber ein und sehen von innen fast so gut aus wie von aussen." },
        { type: "quote", text: "Leinen ist der einzige Stoff, der mit dem Alter würdevoller wird.", cite: "Meine Grossmutter" },
        { type: "projectCard", projectId: projectIds.get("Leinenkleid mit Taschen") },
      ],
      plainText: "Vor drei Jahren habe ich mein erstes Kleidungsstück aus Leinen genäht. Leinen läuft beim ersten Waschen um bis zu 5 Prozent ein. Kappnähte statt Overlock.",
      projects: { create: [{ projectId: projectIds.get("Leinenkleid mit Taschen")! }] },
      categoryId: (await db.articleCategory.findUniqueOrThrow({ where: { slug: "erfahrungsbericht" } })).id,
    },
  });
  await db.post.create({ data: { authorId: uid("sophie.naeht"), kind: "ARTICLE", body: "Neuer Artikel im Blog – über Leinen, Geduld und Kappnähte.", articleId: art.id, category: "naehen-textil", publishedAt: days(4) } });

  console.log(`→ Demo-Community: ${CREATORS.length} Creator, ${projectIds.size} Projekte, ${TUTORIALS.length} Anleitungen, ${COMMUNITIES.length} Communities.`);
  console.log(`  Demo-Login z. B. lena-haekelt@demo.werkraum.local / ${process.env.DEMO_PASSWORD ? "(DEMO_PASSWORD)" : "Werkraum-Demo-2026!"}`);
}

async function main() {
  await baseData();
  const a = await admin();
  if (process.env.SEED_DEMO === "true") await demo(a.id);
  console.log("✓ Seed abgeschlossen");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
