import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { getCommunityPage } from "@/server/communities/service";
import { Page, PageHeader } from "@/components/shell/page";
import { EventForm } from "@/components/events/event-form";
import { Notice } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Event erstellen", robots: { index: false } };

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await currentUser();
  if (!user?.profile) redirect(`/anmelden?weiter=/c/${slug}/events/neu`);
  const data = await getCommunityPage(slug, user);
  if (!data) notFound();
  const c = data.community;
  return (
    <Page width="feed">
      <Link href={`/c/${c.slug}?tab=events`} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> {c.name}
      </Link>
      <PageHeader kicker={`${c.name} · Events`} title="Event erstellen" description="Treffen, Workshop oder Tauschbörse – vor Ort oder online. Du bist automatisch dabei und kannst das Event später ändern oder absagen." />
      {data.isMember && !data.muted ? (
        <EventForm communityId={c.id} slug={c.slug} />
      ) : (
        <Notice tone="warn">{data.muted ? "Du bist in dieser Community gerade stummgeschaltet." : "Tritt der Community bei, um ein Event zu erstellen."}</Notice>
      )}
    </Page>
  );
}
