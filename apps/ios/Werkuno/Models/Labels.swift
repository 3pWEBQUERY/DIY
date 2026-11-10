import Foundation

/// Spiegel von `packages/shared/src/enums.ts` & `commerce.ts` & `account.ts` – gleiche Werte wie Web.
enum L {
    static let projectStatus: [(key: String, label: String)] = [
        ("IDEA", "Idee"), ("PLANNING", "In Planung"), ("IN_PROGRESS", "In Bearbeitung"),
        ("PAUSED", "Pausiert"), ("COMPLETED", "Abgeschlossen"), ("ARCHIVED", "Archiviert"),
    ]
    static func projectStatus(_ k: String?) -> String { projectStatus.first { $0.key == k }?.label ?? (k ?? "") }

    static let difficulty: [Int: String] = [1: "Einsteiger", 2: "Leicht", 3: "Mittel", 4: "Fortgeschritten", 5: "Meisterstück"]

    static let visibility: [(key: String, label: String)] = [("PUBLIC", "Öffentlich"), ("FOLLOWERS", "Nur Follower"), ("PRIVATE", "Nur ich")]
    static func visibility(_ k: String?) -> String { visibility.first { $0.key == k }?.label ?? (k ?? "") }

    static let safety: [(key: String, label: String, symbol: String)] = [
        ("ELECTRICITY", "Strom", "bolt.fill"), ("HEAT", "Hitze", "flame.fill"), ("CHEMICALS", "Chemikalien", "flask.fill"),
        ("SHARP_TOOLS", "Scharfe Werkzeuge", "scissors"), ("POWER_TOOLS", "Elektrowerkzeuge", "wrench.and.screwdriver.fill"),
        ("CHILDREN", "Kinderprodukt", "figure.and.child.holdinghands"), ("DUST", "Staub & Dämpfe", "aqi.medium"),
    ]
    static func safety(_ k: String) -> (label: String, symbol: String) {
        let s = safety.first { $0.key == k }
        return (s?.label ?? k, s?.symbol ?? "exclamationmark.triangle.fill")
    }

    static let orderStatus: [String: String] = [
        "PENDING_PAYMENT": "Zahlung offen", "NEW": "Neu", "IN_PROGRESS": "In Bearbeitung", "READY_TO_SHIP": "Versandbereit",
        "SHIPPED": "Versendet", "COMPLETED": "Abgeschlossen", "CANCELLED": "Storniert", "REFUNDED": "Erstattet", "PROBLEM": "Problemfall",
    ]
    /// Erlaubte Übergänge der Bestell-Statusmaschine (Verkäufersicht)
    static let orderTransitions: [String: [String]] = [
        "PENDING_PAYMENT": ["CANCELLED"], "NEW": ["IN_PROGRESS", "CANCELLED", "PROBLEM"], "IN_PROGRESS": ["READY_TO_SHIP", "CANCELLED", "PROBLEM"],
        "READY_TO_SHIP": ["SHIPPED", "PROBLEM"], "SHIPPED": ["COMPLETED", "PROBLEM"], "COMPLETED": ["PROBLEM"], "CANCELLED": [], "REFUNDED": [],
        "PROBLEM": ["IN_PROGRESS", "SHIPPED", "COMPLETED", "CANCELLED"],
    ]
    static let paymentStatus: [String: String] = [
        "REQUIRES_PAYMENT": "Zahlung offen", "PROCESSING": "Zahlung in Prüfung", "SUCCEEDED": "Bezahlt", "FAILED": "Fehlgeschlagen",
        "CANCELLED": "Abgebrochen", "REFUNDED": "Erstattet", "PARTIALLY_REFUNDED": "Teilweise erstattet", "DISPUTED": "Zahlung angefochten",
    ]
    static let productKind: [(key: String, label: String)] = [
        ("UNIQUE", "Einzelstück"), ("SMALL_BATCH", "Kleinserie"), ("MADE_TO_ORDER", "Auf Bestellung"), ("KIT", "DIY-Materialset"), ("DIGITAL", "Digitale Anleitung"),
    ]
    static func productKind(_ k: String?) -> String { productKind.first { $0.key == k }?.label ?? (k ?? "") }
    static let productStatus: [String: String] = ["DRAFT": "Entwurf", "ACTIVE": "Aktiv", "PAUSED": "Pausiert", "SOLD_OUT": "Ausverkauft", "DISABLED": "Deaktiviert"]
    static let shopStatus: [String: String] = ["DRAFT": "Entwurf", "PENDING_VERIFICATION": "Verifizierung läuft", "ACTIVE": "Aktiv", "PAUSED": "Pausiert", "SUSPENDED": "Gesperrt"]
    static let sellerType: [(key: String, label: String)] = [("PRIVATE", "Privatperson"), ("BUSINESS", "Gewerblich")]
    static let shipCountries: [(key: String, label: String)] = [("CH", "Schweiz"), ("DE", "Deutschland"), ("AT", "Österreich"), ("LI", "Liechtenstein")]
    static let profileCountries: [(key: String, label: String)] = [("CH", "Schweiz"), ("DE", "Deutschland"), ("AT", "Österreich"), ("LI", "Liechtenstein"), ("FR", "Frankreich"), ("IT", "Italien"), ("OTHER", "Anderes Land")]
    static func country(_ k: String?) -> String { profileCountries.first { $0.key == k }?.label ?? (k ?? "") }

