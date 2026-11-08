import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { getEvent } from "@/server/communities/events";
import { Page, PageHeader } from "@/components/shell/page";
import { EventForm } from "@/components/events/event-form";
import { CancelEventButton } from "@/components/events/rsvp";

export const metadata: Metadata = { title: "Event bearbeiten", robots: { index: false } };

export default async function EditEventPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const user = await currentUser();
  if (!user?.profile) redirect(`/anmelden?weiter=/c/${slug}/events/${id}/bearbeiten`);
  const e = await getEvent(id, user);
  if (!e || e.community.slug !== slug.toLowerCase()) notFound();
  if (!e.canEdit) redirect(e.href);
  return (
    <Page width="feed">
      <Link href={e.href} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Zum Event
      </Link>
      <PageHeader kicker={`${e.community.name} · Events`} title="Event bearbeiten" description="Ändern sich Zeit oder Ort, informieren wir alle Teilnehmenden automatisch." actions={<CancelEventButton eventId={e.id} slug={e.community.slug} />} />
      <EventForm
        communityId={e.communityId}
        slug={e.community.slug}
        eventId={e.id}
        initial={{
          title: e.title,
          description: e.description,
          kind: e.kind,
          mode: e.mode as "IN_PERSON" | "ONLINE",
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          locationName: e.locationName,
          address: e.address,
          onlineUrl: e.onlineUrl,
          capacity: e.capacity ? String(e.capacity) : "",
          costNote: e.costNote,
        }}
      />
    </Page>
  );
}
