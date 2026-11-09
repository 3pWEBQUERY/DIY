-- Koautorenschaft für Beiträge
CREATE TABLE "PostCoauthor" (
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "PostCoauthor_pkey" PRIMARY KEY ("postId", "userId")
);
CREATE INDEX "PostCoauthor_userId_status_idx" ON "PostCoauthor"("userId", "status");
ALTER TABLE "PostCoauthor" ADD CONSTRAINT "PostCoauthor_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostCoauthor" ADD CONSTRAINT "PostCoauthor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
