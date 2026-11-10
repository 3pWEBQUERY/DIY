import "server-only";
import { db, type Tx, type TargetType } from "@/server/db";
import { isPublicProduct } from "@/server/commerce/restock";

/**
 * Einheitlicher Zugriff auf interagierbare Ziele (Beitrag, Projekt, Anleitung, …):
 * Eigentümer, Sichtbarkeit, Zähler-Spalten und kanonischer Link.
 */
type Meta = { ownerId: string; visibility: string; state: string; title: string; href: string };

export async function targetMeta(type: TargetType, id: string): Promise<Meta | null> {
  switch (type) {
    case "POST": {
      const p = await db.post.findUnique({ where: { id }, select: { authorId: true, visibility: true, state: true, body: true } });
      return p && { ownerId: p.authorId, visibility: p.visibility, state: p.state, title: p.body.slice(0, 80) || "Beitrag", href: `/beitrag/${id}` };
    }
    case "PROJECT": {
      const p = await db.project.findUnique({ where: { id }, select: { ownerId: true, visibility: true, state: true, title: true, slug: true, owner: { select: { profile: { select: { handle: true } } } } } });
      return p && { ownerId: p.ownerId, visibility: p.visibility, state: p.state, title: p.title, href: `/u/${p.owner.profile?.handle}/${p.slug}` };
    }
    case "TUTORIAL": {
      const t = await db.tutorial.findUnique({ where: { id }, select: { authorId: true, state: true, title: true, slug: true } });
      return t && { ownerId: t.authorId, visibility: "PUBLIC", state: t.state, title: t.title, href: `/anleitungen/${t.slug}` };
    }
    case "PRODUCT": {
      const p = await db.product.findUnique({ where: { id }, select: { status: true, hideWhenSoldOut: true, title: true, slug: true, shop: { select: { ownerId: true, slug: true } } } });
      return p && { ownerId: p.shop.ownerId, visibility: "PUBLIC", state: isPublicProduct(p) ? "PUBLISHED" : "HIDDEN", title: p.title, href: `/markt/${p.shop.slug}/${p.slug}` };
    }
    case "ARTICLE": {
      const a = await db.blogArticle.findUnique({ where: { id }, select: { authorId: true, state: true, title: true, slug: true, author: { select: { profile: { select: { handle: true } } } } } });
      return a && { ownerId: a.authorId, visibility: "PUBLIC", state: a.state === "PUBLISHED" ? "PUBLISHED" : "HIDDEN", title: a.title, href: `/u/${a.author.profile?.handle}/blog/${a.slug}` };
    }
    case "COMMENT": {
      const c = await db.comment.findUnique({ where: { id }, select: { authorId: true, state: true, body: true, targetType: true, targetId: true } });
      if (!c) return null;
      const parent = await targetMeta(c.targetType, c.targetId);
      return { ownerId: c.authorId, visibility: "PUBLIC", state: c.state, title: c.body.slice(0, 80), href: parent?.href ?? "/" };
    }
    case "USER": {
      const u = await db.user.findUnique({ where: { id }, select: { status: true, profile: { select: { handle: true, displayName: true } } } });
      return u && { ownerId: id, visibility: "PUBLIC", state: u.status === "ACTIVE" ? "PUBLISHED" : "HIDDEN", title: u.profile?.displayName ?? "", href: `/u/${u.profile?.handle}` };
    }
    case "COMMUNITY": {
      const c = await db.community.findUnique({ where: { id }, select: { ownerId: true, state: true, name: true, slug: true } });
      return c && { ownerId: c.ownerId, visibility: "PUBLIC", state: c.state, title: c.name, href: `/c/${c.slug}` };
    }
    case "MESSAGE": {
      const m = await db.message.findUnique({ where: { id }, select: { senderId: true, state: true, conversationId: true } });
      return m && { ownerId: m.senderId, visibility: "PRIVATE", state: m.state, title: "Nachricht", href: `/nachrichten/${m.conversationId}` };
    }
    case "REVIEW": {
      const r = await db.review.findUnique({ where: { id }, select: { authorId: true, state: true, body: true, product: { select: { slug: true, shop: { select: { slug: true } } } } } });
      return r && { ownerId: r.authorId, visibility: "PUBLIC", state: r.state, title: r.body.slice(0, 80), href: `/markt/${r.product.shop.slug}/${r.product.slug}` };
    }
    case "TUTORIAL_STEP": {
      const s = await db.tutorialStep.findUnique({ where: { id }, select: { title: true, version: { select: { tutorial: { select: { authorId: true, slug: true, state: true } } } } } });
      return s && { ownerId: s.version.tutorial.authorId, visibility: "PUBLIC", state: s.version.tutorial.state, title: s.title, href: `/anleitungen/${s.version.tutorial.slug}` };
    }
  }
}

/** Zähler atomar anpassen (`by` meist ±1; beim Löschen eines Kommentars samt Antworten mehr). */
export async function bumpCounter(tx: Tx, type: TargetType, id: string, field: "like" | "save" | "comment", by: number) {
  const inc = { increment: by };
  switch (type) {
    case "POST":
      return tx.post.update({ where: { id }, data: field === "like" ? { likeCount: inc } : field === "save" ? { saveCount: inc } : { commentCount: inc } });
    case "PROJECT":
      return tx.project.update({ where: { id }, data: field === "like" ? { likeCount: inc } : field === "save" ? { saveCount: inc } : { commentCount: inc } });
    case "TUTORIAL":
      return field === "comment" ? null : tx.tutorial.update({ where: { id }, data: field === "like" ? { likeCount: inc } : { saveCount: inc } });
    case "PRODUCT":
      return field === "save" ? tx.product.update({ where: { id }, data: { saveCount: inc } }) : null;
    case "ARTICLE":
      return field === "like" ? tx.blogArticle.update({ where: { id }, data: { likeCount: inc } }) : null;
    case "COMMENT":
      return field === "like" ? tx.comment.update({ where: { id }, data: { likeCount: inc } }) : null;
    default:
      return null;
  }
}
