-- CreateTable
CREATE TABLE "Hashtag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HashtagUse" (
    "hashtagId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HashtagUse_pkey" PRIMARY KEY ("hashtagId","targetType","targetId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hashtag_name_key" ON "Hashtag"("name");

-- CreateIndex
CREATE INDEX "HashtagUse_targetType_targetId_idx" ON "HashtagUse"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "HashtagUse_hashtagId_targetType_createdAt_idx" ON "HashtagUse"("hashtagId", "targetType", "createdAt");

-- CreateIndex
CREATE INDEX "HashtagUse_createdAt_idx" ON "HashtagUse"("createdAt");

-- AddForeignKey
ALTER TABLE "HashtagUse" ADD CONSTRAINT "HashtagUse_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "Hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