    static let reportReasons: [(key: String, label: String)] = [
        ("SPAM", "Spam oder Werbung"), ("HARASSMENT", "Belästigung"), ("HATE", "Hassrede"), ("COPYRIGHT", "Urheberrechtsverletzung"),
        ("DANGEROUS", "Gefährliche Anleitung"), ("PROHIBITED_ITEM", "Verbotenes Produkt"), ("SCAM", "Betrug"),
        ("NUDITY", "Unangemessene Inhalte"), ("MISINFORMATION", "Fehlerhafte Information"), ("OTHER", "Anderes"),
    ]
    static let moderationActions: [(key: String, label: String)] = [
        ("NONE", "Keine Massnahme"), ("WARN", "Verwarnung"), ("LIMIT_REACH", "Reichweite beschränken"), ("HIDE", "Inhalt ausblenden"),
        ("REMOVE", "Inhalt entfernen"), ("DISABLE_LISTING", "Angebot deaktivieren"), ("RESTRICT_MESSAGING", "Nachrichten einschränken"),
        ("SUSPEND", "Account zeitweise sperren"), ("BAN", "Account dauerhaft sperren"),
    ]
    static let notificationTypes: [(key: String, label: String)] = [
        ("FOLLOW", "Neue Follower"), ("COMMENT", "Kommentare"), ("REPLY", "Antworten"), ("MENTION", "Erwähnungen"), ("LIKE", "Gefällt-mir"),
        ("PROJECT_ACTIVITY", "Projektaktivität"), ("REMIX", "Nachbauten deiner Projekte"), ("NEW_POST_FROM_FOLLOWED", "Neue Beiträge gefolgter Creator"),
        ("MESSAGE", "Nachrichten"), ("ORDER_NEW", "Neue Bestellungen"), ("ORDER_STATUS", "Bestellstatus"), ("MODERATION", "Moderationsentscheidungen"),
        ("COMMUNITY_INVITE", "Community-Einladungen"), ("TUTORIAL_UPDATED", "Aktualisierte Anleitungen"), ("SECURITY", "Sicherheit"),
        ("RESTOCK", "Nachproduktion & wieder verfügbar"),
    ]
    static let emailDigest: [(key: String, label: String)] = [("OFF", "Keine E-Mails"), ("INSTANT", "Sofort"), ("DAILY", "Täglich gebündelt"), ("WEEKLY", "Wöchentlich gebündelt")]
    static let feedDefaults: [(key: String, label: String)] = [("FOR_YOU", "Für dich"), ("FOLLOWING", "Folge ich"), ("NEW", "Neu")]
    static let dmPolicies: [(key: String, label: String)] = [("EVERYONE", "Alle Mitglieder"), ("FOLLOWING", "Nur Personen, denen ich folge"), ("NOBODY", "Niemand (ausser bei Bestellungen)")]
    static let supportTopics: [(key: String, label: String)] = [
        ("GENERAL", "Allgemeine Frage"), ("ACCOUNT", "Konto & Anmeldung"), ("ORDER", "Bestellung & Zahlung"), ("SELLING", "Verkaufen & Shop"),
        ("SAFETY", "Sicherheit & Missbrauch"), ("PRIVACY", "Datenschutz & Auskunft"), ("BUG", "Fehler melden"),
    ]
    static let supportStatus: [String: String] = ["OPEN": "Offen", "IN_PROGRESS": "In Bearbeitung", "WAITING": "Wartet auf Antwort", "CLOSED": "Abgeschlossen"]
    static let communityVisibility: [(key: String, label: String)] = [("PUBLIC", "Öffentlich"), ("REQUEST", "Beitritt auf Anfrage"), ("PRIVATE", "Privat")]
    static let communityRoles: [String: String] = ["OWNER": "Gründer:in", "ADMIN": "Admin", "MODERATOR": "Moderation", "MEMBER": "Mitglied"]
    static let roles: [String: String] = ["MEMBER": "Mitglied", "PLATFORM_MODERATOR": "Moderation", "ADMIN": "Admin", "SUPERADMIN": "Superadmin"]
    static let tutorialDurations: [(key: String, label: String)] = [("kurz", "Bis 30 Min."), ("mittel", "30 Min. – 2 Std."), ("lang", "2 – 8 Std."), ("projekt", "Mehrere Tage")]
    static let calloutTones: [(key: String, label: String)] = [("info", "Hinweis"), ("tip", "Tipp"), ("warning", "Warnung")]
}
