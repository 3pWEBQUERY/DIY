-- CreateTable
CREATE TABLE "CategorySetting" (
    "slug" TEXT NOT NULL,
    "name" TEXT,
    "short" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFocus" BOOLEAN,
    "sortOrder" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "CategorySetting_pkey" PRIMARY KEY ("slug")
);
