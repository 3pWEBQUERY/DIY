-- Umfragen in Beiträgen
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "voterCount" INTEGER NOT NULL DEFAULT 0,
    "endNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Poll_postId_key" ON "Poll"("postId");
CREATE INDEX "Poll_endsAt_endNotifiedAt_idx" ON "Poll"("endsAt", "endNotifiedAt");
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PollOption_pollId_position_idx" ON "PollOption"("pollId", "position");
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PollVote" (
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("pollId", "userId", "optionId")
);
CREATE INDEX "PollVote_userId_idx" ON "PollVote"("userId");
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
