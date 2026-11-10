-- Audit-Kette verankern (D-14): Hash-Verfahren je Eintrag, Prüfpunkte.
-- ADD COLUMN mit Konstante als Default schreibt keine Zeilen um (kein UPDATE) – der Trigger
-- "AuditEvent_immutable" greift deshalb nicht; bestehende Einträge gelten als "sha256".
ALTER TABLE "AuditEvent" ADD COLUMN     "alg" TEXT NOT NULL DEFAULT 'sha256';

-- CreateTable
CREATE TABLE "AuditCheckpoint" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "mac" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditCheckpoint_seq_idx" ON "AuditCheckpoint"("seq");

-- Prüfpunkte sind wie das Protokoll selbst unveränderlich (nicht im Prisma-Schema abbildbar)
CREATE OR REPLACE FUNCTION wr_audit_checkpoint_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditCheckpoint ist unveränderlich';
END $$;
CREATE TRIGGER "AuditCheckpoint_immutable" BEFORE UPDATE OR DELETE ON "AuditCheckpoint"
  FOR EACH ROW EXECUTE FUNCTION wr_audit_checkpoint_immutable();
