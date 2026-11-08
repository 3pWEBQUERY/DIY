import { describe, expect, it } from "vitest";
import { parseConfirm } from "@/components/ui/confirm";

describe("Bestätigungsdialog – Text aufteilen", () => {
  it("teilt Frage und Erläuterung und benennt die Schaltfläche nach dem Verb", () => {
    const o = parseConfirm("Datei endgültig löschen? Das kann nicht rückgängig gemacht werden.");
    expect(o.title).toBe("Datei endgültig löschen?");
    expect(o.body).toBe("Das kann nicht rückgängig gemacht werden.");
    expect(o.confirmLabel).toBe("Löschen");
    expect(o.tone).toBe("danger");
  });
  it("neutrale Aktionen sind nicht rot", () => {
    const o = parseConfirm("Shop pausieren? Offene Bestellungen sind nicht betroffen.");
    expect(o.confirmLabel).toBe("Pausieren");
    expect(o.tone).toBe("default");
    expect(parseConfirm("Blockierung von Lena aufheben?").tone).toBe("default");
  });
  it("ohne Verb am Ende: „Bestätigen“, eigene Beschriftung hat Vorrang", () => {
    expect(parseConfirm("Wirklich?").confirmLabel).toBe("Bestätigen");
    expect(parseConfirm({ title: "Artikel offline nehmen?", confirmLabel: "Offline nehmen" }).confirmLabel).toBe("Offline nehmen");
  });
});
