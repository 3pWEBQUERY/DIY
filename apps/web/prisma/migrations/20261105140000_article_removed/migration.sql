-- Artikel können von der Administration entfernt werden (analog Projekte/Beiträge)
ALTER TYPE "ArticleState" ADD VALUE IF NOT EXISTS 'REMOVED';
