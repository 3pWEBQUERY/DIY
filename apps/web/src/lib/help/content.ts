/**
 * Inhalte des Hilfe-Centers (/hilfe, /hilfe/[bereich]).
 *
 * Antworten sind schlichter Text mit wenigen Auszeichnungen, damit sie durchsuchbar und testbar bleiben:
 * - `[Text](/pfad)` → Link (intern oder https://…)
 * - `**fett**`
 * - Absätze durch Leerzeile, Aufzählungen mit „- “ am Zeilenanfang
 * - `{fee}`, `{holdDays}` … → Werte aus den Systemeinstellungen (siehe `HelpVars`)
 *
 * Jede Aussage muss dem tatsächlichen Verhalten der App entsprechen (Pfade, Beschriftungen, Fristen).
 */

export type HelpIcon =
  | "user"
  | "settings"
  | "feed"
  | "hammer"
  | "book"
  | "pen"
  | "users"
  | "message"
  | "compass"
  | "ruler"
  | "bag"
  | "store"
  | "sparkles"
  | "shield"
  | "phone"
  | "lock";

export type HelpArticle = {
  /** Anker innerhalb der Bereichsseite (#id), eindeutig über alle Bereiche */
  id: string;
  q: string;
  a: string;
  /** Abweichende Antwort, wenn die Seite in der iOS-App geöffnet ist (keine Web-Preise, kein Web-Checkout) */
  inApp?: string;
  /** Zusätzliche Suchbegriffe, die nicht im Text stehen */
  tags?: string;
};

export type HelpCategory = {
  id: string;
  title: string;
  icon: HelpIcon;
  summary: string;
  /** Direkt zu den passenden Stellen in der App */
  links: { href: string; label: string }[];
  articles: HelpArticle[];
};

