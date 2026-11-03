"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { LikeButton, ReportDialog, SaveButton, ShareButton } from "@/components/social/actions";

/** Lesende Aktionen am Artikel: Gefällt mir, Speichern, Teilen, Melden. */
export function ArticleActions({
  articleId,
  liked,
  likes,
  saved,
  url,
  title,
  canReport,
  commentCount,
}: {
  articleId: string;
  liked: boolean;
  likes: number;
  saved: boolean;
  url: string;
  title: string;
  canReport: boolean;
  commentCount?: number;
}) {
  const [reporting, setReporting] = useState(false);
  return (
    <div className="flex items-center gap-6">
      <LikeButton type="ARTICLE" id={articleId} liked={liked} count={likes} />
      <SaveButton type="ARTICLE" id={articleId} saved={saved} label />
      <ShareButton url={url} title={title} />
      {commentCount != null && (
        <a href="#kommentare" className="text-[13px] text-muted hover:text-ink">
          {commentCount} {commentCount === 1 ? "Kommentar" : "Kommentare"}
        </a>
      )}
      {canReport && (
        <>
          <button type="button" onClick={() => setReporting(true)} className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
            <Flag size={14} /> Melden
          </button>
          <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="ARTICLE" targetId={articleId} />
        </>
      )}
    </div>
  );
}
