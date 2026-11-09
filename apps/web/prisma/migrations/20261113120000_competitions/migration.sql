-- Wettbewerbe mit Einreichungen und Abstimmung
ALTER TABLE "CommunityChallenge"
  ADD COLUMN "rules" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "prize" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "judging" TEXT NOT NULL DEFAULT 'VOTES',
  ADD COLUMN "votingEndsAt" TIMESTAMP(3),
  ADD COLUMN "resultsAt" TIMESTAMP(3),
  ADD COLUMN "entryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "notified" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "createdById" TEXT;
-- Bestehende Challenges: Abstimmung eine Woche nach Einreichungsschluss
UPDATE "CommunityChallenge" SET "votingEndsAt" = "endsAt" + interval '7 days';
-- Bereits beendete Challenges ohne Einreichungen nicht nachträglich melden
UPDATE "CommunityChallenge" SET "notified" = ARRAY['voting','jury','results'], "resultsAt" = "endsAt" + interval '7 days' WHERE "endsAt" + interval '7 days' < now();

CREATE TABLE "ChallengeEntry" (
  "id" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "voteCount" INTEGER NOT NULL DEFAULT 0,
  "place" INTEGER,
  "state" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChallengeEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChallengeEntry_challengeId_userId_key" ON "ChallengeEntry"("challengeId", "userId");
CREATE INDEX "ChallengeEntry_challengeId_state_idx" ON "ChallengeEntry"("challengeId", "state");
ALTER TABLE "ChallengeEntry" ADD CONSTRAINT "ChallengeEntry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "CommunityChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeEntry" ADD CONSTRAINT "ChallengeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeEntry" ADD CONSTRAINT "ChallengeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChallengeVote" (
  "entryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChallengeVote_pkey" PRIMARY KEY ("entryId", "userId")
);
CREATE INDEX "ChallengeVote_challengeId_userId_idx" ON "ChallengeVote"("challengeId", "userId");
ALTER TABLE "ChallengeVote" ADD CONSTRAINT "ChallengeVote_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ChallengeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeVote" ADD CONSTRAINT "ChallengeVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