export type HelpVars = {
  brand: string;
  minAge: number;
  fee: string;
  proFee: string;
  supportFee: string;
  iosMarkup: string;
  holdDays: string;
  autoCompleteDays: string;
  reservationMinutes: number;
  proMonth: string;
  proYear: string;
};

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "konto",
    title: "Konto & Anmeldung",
    icon: "user",
    summary: "Registrieren, anmelden, Land und Währung, Passwort, Zwei-Faktor-Anmeldung und Konto löschen.",
    links: [
      { href: "/registrieren", label: "Registrieren" },
      { href: "/einstellungen/konto", label: "Konto & Daten" },
      { href: "/einstellungen/sicherheit", label: "Sicherheit" },
    ],
    articles: [
      {
        id: "registrieren",
        q: "Wie erstelle ich ein Konto?",
        a: "Unter [Registrieren](/registrieren) mit E-Mail-Adresse und Passwort (mindestens 10 Zeichen, mit Ziffer oder Sonderzeichen) – oder mit Apple bzw. Pinterest, wenn die Schaltflächen angezeigt werden. Du wählst dabei Anzeigename, Benutzername und dein Land.\n\nDanach schicken wir dir einen Link zur Bestätigung deiner E-Mail-Adresse. Ein kurzes Onboarding hilft dir, Interessen zu wählen und ersten Menschen zu folgen; du kannst es auch überspringen.",
        tags: "anmelden konto erstellen sign up apple pinterest e-mail bestätigen onboarding willkommen",
      },
      {
        id: "alter",
        q: "Ab welchem Alter kann ich mitmachen?",
        a: "Ab {minAge} Jahren. {brand} enthält einen Marktplatz und Direktnachrichten und ist deshalb für Erwachsene gedacht.",
        tags: "mindestalter jugendliche",
      },
      {
        id: "land-waehrung",
        q: "Warum muss ich mein Land angeben?",
        a: "Dein Land bestimmt, in welcher Währung du Preise siehst und bezahlst: aus der **Schweiz** und **Liechtenstein** in Franken, aus **Deutschland** und **Österreich** in Euro.\n\nBestehende Mitglieder fragen wir einmal danach („Woher kommst du?“), vorausgefüllt aus der letzten Lieferadresse oder dem Profil. Ändern kannst du das Land jederzeit unter [Einstellungen → Profil](/einstellungen/profil). Laufende Bestellungen und Abos bleiben in ihrer bisherigen Währung.",
        tags: "schweiz liechtenstein deutschland österreich chf eur euro franken währung woher kommst du",
      },
      {
        id: "passwort",
        q: "Ich habe mein Passwort vergessen.",
        a: "Unter [Passwort vergessen](/passwort-vergessen) erhältst du einen Link, der 60 Minuten gültig ist. Nach dem Zurücksetzen werden aus Sicherheitsgründen alle Geräte abgemeldet.",
        tags: "passwort zurücksetzen login",
      },
      {
        id: "zwei-faktor",
        q: "Wie schütze ich mein Konto zusätzlich?",
        a: "Aktiviere unter [Einstellungen → Sicherheit](/einstellungen/sicherheit) die **Zwei-Faktor-Anmeldung** mit einer Authenticator-App und bewahre die Wiederherstellungscodes sicher auf. Bei einer Anmeldung von einem neuen Gerät erhältst du eine E-Mail.\n\nDort siehst du auch alle angemeldeten Geräte und Sicherheitsereignisse und kannst einzelne oder alle anderen Geräte abmelden.",
        tags: "2fa totp authenticator codes geräte sitzungen abmelden sicherheit",
      },
      {
        id: "e-mail-aendern",
        q: "Wie ändere ich meine E-Mail-Adresse?",
        a: "Unter [Einstellungen → Konto & Daten](/einstellungen/konto) mit deinem Passwort. Wir schicken einen Bestätigungslink an die neue Adresse; erst nach dem Klick wird sie umgestellt.",
        tags: "mail adresse wechseln",
      },
      {
        id: "benutzername",
        q: "Kann ich meinen Benutzernamen ändern?",
        a: "Ja, unter [Einstellungen → Profil](/einstellungen/profil), höchstens dreimal in 30 Tagen. Alte Profillinks leiten automatisch auf den neuen Benutzernamen weiter.",
        tags: "handle username @",
      },
      {
        id: "konto-loeschen",
        q: "Wie lösche ich mein Konto?",
        a: "Unter [Einstellungen → Konto & Daten](/einstellungen/konto). Dort siehst du, was gelöscht wird und was aus gesetzlichen Gründen erhalten bleibt (z. B. Bestellbelege). Hat dein Shop offene Bestellungen, versende oder storniere sie vorher. Lade vor dem Löschen deinen Datenexport herunter.",
        tags: "account löschen entfernen kündigen",
      },
    ],
  },
  {
    id: "profil",
    title: "Profil & Einstellungen",
    icon: "settings",
    summary: "Profil gestalten, Benachrichtigungen, Feed, Privatsphäre und Darstellung einstellen.",
    links: [
      { href: "/einstellungen/profil", label: "Profil" },
      { href: "/einstellungen/benachrichtigungen", label: "Benachrichtigungen" },
      { href: "/einstellungen/feed", label: "Feed & Interessen" },
      { href: "/einstellungen/privatsphaere", label: "Privatsphäre" },
    ],
    articles: [
      {
        id: "profil-bearbeiten",
        q: "Was kann ich in meinem Profil angeben?",
        a: "Unter [Einstellungen → Profil](/einstellungen/profil): Profil- und Titelbild, Anzeigename, Benutzername, Pronomen, eine kurze Bio, Region, Land, Website, bis zu 6 Links und deine kreativen Kategorien.",
        tags: "avatar bild bio links kategorien pronomen region",
      },
      {
        id: "benachrichtigungen-einstellen",
        q: "Wie steuere ich, worüber ich informiert werde?",
        a: "Unter [Einstellungen → Benachrichtigungen](/einstellungen/benachrichtigungen) legst du je Ereignis fest, ob es in der App und/oder per E-Mail kommt. E-Mails erhältst du sofort, täglich oder wöchentlich gebündelt – oder gar nicht. Zusätzlich gibt es einen Wochenrückblick per E-Mail.\n\nIm Browser kannst du dort auch Push-Mitteilungen auf diesem Gerät einschalten. Hinweise zu Moderation und Sicherheit erscheinen immer in der App.",
        tags: "e-mail digest push mitteilungen wochenrückblick",
      },
      {
        id: "feed-einstellen",
        q: "Wie passe ich meinen Feed an?",
        a: "Unter [Einstellungen → Feed & Interessen](/einstellungen/feed) wählst du Interessen, blendest Kategorien aus und bestimmst, welcher Tab sich zuerst öffnet („Für dich“, „Folge ich“ oder „Neu“). Dort verwaltest du auch stummgeschaltete Profile, ausgeblendete Stories und ausgeblendete Inhalte.",
        tags: "interessen kategorien ausblenden stumm",
      },
      {
        id: "privatsphaere",
        q: "Welche Privatsphäre-Einstellungen gibt es?",
        a: "Unter [Einstellungen → Privatsphäre](/einstellungen/privatsphaere):\n- wer dir Nachrichten schreiben darf (alle Mitglieder, nur Personen, denen du folgst, oder niemand – ausser bei Bestellungen)\n- Lesebestätigungen in Einzelchats\n- ob andere sehen, wenn du online bist\n- „Bewegung reduzieren“ für weniger Animationen\n- die Liste der blockierten Profile",
        tags: "nachrichten wer darf schreiben online status gelesen lesebestätigung animationen blockiert",
      },
    ],
  },
  {
    id: "werkbank",
    title: "Werkbank, Beiträge & Stories",
    icon: "feed",
    summary: "Der Feed, Beiträge mit Umfragen und Hashtags, Koautor:innen, geplante Beiträge und Stories.",
    links: [
      { href: "/feed", label: "Werkbank" },
      { href: "/erstellen", label: "Erstellen" },
      { href: "/stories", label: "Stories" },
    ],
    articles: [
      {
        id: "feed",
        q: "Was zeigt mir die Werkbank?",
        a: "Die [Werkbank](/feed) ist dein Feed mit drei Ansichten: **Für dich** (passend zu deinen Interessen), **Folge ich** (nur Profile, denen du folgst) und **Neu** (die neuesten Beiträge). Damit es abwechslungsreich bleibt, erscheinen pro Seite nur wenige Beiträge derselben Person. Gesponserte Platzierungen gibt es nicht.",
        tags: "startseite feed für dich folge ich neu",
      },
      {
        id: "beitrag-vs-projekt",
        q: "Was ist der Unterschied zwischen Beitrag, Projekt und Anleitung?",
        a: "Ein **Beitrag** ist ein kurzer Moment – ein Foto, eine Frage, eine Umfrage. Ein **Projekt** begleitet ein Werk von der Idee bis zum Ergebnis, mit Materialliste und Journal. Eine **Anleitung** erklärt Schritt für Schritt, wie andere es nachbauen können. Alles startest du über [Erstellen](/erstellen).",
        tags: "unterschied erstellen",
      },
      {
        id: "umfragen",
        q: "Wie erstelle ich eine Umfrage?",
        a: "Im Beitragsfenster fügst du eine Umfrage mit mehreren Antworten hinzu. Sie läuft 24 Stunden, 3 Tage oder 7 Tage; danach siehst du das Ergebnis, und du wirst benachrichtigt, wenn sie endet.",
        tags: "poll abstimmung",
      },
      {
        id: "hashtags",
        q: "Wie funktionieren Hashtags?",
        a: "Schreib ein Wort mit **#** davor in Beiträge, Projekte, Anleitungen oder Kommentare – es wird automatisch erkannt und klickbar. Ein Klick zeigt alle Inhalte mit diesem Hashtag direkt über der aktuellen Seite; die eigene Hashtag-Seite (z. B. /hashtag/diy) zeigt die Anzahl und alle Treffer.",
        tags: "#hashtag tag schlagwort",
      },
      {
        id: "koautoren",
        q: "Kann ich einen Beitrag gemeinsam mit anderen veröffentlichen?",
        a: "Ja. Lade über **Koautor:innen** Personen zu deinem Beitrag ein. Sobald sie bestätigen, erscheint der Beitrag auch in ihrem Profil. Du siehst den Stand jeder Einladung und kannst Personen wieder entfernen.",
        tags: "koautor mitautor gemeinsam collab",
      },
      {
        id: "geplante-beitraege",
        q: "Kann ich einen Beitrag später veröffentlichen?",
        a: "Ja, wähle beim Veröffentlichen einen Zeitpunkt. Der Beitrag bleibt bis dahin ein Entwurf und erscheint dann automatisch. Geplante Beiträge findest du im Studio unter [Meine Inhalte](/studio/inhalte).",
        tags: "planen zeitplan später entwurf",
      },
      {
        id: "stories",
        q: "Wie funktionieren Stories?",
        a: "Stories sind kurze Momente aus der Werkstatt, die **24 Stunden** sichtbar sind. Ein Foto läuft 6 Sekunden, ein Video bis zu 60 Sekunden; du kannst auch reine Text-Stories auf farbigem Hintergrund machen.\n\nIm Editor fügst du Text, Zeichnungen, Sticker und Filter hinzu und schneidest Fotos zu. Du bestimmst, ob **alle** oder **nur Follower** die Story sehen. Du siehst, wer deine Story angeschaut hat.",
        tags: "story 24 stunden video editor sticker filter zeichnen",
      },
      {
        id: "highlights",
        q: "Wie behalte ich eine Story länger?",
        a: "Speichere sie in einem **Highlight**. Highlights bleiben auf deinem Profil, auch wenn die Story abgelaufen ist. Abgelaufene Stories findest du in deinem Story-Archiv.",
        tags: "archiv highlight profil",
      },
    ],
  },
  {
    id: "projekte",
    title: "Projekte & Journal",
    icon: "hammer",
    summary: "Projekte anlegen, Fortschritt im Journal festhalten, Material, Zeit und Kosten, Nachbauten.",
    links: [
      { href: "/projekte/neu", label: "Projekt anlegen" },
      { href: "/projekte", label: "Projekte entdecken" },
      { href: "/studio/projekte", label: "Meine Projekte" },
    ],
    articles: [
      {
        id: "projekt-anlegen",
        q: "Wie lege ich ein Projekt an?",
        a: "Über [Projekt anlegen](/projekte/neu) oder [Erstellen](/erstellen). Gib Titel, Kategorie, Bilder, Beschreibung, Schwierigkeit und Status an. Material und Werkzeuge listest du mit Mengen auf – auf Wunsch mit Preisen für eine Kostenschätzung.",
        tags: "neues projekt erstellen",
      },
      {
        id: "journal",
        q: "Was ist das Journal?",
        a: "Im Journal hältst du den Fortschritt fest: Einträge mit Text, Bildern und der aufgewendeten Zeit. So entsteht der Faden vom ersten Schnitt bis zum fertigen Stück. Die Zeit aus dem Journal erscheint im Projekt neben der geschätzten Zeit. Wer dem Projekt folgt, wird über neue Einträge informiert.",
        tags: "fortschritt eintrag update zeit",
      },
      {
        id: "nachbau",
        q: "Was ist ein Nachbau?",
        a: "Wenn du ein Projekt nach dem Vorbild eines anderen machst, verknüpfst du es als Nachbau. Die ursprüngliche Person sieht, was aus ihrer Idee entstanden ist – und du beschreibst, was du anders gemacht hast.",
        tags: "remix nachmachen inspiration",
      },
      {
        id: "projekt-kosten",
        q: "Wie funktioniert die Kostenschätzung?",
        a: "Gibst du bei Material Richtpreise an, rechnet {brand} die ungefähren Materialkosten zusammen. Fehlen bei einigen Zeilen Preise, steht „ab“ davor. Die Schätzung ist ein Richtwert, kein Angebot.",
        tags: "kosten material preis budget",
      },
      {
        id: "projekt-sichtbarkeit",
        q: "Wer sieht mein Projekt?",
        a: "Veröffentlichte, öffentliche Projekte sind für alle sichtbar und können in der Suche, auf [Entdecken](/entdecken) und im Feed erscheinen. Entwürfe siehst nur du.",
        tags: "privat öffentlich entwurf",
      },
    ],
  },
  {
    id: "anleitungen",
    title: "Anleitungen",
    icon: "book",
    summary: "Anleitungen schreiben und nutzen: Werkstatt-Modus, Drucken als PDF, Fragen zu Schritten, exklusive Anleitungen.",
    links: [
      { href: "/anleitungen", label: "Anleitungen entdecken" },
      { href: "/studio/anleitungen", label: "Meine Anleitungen" },
    ],
    articles: [
      {
        id: "anleitung-schreiben",
        q: "Wie schreibe ich eine Anleitung?",
        a: "Im Studio unter [Anleitungen](/studio/anleitungen) → neue Anleitung. Du gibst Material und Werkzeuge, Schwierigkeit, Dauer, Sicherheitshinweise und die einzelnen Schritte mit Bildern an. Verknüpfe sie mit dem passenden Projekt, damit man sieht, wie das Ergebnis entstanden ist.",
        tags: "tutorial erstellen schritte",
      },
      {
        id: "werkstatt-modus",
        q: "Was ist der Werkstatt-Modus?",
        a: "Eine Ansicht für die Werkbank: ein Schritt pro Bildschirm mit grosser, verstellbarer Schrift, vorab eine Übersicht über Material und Werkzeug. Der Bildschirm bleibt an, ein Timer hilft bei Leim- und Trocknungszeiten, und du blätterst mit Pfeiltasten, Leertaste oder Wischen. Öffne ihn auf der Anleitung über **Werkstatt-Modus**.\n\nErledigte Schritte bleiben gespeichert – angemeldet in deinem Konto, sonst in diesem Browser –, auch wenn die Anleitung aktualisiert wird.",
        tags: "werkstatt schritt für schritt abhaken fortschritt timer leimzeit wischen",
      },
      {
        id: "anleitung-pdf",
        q: "Kann ich eine Anleitung ausdrucken oder als PDF sichern?",
        a: "Ja, über **Drucken / PDF** auf der Anleitung. Die Druckfassung enthält alle Schritte und das Material zum Abhaken; im Druckdialog deines Browsers wählst du „Als PDF sichern“.",
        tags: "drucken pdf ausdruck",
      },
      {
        id: "schritt-fragen",
        q: "Wie stelle ich eine Frage zu einem Schritt?",
        a: "Unter jedem Schritt findest du **Frage zu diesem Schritt**. Die Autorin bzw. der Autor wird benachrichtigt und antwortet direkt darunter – so bleibt die Antwort für alle sichtbar, die später an derselben Stelle hängen.",
        tags: "frage hilfe schritt kommentar",
      },
      {
        id: "anleitung-kosten",
        q: "Was bedeuten die Materialkosten in einer Anleitung?",
        a: "Eine Schätzung aus den Richtpreisen, die die Autorin bzw. der Autor angegeben hat – in deiner Währung umgerechnet. Mit **Auf die Einkaufsliste** übernimmst du das Material in eine deiner [Einkaufslisten](/einkaufslisten).",
        tags: "kosten material preis",
      },
      {
        id: "exklusive-anleitungen",
        q: "Was sind Anleitungen „Nur für Unterstützer:innen“?",
        a: "Creator mit Unterstützer-Abo können Anleitungen exklusiv für ihre Unterstützer:innen veröffentlichen. Ohne Unterstützung siehst du Titel und Vorschau; die Schritte öffnen sich, sobald du die Person unterstützt. Mehr unter [Unterstützer-Abo](/hilfe/studio#unterstuetzer-abo).",
        tags: "exklusiv gesperrt unterstützer abo",
      },
      {
        id: "anleitung-verkaufen",
        q: "Kann ich Anleitungen verkaufen?",
        a: "Ja, als **Digitale Anleitung** in deinem Shop – wenn die Anleitung von dir stammt. Mehr in den [Marktplatz-Richtlinien](/richtlinien/marktplatz) und unter [Verkaufen](/hilfe/verkaufen#digitale-produkte).",
        tags: "digital verkaufen download",
      },
    ],
  },
  {
    id: "blogs",
    title: "Blogs & Artikel",
    icon: "pen",
    summary: "Längere Artikel schreiben, planen und mit Projekten und Produkten verknüpfen.",
    links: [
      { href: "/blogs", label: "Blogs lesen" },
      { href: "/studio/blog", label: "Mein Blog" },
    ],
    articles: [
      {
        id: "blog-schreiben",
        q: "Wie schreibe ich einen Blogartikel?",
        a: "Im Studio unter [Blog](/studio/blog) → neuer Artikel. Der Editor unterstützt Überschriften, Bilder und eingebettete Projekte, Anleitungen und Produkte. Du kannst sofort veröffentlichen oder einen Zeitpunkt planen. Deine Artikel erscheinen auf deinem Profil unter „Blog“ und auf [Blogs](/blogs).",
        tags: "artikel blog schreiben planen",
      },
    ],
  },
  {
    id: "communities",
    title: "Communities, Events & Wettbewerbe",
    icon: "users",
    summary: "Communities beitreten und gründen, Events besuchen, an Wettbewerben teilnehmen.",
    links: [
      { href: "/communities", label: "Communities" },
      { href: "/events", label: "Events" },
      { href: "/wettbewerbe", label: "Wettbewerbe" },
    ],
    articles: [
      {
        id: "community-beitreten",
        q: "Wie trete ich einer Community bei?",
        a: "Öffne eine Community unter [Communities](/communities) und wähle **Beitreten**. Bei offenen Communities geht das sofort; bei anderen sendest du eine Anfrage, über die die Moderation entscheidet. Danach kannst du dort Beiträge veröffentlichen und an Events und Wettbewerben teilnehmen.",
        tags: "gruppe beitreten mitglied",
      },
      {
        id: "community-gruenden",
        q: "Kann ich eine eigene Community gründen?",
        a: "Ja, unter [Community gründen](/communities/neu). Du wählst, ob alle sofort beitreten können oder nur auf Anfrage. Über **Verwalten** auf der Community-Seite kümmerst du dich um Mitglieder und Rollen, Beitrittsanfragen, Sperren und Wettbewerbe; Events legst du direkt in der Community an.",
        tags: "community erstellen moderieren verwalten",
      },
      {
        id: "events",
        q: "Wie nehme ich an einem Event teil?",
        a: "Auf der Event-Seite wählst du **Ich bin dabei** oder **Interessiert**. Ist ein Event ausgebucht, ist die Anmeldung gesperrt. Vor dem Event erinnern wir dich; wird es abgesagt, erfahren alle Teilnehmenden davon. Events organisierst du innerhalb einer Community.",
        tags: "event anmelden treffen workshop erinnerung",
      },
      {
        id: "wettbewerbe",
        q: "Wie funktionieren Wettbewerbe?",
        a: "Wettbewerbe laufen in Phasen: **Startet bald**, **Einreichung läuft**, **Abstimmung läuft** bzw. **Jury entscheidet** und **Beendet**. Während der Einreichung reichst du mit **Projekt einreichen** ein eigenes Projekt ein und kannst die Einreichung aktualisieren oder zurückziehen. Alle laufenden Wettbewerbe findest du unter [Wettbewerbe](/wettbewerbe).",
        tags: "challenge wettbewerb einreichen abstimmen jury",
      },
    ],
  },
  {
    id: "nachrichten",
    title: "Nachrichten & Benachrichtigungen",
    icon: "message",
    summary: "Chats, Anfragen, Gruppen, Archiv und Löschen, Lesebestätigungen und Benachrichtigungen.",
    links: [
      { href: "/nachrichten", label: "Nachrichten" },
      { href: "/benachrichtigungen", label: "Benachrichtigungen" },
    ],
    articles: [
      {
        id: "anfragen",
        q: "Warum landet eine Nachricht unter „Anfragen“?",
        a: "Schreibt dir jemand zum ersten Mal, dem du nicht folgst, erscheint die Unterhaltung unter **Anfragen**. Nimmst du sie an, wandert sie in den Posteingang; lehnst du ab, erfährt die Person nichts davon. Wer dir überhaupt schreiben darf, legst du unter [Privatsphäre](/einstellungen/privatsphaere) fest.",
        tags: "anfrage fremde nachricht annehmen ablehnen",
      },
      {
        id: "gruppenchat",
        q: "Kann ich mit mehreren Personen gleichzeitig schreiben?",
        a: "Ja, über [Neue Gruppe](/nachrichten/gruppe/neu). Neue Mitglieder sehen den Verlauf ab ihrem Beitritt. Du kannst eine Gruppe jederzeit verlassen.",
        tags: "gruppe gruppenchat mehrere",
      },
      {
        id: "archivieren",
        q: "Was passiert, wenn ich eine Unterhaltung archiviere?",
        a: "Sie verschwindet aus dem Posteingang und liegt unter **Archiv**. Kommt eine neue Nachricht, erscheint sie wieder im Posteingang. Über „Zurück in den Posteingang“ holst du sie jederzeit zurück.",
        tags: "archiv ausblenden",
      },
      {
        id: "chat-loeschen",
        q: "Was passiert, wenn ich eine Unterhaltung lösche?",
        a: "Der bisherige Verlauf wird **nur für dich** entfernt – die andere Person behält ihre Kopie. Schreibt sie dir wieder, erscheint die Unterhaltung erneut, aber nur mit den neuen Nachrichten. Melde problematische Nachrichten vor dem Löschen, damit unser Team sie prüfen kann.",
        tags: "löschen chat entfernen verlauf",
      },
      {
        id: "lesebestaetigung",
        q: "Was bedeuten die Häkchen?",
        a: "Ein Häkchen: gesendet. Zwei graue Häkchen: auf einem Gerät angekommen. Zwei farbige Häkchen: gelesen. Lesebestätigungen und deinen Online-Status kannst du unter [Privatsphäre](/einstellungen/privatsphaere) ausschalten – dann siehst du sie auch bei anderen nicht.",
        tags: "häkchen gelesen zugestellt online",
      },
      {
        id: "nachrichten-sicherheit",
        q: "Sind Nachrichten verschlüsselt?",
        a: "Sie werden verschlüsselt übertragen, sind aber nicht Ende-zu-Ende-verschlüsselt. Den Inhalt sieht unser Moderationsteam nur, wenn eine Nachricht gemeldet wird. Teile keine Passwörter oder Bankdaten per Nachricht – und zahle nie über einen Link aus einer Nachricht. Verdächtige Zahlungsaufforderungen kennzeichnen wir mit einem Warnhinweis.",
        tags: "verschlüsselung betrug zahlungslink",
      },
      {
        id: "benachrichtigungen",
        q: "Wo sehe ich meine Benachrichtigungen?",
        a: "Unter [Benachrichtigungen](/benachrichtigungen) bzw. über die Glocke. Einzelne Benachrichtigungen kannst du löschen. Was du in der App und per E-Mail erhältst, stellst du unter [Einstellungen → Benachrichtigungen](/einstellungen/benachrichtigungen) ein.",
        tags: "glocke mitteilungen löschen",
      },
    ],
  },
  {
    id: "entdecken",
    title: "Suche, Entdecken & Gespeichert",
    icon: "compass",
    summary: "Inhalte finden, Profilen folgen, merken und in Sammlungen ordnen.",
    links: [
      { href: "/entdecken", label: "Entdecken" },
      { href: "/suche", label: "Suche" },
      { href: "/gespeichert", label: "Gespeichert" },
    ],
    articles: [
      {
        id: "suchen",
        q: "Wie finde ich Projekte, Menschen oder Material?",
        a: "Über die [Suche](/suche) – sie findet Projekte, Anleitungen, Beiträge, Artikel, Communities, Profile und Produkte. Am Computer öffnest du die Befehlspalette mit **⌘K** bzw. **Strg+K** (oder **/**) und springst direkt zu Inhalten und Funktionen. [Entdecken](/entdecken) zeigt Kategorien, Projekte, Anleitungen und Creator, die zu dir passen.",
        tags: "suchen finden befehlspalette tastenkürzel",
      },
      {
        id: "folgen",
        q: "Was bringt es, einem Profil oder Projekt zu folgen?",
        a: "Beiträge von Profilen, denen du folgst, erscheinen unter „Folge ich“. Folgst du einem Projekt, wirst du über neue Journal-Einträge informiert.",
        tags: "folgen follower abonnieren",
      },
      {
        id: "gespeichert",
        q: "Wie merke ich mir Inhalte?",
        a: "Über das Lesezeichen bei Projekten, Anleitungen, Beiträgen und Produkten. Alles Gemerkte findest du unter [Gespeichert](/gespeichert). Mit **Sammlungen** ordnest du es – privat oder öffentlich; öffentliche Sammlungen kann jede Person mit dem Link sehen, und sie erscheinen auf deinem Profil.",
        tags: "lesezeichen merken sammlung favoriten",
      },
    ],
  },
  {
    id: "werkzeuge",
    title: "Material, Einkaufslisten & Tools",
    icon: "ruler",
    summary: "Materialkatalog, Bestand, Einkaufslisten und der Zuschnittrechner.",
    links: [
      { href: "/materialien", label: "Materialien" },
      { href: "/materialien/bestand", label: "Mein Bestand" },
      { href: "/einkaufslisten", label: "Einkaufslisten" },
      { href: "/werkzeuge/zuschnitt", label: "Zuschnittrechner" },
    ],
    articles: [
      {
        id: "materialien",
        q: "Was finde ich unter Materialien?",
        a: "[Materialien](/materialien) erklärt Werkstoffe und zeigt, in welchen Projekten und Anleitungen sie vorkommen. Wo vorhanden, siehst du ungefähre Preise bei Händlern – in deiner Währung umgerechnet und mit „ca.“ gekennzeichnet; gekauft wird direkt beim Händler.",
        tags: "werkstoff material händler preis",
      },
      {
        id: "bestand",
        q: "Wozu dient „Mein Bestand“?",
        a: "Unter [Mein Bestand](/materialien/bestand) notierst du, welches Material du schon zu Hause hast – mit Menge und Notiz. Auf Materialseiten und in Projekten markierst du mit einem Klick, was du bereits besitzt.",
        tags: "vorrat lager zuhause",
      },
      {
        id: "einkaufslisten",
        q: "Wie funktionieren Einkaufslisten?",
        a: "Übernimm Material aus Projekten und Anleitungen mit **Auf die Einkaufsliste** in eine [Einkaufsliste](/einkaufslisten) und hake ab, was du schon hast. Mehrere Listen kannst du zusammenführen. Über einen Freigabelink teilst du eine Liste – wer ihn hat, kann sie lesen, aber nicht bearbeiten.",
        tags: "einkaufen liste teilen abhaken",
      },
      {
        id: "zuschnittrechner",
        q: "Was kann der Zuschnittrechner?",
        a: "Der [Zuschnittrechner](/werkzeuge/zuschnitt) verteilt deine Teile auf Platten und zeigt den Schnittplan, die Anzahl Platten, das Kantenband und die Kosten. Du kannst eine Teileliste einfügen (Bezeichnung; Länge; Breite; Anzahl) und das Ergebnis per Link teilen.",
        tags: "zuschnitt platten schnittplan kantenband holz rechner",
      },
    ],
  },
  {
    id: "kaufen",
    title: "Kaufen",
    icon: "bag",
    summary: "Warenkorb, Kasse und Zahlung, Preise in Franken und Euro, Bestellungen, Rückgaben, Gutscheine und Sets.",
    links: [
      { href: "/markt", label: "Marktplatz" },
      { href: "/warenkorb", label: "Warenkorb" },
      { href: "/bestellungen", label: "Bestellungen" },
    ],
    articles: [
      {
        id: "bei-wem",
        q: "Bei wem kaufe ich?",
        a: "Beim jeweiligen Shop. {brand} stellt den Marktplatz bereit und wickelt die Zahlung über Stripe ab; der Kaufvertrag kommt zwischen dir und dem Shop zustande. Auf jeder Shopseite steht, ob privat oder gewerblich verkauft wird.",
        tags: "verkäufer vertrag shop",
      },
      {
        id: "warenkorb",
        q: "Warum erhalte ich mehrere Bestellungen?",
        a: "Der [Warenkorb](/warenkorb) ist nach Shops gruppiert – jeder Shop versendet selbst, deshalb wird jede Gruppe eine eigene Bestellung. Innerhalb eines Shops gilt der höchste Versandsatz (kombinierter Versand). Für dich fallen keine weiteren Gebühren an.",
        tags: "warenkorb versand mehrere shops",
      },
      {
        id: "waehrung",
        q: "In welcher Währung bezahle ich?",
        a: "In der Währung deines Landes: Franken (Schweiz, Liechtenstein) oder Euro (Deutschland, Österreich). Verkauft ein Shop in der anderen Währung, rechnen wir zum Referenzkurs der Europäischen Zentralbank um, gerundet auf 10 Rappen bzw. Cent. Produktseite, Warenkorb und Kasse zeigen, dass umgerechnet wurde und von welchem Tag der Kurs stammt. Der Betrag an der Kasse bleibt bis zur Zahlung fest.\n\nOhne Konto wählst du auf dem [Marktplatz](/markt) selbst, ob Preise in CHF oder EUR erscheinen.",
        tags: "euro franken chf eur umrechnung kurs ezb wechselkurs",
      },
      {
        id: "kasse",
        q: "Wie läuft die Bezahlung ab?",
        a: "An der [Kasse](/kasse) gibst du beim ersten Kauf Name und Lieferadresse an; sie werden für spätere Bestellungen gespeichert. Danach bezahlst du im Checkout von Stripe – mit Karte, Apple Pay oder Google Pay, bei Bestellungen in Franken auch mit TWINT, und je nach Bestellung auf Rechnung oder in Raten über Klarna. Kartendaten erreichen uns nie. Die Artikel sind während der Zahlung {reservationMinutes} Minuten für dich reserviert. Eine offene Zahlung kannst du im Warenkorb fortsetzen.\n\nZahle nie ausserhalb des Checkouts, etwa per Überweisung oder über einen Link aus einer Nachricht.",
        tags: "bezahlen zahlung stripe karte twint klarna rechnung raten apple pay google pay checkout adresse reservierung",
      },
      {
        id: "kaeuferschutz",
        q: "Was ist, wenn meine Bestellung nicht ankommt oder beschädigt ist?",
        a: "Öffne die Bestellung unter [Bestellungen](/bestellungen) und nutze **Problem melden**. Der Shop wird benachrichtigt; am schnellsten löst ihr es gemeinsam per Nachricht. Kommt keine Lösung zustande, kontaktiere uns über [Hilfe & Support](/einstellungen/hilfe-support) mit deiner Bestellnummer.\n\nBestätige den Erhalt erst, wenn alles in Ordnung ist – ohne Rückmeldung gilt eine versendete Bestellung {autoCompleteDays} nach dem Versand als abgeschlossen.",
        tags: "käuferschutz problem nicht angekommen beschädigt reklamation",
      },
      {
        id: "stornieren",
        q: "Kann ich eine Bestellung stornieren oder zurückgeben?",
        a: "Schreib dem Shop über die Bestellung. Vor dem Versand kann der Shop stornieren; der Betrag wird dann vollständig auf dein Zahlungsmittel erstattet. Die Rückgaberegeln stehen auf jeder Shop- und Produktseite. Bei gewerblichen Shops gelten zusätzlich deine gesetzlichen Rechte. Auftragsarbeiten und personalisierte Stücke sind meist von der Rückgabe ausgeschlossen.",
        tags: "storno rückgabe widerruf erstattung geld zurück",
      },
      {
        id: "bewerten",
        q: "Wie bewerte ich einen Kauf?",
        a: "Nach Abschluss der Bestellung bewertest du in der Bestellung den Artikel und den Shop (Kommunikation, Versand) mit 1 bis 5 Punkten und einem kurzen Text. Bewertungen sind öffentlich mit deinem Profilnamen; der Shop kann darauf antworten.",
        tags: "bewertung sterne rezension",
      },
      {
        id: "downloads",
        q: "Wo finde ich gekaufte Downloads?",
        a: "In deiner [Bestellung](/bestellungen), sobald die Zahlung bestätigt ist. Die Anzahl der Downloads kann je Produkt begrenzt sein.",
        tags: "download digital pdf anleitung gekauft",
      },
      {
        id: "nachproduktion",
        q: "Ein Produkt ist ausverkauft – wird es nachproduziert?",
        a: "Auf der Produktseite kannst du mit **Wird das nachproduziert?** beim Shop anfragen. Sobald das Produkt wieder verfügbar ist, bekommst du eine Benachrichtigung. Die Anfrage lässt sich jederzeit zurückziehen.",
        tags: "ausverkauft restock wieder verfügbar benachrichtigen",
      },
      {
        id: "gutschein-einloesen",
        q: "Wie löse ich einen Gutschein ein?",
        a: "Im [Warenkorb](/warenkorb) gibst du den Code im Feld des jeweiligen Shops ein. Ein Gutschein gilt nur für den Shop, der ihn ausgegeben hat. Gilt er nicht (abgelaufen, Mindestbestellwert, bereits eingelöst), steht der Grund direkt darunter.",
        tags: "gutschein code rabatt einlösen coupon",
      },
      {
        id: "sets",
        q: "Was sind Sets?",
        a: "Shops bündeln Produkte – etwa eine Anleitung mit dem passenden Materialset – zu einem Set mit Rabatt. Der Rabatt gilt, solange alle Teile in der Set-Menge im Warenkorb liegen.",
        tags: "set bundle paket rabatt",
      },
      {
        id: "geschenkgutschein",
        q: "Wie funktionieren Geschenkgutscheine?",
        a: "Viele Shops bieten Geschenkgutscheine an – du findest sie auf der Shopseite. Du wählst einen Betrag, gibst Name und E-Mail der beschenkten Person, eine persönliche Nachricht und den Zustelltag an und bezahlst im Checkout. Die beschenkte Person erhält den Code per E-Mail. Eingelöst wird er im [Warenkorb](/warenkorb) oder an der Kasse des ausstellenden Shops; ein Restbetrag bleibt als Guthaben. Deine erhaltenen Gutscheine und ihr Guthaben siehst du unter [Meine Geschenkgutscheine](/geschenkgutscheine). In der iOS-App kannst du Gutscheine einlösen, aber nicht kaufen.",
        tags: "geschenkgutschein geschenk gutschein guthaben verschenken einlösen code",
      },
      {
        id: "preisalarm",
        q: "Sagt ihr mir Bescheid, wenn etwas günstiger wird?",
        a: "Ja. Merkst du dir ein Produkt (Speichern), schicken wir dir eine Nachricht, wenn es in eine Aktion kommt, der Shop den Preis senkt oder es wieder erhältlich ist – je Anlass höchstens einmal. Liegt dein Warenkorb einen Tag lang unberührt, erinnern wir dich einmal daran. Beides kannst du unter [Einstellungen → Benachrichtigungen](/einstellungen/benachrichtigungen) abschalten.",
        tags: "preisalarm merkliste gemerkt günstiger aktion preis gesenkt wieder erhältlich warenkorb erinnerung",
      },
    ],
  },
  {
    id: "verkaufen",
    title: "Verkaufen im Studio",
    icon: "store",
    summary: "Shop eröffnen, Produkte und Varianten, digitale Anleitungen, Bestellungen, Gutscheine, Sets, Gebühren und Auszahlungen.",
    links: [
      { href: "/studio/shop", label: "Shopverwaltung" },
      { href: "/studio/produkte", label: "Produkte" },
      { href: "/studio/bestellungen", label: "Bestellungen" },
      { href: "/studio/rabatte", label: "Gutscheine & Sets" },
      { href: "/studio/einnahmen", label: "Einnahmen & Auszahlungen" },
    ],
    articles: [
      {
        id: "shop-eroeffnen",
        q: "Wie eröffne ich einen Shop?",
        a: "Im Studio unter [Shopverwaltung](/studio/shop). Du gibst an, ob du privat oder gewerblich verkaufst, beschreibst Versand und Rückgabe und richtest dein Auszahlungskonto bei Stripe ein. Freigeschaltet wird der Shop, sobald deine E-Mail-Adresse bestätigt, die Shop-Angaben eingereicht und die Verifizierung bei Stripe abgeschlossen ist. Fehlen bei Stripe noch Angaben, siehst du das dort.",
        tags: "shop eröffnen stripe verifizierung gewerbe privat",
      },
      {
        id: "gewerbe",
        q: "Muss ich ein Gewerbe haben?",
        a: "Nein. Du kannst privat oder gewerblich verkaufen. Wer regelmässig mit Gewinnabsicht verkauft, gilt in der Regel als gewerblich – kläre im Zweifel deine Pflichten (z. B. MWST) mit einer Fachperson.",
        tags: "gewerblich privat mwst steuern",
      },
      {
        id: "produkte",
        q: "Welche Produkte kann ich anbieten?",
        a: "Unter [Produkte](/studio/produkte): Einzelstücke, Kleinserien, Arbeiten auf Bestellung, DIY-Materialsets, unbearbeitete Artikel und digitale Anleitungen. Du legst Preis, Versandkosten, Bestand und Bilder fest und kannst Varianten (z. B. Farbe oder Grösse) mit eigenem Aufpreis und Bestand anlegen. Verknüpfe ein Produkt mit dem Projekt, aus dem es entstanden ist.",
        tags: "produkt anlegen varianten bestand preis versand",
      },
      {
        id: "digitale-produkte",
        q: "Wie verkaufe ich digitale Anleitungen – auch in der iOS-App?",
        a: "Lege ein Produkt als **Digitale Anleitung** an und lade die Datei zum Download hoch (PDF oder ZIP). Im Web bezahlen Käufer:innen deinen Preis. In der iOS-App wird über Apple bezahlt: Der App-Preis ist dein Preis plus {iosMarkup} (Apple-Gebühr), aufgerundet auf die nächste Apple-Preisstufe. Dein Anteil bleibt gleich wie im Web. Den App-Preis siehst du im Produkteditor.",
        tags: "digital ios app apple in-app kauf app store preis",
      },
      {
        id: "bestellungen-bearbeiten",
        q: "Wie bearbeite ich eine Bestellung?",
        a: "Unter [Bestellungen](/studio/bestellungen) siehst du neue Bestellungen mit Lieferadresse. Nimm sie in Bearbeitung, markiere sie als versandbereit und erfasse den Versand mit Dienst und Sendungsnummer – die Käuferin bzw. der Käufer wird jeweils benachrichtigt. Vor dem Versand kannst du stornieren; der Bestand wird zurückgebucht und der Betrag vollständig erstattet. Probleme klärst du am schnellsten per Nachricht.",
        tags: "bestellung versand sendungsnummer stornieren erstatten",
      },
      {
        id: "gebuehren",
        q: "Was kostet das Verkaufen?",
        a: "Shop und Angebote sind kostenlos. Bei einem Verkauf fällt eine Provision von derzeit {fee} auf den Warenwert an (ohne Versand); mit Creator Pro {proFee}. Die Zahlungsgebühren von Stripe zieht Stripe bei der Auszahlung ab. Details und Rechenbeispiel in den [Marktplatz-Richtlinien](/richtlinien/marktplatz#gebuehren).",
        tags: "provision gebühren kosten prozent",
      },
      {
        id: "auszahlung",
        q: "Wann erhalte ich mein Geld?",
        a: "Der Erlös einer Bestellung wird {holdDays} nach ihrem Abschluss auszahlbar – abgeschlossen ist sie mit der Erhaltsbestätigung, spätestens automatisch {autoCompleteDays} nach dem Versand. Digitale Produkte: {holdDays} nach dem Kauf. Freigegebenes Guthaben zahlen wir nach deinem Auszahlungsplan oder auf Anfrage auf dein Bankkonto aus. Den Stand siehst du unter [Einnahmen & Auszahlungen](/studio/einnahmen).",
        tags: "auszahlung geld bank einnahmen guthaben",
      },
      {
        id: "andere-waehrung",
        q: "Was passiert, wenn jemand in der anderen Währung bezahlt?",
        a: "Mitglieder aus Deutschland und Österreich bezahlen in Euro, aus der Schweiz und Liechtenstein in Franken. Stripe rechnet für deinen Shop um. Einnahmen und Statistiken zeigen alles in deiner Shop-Währung, umgerechnet zum Kurs vom Kauf; auf der Bestellung siehst du den bezahlten Betrag und die Schätzung in deiner Währung.",
        tags: "euro franken umrechnung shop währung",
      },
      {
        id: "gutscheine-erstellen",
        q: "Wie erstelle ich Gutscheine?",
        a: "Unter [Gutscheine & Sets](/studio/rabatte). Ein Gutschein ist ein Code für einen Prozentrabatt (bis 90 %) oder einen festen Betrag. Optional legst du einen Mindestbestellwert, einen Zeitraum, eine Höchstzahl an Einlösungen und „einmal pro Person“ fest. Im Studio siehst du, wie oft ein Code eingelöst wurde, und kannst ihn teilen oder deaktivieren – bisherige Bestellungen behalten ihren Rabatt.",
        tags: "gutschein code rabatt erstellen coupon aktion",
      },
      {
        id: "sets-erstellen",
        q: "Wie biete ich Sets an?",
        a: "Ebenfalls unter [Gutscheine & Sets](/studio/rabatte): Wähle 2 bis 12 Produkte mit Menge und einen Set-Rabatt bis 50 %. Optional verknüpfst du eine Anleitung. Das Set erscheint auf den Produktseiten und lässt sich mit einem Klick in den Warenkorb legen.",
        tags: "set bundle paket kombi",
      },
    ],
  },
  {
    id: "studio",
    title: "Studio, Unterstützer & Creator Pro",
    icon: "sparkles",
    summary: "Inhalte und Statistiken im Studio, Unterstützer-Abo und Creator Pro.",
    links: [
      { href: "/studio", label: "Studio" },
      { href: "/studio/statistiken", label: "Statistiken" },
      { href: "/studio/unterstuetzer", label: "Unterstützer:innen" },
      { href: "/studio/pro", label: "Creator Pro" },
    ],
    articles: [
      {
        id: "studio-ueberblick",
        q: "Was ist das Studio?",
        a: "Dein Verwaltungsbereich im selben Konto: [Übersicht](/studio), Inhalte, Projekte, Anleitungen, Blog, Medienbibliothek, Statistiken und – mit Shop – Produkte, Bestellungen, Gutscheine & Sets sowie Einnahmen.",
        tags: "studio verwaltung dashboard medien",
      },
      {
        id: "statistiken",
        q: "Wer sieht meine Zahlen im Studio?",
        a: "Nur du. „Aufrufe“ zählen Seitenaufrufe, nicht eindeutige Personen; wiederholte Aufrufe derselben Person innerhalb von 30 Minuten zählen einmal, deine eigenen nie. Unter [Statistiken](/studio/statistiken) siehst du Aufrufe, Interaktionen, neue Follower und – mit Shop – den Umsatz.",
        tags: "statistik aufrufe zahlen analytics",
      },
      {
        id: "unterstuetzer-abo",
        q: "Wie funktioniert das Unterstützer-Abo?",
        a: "Fans unterstützen dich monatlich mit einer festen Stufe (3, 5 oder 10 – in Franken bzw. Euro, je nach Land der unterstützenden Person) und erhalten dafür deine exklusiven Anleitungen. Du richtest es unter [Unterstützer:innen](/studio/unterstuetzer) ein und markierst Anleitungen im Editor als „Nur für Unterstützer:innen“.\n\nVoraussetzung ist ein freigeschalteter Shop mit Stripe-Auszahlungskonto. {brand} behält {supportFee} für Zahlung und Betrieb. In der iOS-App zahlen Unterstützer:innen etwas mehr (Apple-Gebühr), dein Anteil bleibt gleich.",
        tags: "unterstützer abo fans monatlich exklusiv patreon",
      },
      {
        id: "unterstuetzung-verwalten",
        q: "Wie kündige ich eine Unterstützung?",
        a: "Unter [Einstellungen → Unterstützungen](/einstellungen/unterstuetzungen). Eine im Web abgeschlossene Unterstützung kündigst du dort; sie läuft bis zum Ende des bezahlten Monats weiter, danach wird nichts mehr abgebucht. Die Kündigung kannst du bis dahin zurücknehmen.\n\nIn der iOS-App gekaufte Unterstützungen verlängern sich nicht automatisch. Verlängern kannst du sie in der App auf dem Profil der Person.",
        tags: "kündigen unterstützung abo verwalten",
      },
      {
        id: "creator-pro",
        q: "Was bringt Creator Pro?",
        a: "Schaufenster und Pro-Kennzeichen im Profil, Medienkit, Statistiken über 12 Monate, längere Videos und eine tiefere Provision ({proFee} statt {fee}) – für {proMonth} pro Monat oder {proYear} pro Jahr. Jederzeit kündbar auf das Ende der Laufzeit unter [Studio → Creator Pro](/studio/pro).",
        inApp: "Schaufenster und Pro-Kennzeichen im Profil, Medienkit, Statistiken über 12 Monate, längere Videos und eine tiefere Provision. In der App abonnierst und verwaltest du Creator Pro unter Ich › Studio › Creator Pro.",
        tags: "pro abo premium medienkit schaufenster",
      },
    ],
  },
  {
    id: "sicherheit",
    title: "Sicherheit & Moderation",
    icon: "shield",
    summary: "Melden, stummschalten, blockieren, Entscheidungen der Moderation und Einspruch.",
    links: [
      { href: "/richtlinien/community", label: "Community-Richtlinien" },
      { href: "/richtlinien/sicherheit", label: "Sicherheit beim Selbermachen" },
      { href: "/einstellungen/privatsphaere", label: "Blockierte Profile" },
    ],
    articles: [
      {
        id: "melden",
        q: "Wie melde ich einen Inhalt oder eine Person?",
        a: "Über das Menü „…“ bei einem Inhalt, Kommentar, Profil, Produkt, einer Story, einem Event oder einer Nachricht → **Melden**. Du erhältst eine Fallnummer und eine Rückmeldung, wenn der Fall abgeschlossen ist. Die gemeldete Person erfährt nicht, wer gemeldet hat. Ohne Konto erreichst du uns über die [Kontaktseite](/kontakt).",
        tags: "melden report missbrauch spam",
      },
      {
        id: "stumm-blockieren",
        q: "Was ist der Unterschied zwischen Stummschalten und Blockieren?",
        a: "**Stummschalten** entfernt Inhalte einer Person aus deinem Feed, ohne dass sie es merkt – rückgängig unter [Feed & Interessen](/einstellungen/feed). **Blockieren** trennt euch: keine gegenseitigen Inhalte, kein Folgen, keine Nachrichten – rückgängig unter [Privatsphäre](/einstellungen/privatsphaere).",
        tags: "stumm blockieren ignorieren",
      },
      {
        id: "einspruch",
        q: "Ein Inhalt von mir wurde entfernt. Was kann ich tun?",
        a: "In der Benachrichtigung findest du die Begründung und einen Link zum Einspruch. Du hast 14 Tage Zeit; wenn möglich prüft eine andere Person als die, die entschieden hat.",
        tags: "einspruch entfernt gesperrt moderation widerspruch",
      },
      {
        id: "sicher-werken",
        q: "Worauf achte ich beim Selbermachen?",
        a: "Anleitungen nennen Sicherheitshinweise, etwa zu Strom, Hitze, Chemie und Werkzeugen. Lies vor riskanten Arbeiten die Hinweise unter [Sicherheit beim Selbermachen](/richtlinien/sicherheit).",
        tags: "sicherheit werkzeug strom chemie",
      },
    ],
  },
  {
    id: "app",
    title: "iOS-App & Web-App",
    icon: "phone",
    summary: "Werkuno auf dem iPhone, als App auf Android und am Computer, Push-Mitteilungen.",
    links: [{ href: "/einstellungen/benachrichtigungen", label: "Push-Mitteilungen" }],
    articles: [
      {
        id: "ios-app",
        q: "Gibt es eine App für das iPhone?",
        a: "Ja, die iOS-App von {brand} mit Feed, Stories, Projekten, Anleitungen, Nachrichten, Marktplatz und Studio. Du meldest dich mit demselben Konto an; alles ist mit dem Web synchron.",
        tags: "iphone ios app store",
      },
      {
        id: "in-app-kauf",
        q: "Warum sind digitale Produkte in der iOS-App teurer?",
        a: "In der iOS-App werden digitale Produkte und Abos über Apple bezahlt. Apple behält einen Teil des Preises, deshalb liegt der App-Preis etwas höher. Physische Produkte kosten in der App gleich viel wie im Web.",
        tags: "apple preis teurer in-app",
      },
      {
        id: "web-app",
        q: "Kann ich {brand} auf Android oder am Computer wie eine App nutzen?",
        a: "Ja. Öffne {brand} im Browser und installiere es über den Hinweis bzw. das Browsermenü („App installieren“ oder „Zum Startbildschirm“). Es startet dann wie eine App, auf dem Startbildschirm und mit Benachrichtigungen.",
        tags: "android pwa installieren startbildschirm homescreen",
      },
      {
        id: "push",
        q: "Wie erhalte ich Push-Mitteilungen im Browser?",
        a: "Unter [Einstellungen → Benachrichtigungen](/einstellungen/benachrichtigungen) schaltest du Push auf diesem Gerät ein. Blockiert dein Browser Mitteilungen, erlaube sie in den Website-Einstellungen.",
        tags: "push mitteilung browser",
      },
    ],
  },
  {
    id: "daten",
    title: "Datenschutz & Daten",
    icon: "lock",
    summary: "Datenexport, Werbung, Metadaten in Fotos.",
    links: [
      { href: "/einstellungen/konto", label: "Daten herunterladen" },
      { href: "/rechtliches/datenschutz", label: "Datenschutzerklärung" },
    ],
    articles: [
      {
        id: "datenexport",
        q: "Kann ich meine Daten herunterladen?",
        a: "Ja, jederzeit als JSON-Datei unter [Konto & Daten](/einstellungen/konto).",
        tags: "export daten herunterladen dsgvo",
      },
      {
        id: "werbung",
        q: "Werden meine Daten für Werbung genutzt?",
        a: "Nein. Wir verkaufen keine Daten und setzen keine Werbe- oder Tracking-Dienste ein. Mehr in der [Datenschutzerklärung](/rechtliches/datenschutz).",
        tags: "werbung tracking cookies",
      },
      {
        id: "exif",
        q: "Werden Standortdaten aus meinen Fotos entfernt?",
        a: "Ja. Beim Hochladen entfernen wir Metadaten wie EXIF-Angaben und GPS-Koordinaten aus Fotos und Videos automatisch.",
        tags: "exif gps standort metadaten",
      },
    ],
  },
];

export function helpCategory(id: string) {
  return HELP_CATEGORIES.find((c) => c.id === id) ?? null;
}

/** `{name}` durch Werte ersetzen; unbekannte Platzhalter bleiben stehen (Test fängt sie ab) */
export function fillHelp(text: string, vars: HelpVars) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k as keyof HelpVars]) : m));
}

/** Antwort für die Umgebung (Web oder iOS-App), mit eingesetzten Werten */
export function articleAnswer(a: HelpArticle, vars: HelpVars, inApp = false) {
  return fillHelp(inApp && a.inApp ? a.inApp : a.a, vars);
}

/** Auszeichnungen entfernen – für Suche und Vorschau */
export function plainHelp(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^- /gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
