-- AuditEvent.actorId: ON DELETE SET NULL widersprach dem Unveränderlichkeits-Trigger (SET NULL ist ein UPDATE)
-- und hätte die Hash-Kette gebrochen. RESTRICT macht explizit: Konten mit Audit-Einträgen werden nicht hart gelöscht.
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_actorId_fkey";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
