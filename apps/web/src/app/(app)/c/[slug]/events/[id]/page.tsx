import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, Clock, Coins, Lock, MapPin, Pencil, Users, Video } from "lucide-react";
import { EVENT_KIND_LABEL } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getEvent } from "@/server/communities/events";
import { Page } from "@/components/shell/page";
import { DateTile, eventDate, eventTime } from "@/components/events/event-card";
import { RsvpButtons } from "@/components/events/rsvp";
import { ShareButton } from "@/components/social/actions";
import { Avatar, Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { LinkButton, buttonClass } from "@/components/ui/button";

type Props = { params: Promise<{ slug: string; id: string }> };

const load = cache(async (id: string) => {
  const viewer = await currentUser();
  return { viewer, e: await getEvent(id, viewer) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { e } = await load(id);
  if (!e) return { title: "Event", robots: { index: false } };
  return { title: `${e.title} · ${e.community.name}`, description: e.description.slice(0, 160) || `${EVENT_KIND_LABEL[e.kind as keyof typeof EVENT_KIND_LABEL]} am ${eventDate(e.startsAt)}` };
}

export default async function EventPage({ params }: Props) {
  const { slug, id } = await params;
  const { viewer, e } = await load(id);
  if (!e || e.community.slug !== slug.toLowerCase()) notFound();
  const sameDay = eventDate(e.startsAt) === eventDate(e.endsAt);
  const mapQuery = encodeURIComponent([e.locationName, e.address].filter(Boolean).join(", "));
  const spots = e.capacity ? Math.max(0, e.capacity - e.goingCount) : null;

  return (
    <Page width="wide">
      <Link href={`/c/${e.community.slug}?tab=events`} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> {e.community.name} · Events
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="min-w-0">
          <div className="flex items-start gap-5">
            <DateTile iso={e.startsAt} muted={e.cancelled || e.past} className="size-[72px] [&_span_span:first-child]:text-[26px]" />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5">
                <Badge tone="outline">{EVENT_KIND_LABEL[e.kind as keyof typeof EVENT_KIND_LABEL] ?? e.kind}</Badge>
                {e.cancelled && <Badge tone="danger">Abgesagt</Badge>}
                {e.past && !e.cancelled && <Badge>Vorbei</Badge>}
              </p>
              <h1 className="display mt-2 text-[2.2rem] text-balance sm:text-[2.8rem]">{e.title}</h1>
              <p className="mt-2 text-sm text-muted">
                von{" "}
                <Link href={`/u/${e.organizer.handle}`} className="font-semibold text-ink hover:underline">
                  {e.organizer.displayName}
                </Link>{" "}
                in{" "}
                <Link href={`/c/${e.community.slug}`} className="font-semibold text-ink hover:underline">
                  {e.community.name}
                </Link>
              </p>
            </div>
          </div>

          {e.cancelled && (
            <Notice tone="danger" className="mt-8" title="Dieses Event wurde abgesagt">
              {e.cancelReason || "Die Veranstalterin bzw. der Veranstalter hat das Event abgesagt."}
            </Notice>
          )}

          <dl className="mt-8 grid gap-4 rounded-2xl border border-line bg-card p-5 sm:grid-cols-2">
            <div className="flex gap-3">
              <Clock size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              <div>
                <dt className="sr-only">Wann</dt>
                <dd className="font-semibold">{eventDate(e.startsAt)}</dd>
                <dd className="text-sm text-ink-2">
                  {eventTime(e.startsAt)} – {sameDay ? eventTime(e.endsAt) : `${eventDate(e.endsAt)}, ${eventTime(e.endsAt)}`} Uhr
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              {e.mode === "ONLINE" ? <Video size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden /> : <MapPin size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />}
              <div className="min-w-0">
                <dt className="sr-only">Wo</dt>
                {e.mode === "ONLINE" ? (
                  <>
                    <dd className="font-semibold">Online</dd>
                    {e.onlineUrl ? (
                      <dd className="truncate text-sm">
                        <a href={e.onlineUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-moss underline underline-offset-2">
                          {e.onlineUrl.replace(/^https:\/\//, "")}
                        </a>
                      </dd>
                    ) : (
                      <dd className="inline-flex items-center gap-1 text-sm text-muted">
                        <Lock size={12} aria-hidden /> Link nach Zusage sichtbar
                      </dd>
                    )}
                  </>
                ) : (
                  <>
                    <dd className="font-semibold">{e.locationName || "Vor Ort"}</dd>
                    {e.address && <dd className="text-sm text-ink-2">{e.address}</dd>}
                    {mapQuery && (
                      <dd className="text-sm">
                        <a href={`https://www.openstreetmap.org/search?query=${mapQuery}`} target="_blank" rel="noopener noreferrer" className="text-moss underline underline-offset-2">
                          Auf der Karte zeigen
                        </a>
                      </dd>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Users size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              <div>
                <dt className="sr-only">Teilnehmende</dt>
                <dd className="font-semibold num">
                  {e.goingCount} dabei{e.interestedCount ? ` · ${e.interestedCount} interessiert` : ""}
                </dd>
                {spots != null && <dd className="text-sm text-ink-2">{spots ? `Noch ${spots} von ${e.capacity} Plätzen frei` : "Ausgebucht"}</dd>}
              </div>
            </div>
            {e.costNote && (
              <div className="flex gap-3">
                <Coins size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                <div>
                  <dt className="sr-only">Kosten</dt>
                  <dd className="font-semibold">{e.costNote}</dd>
                  <dd className="text-sm text-muted">Bezahlung direkt bei der Veranstalterin bzw. dem Veranstalter</dd>
                </div>
              </div>
            )}
          </dl>

          {e.description && (
            <section className="mt-10" aria-labelledby="ev-about">
              <SectionTitle n="01" title={<span id="ev-about">Worum es geht</span>} />
              <p className="mt-4 whitespace-pre-line text-[15.5px] leading-relaxed text-ink-2">{e.description}</p>
            </section>
          )}

          <section className="mt-10" aria-labelledby="ev-people">
            <SectionTitle n={e.description ? "02" : "01"} title={<span id="ev-people">Dabei ({e.goingCount})</span>} />
            {e.attendees.length ? (
              <ul className="mt-4 flex flex-wrap gap-3">
                {e.attendees.map((a) => (
                  <li key={a.id}>
                    <Link href={`/u/${a.handle}`} className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-3 text-sm hover:border-rule-strong">
                      <Avatar src={a.avatarUrl} name={a.displayName} size={28} />
                      {a.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">Noch niemand – sei die erste Person.</p>
            )}
          </section>
        </article>

        <aside className="h-fit space-y-4 lg:sticky lg:top-10" aria-label="Teilnahme">
          <div className="rounded-2xl border border-line bg-card p-5">
            {e.canAttend ? (
              <RsvpButtons eventId={e.id} status={e.myStatus} full={e.full} isOrganizer={viewer?.id === e.organizer.id} />
            ) : e.cancelled || e.past ? (
              <p className="text-sm text-muted">{e.cancelled ? "Abgesagt – keine Anmeldung möglich." : "Dieses Event ist vorbei."}</p>
            ) : viewer ? (
              <div>
                <p className="text-sm text-muted">Tritt der Community bei, um teilzunehmen.</p>
                <LinkButton href={`/c/${e.community.slug}`} className="mt-3" variant="outline">
                  Zur Community
                </LinkButton>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted">Melde dich an, um teilzunehmen.</p>
                <LinkButton href={`/anmelden?weiter=${encodeURIComponent(e.href)}`} className="mt-3">
                  Anmelden
                </LinkButton>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!e.cancelled && !e.past && (
              <a href={`/api/v1/events/${e.id}/ics`} download className={buttonClass("outline")}>
                <CalendarPlus size={15} aria-hidden /> Zum Kalender
              </a>
            )}
            <ShareButton variant="button" url={e.href} title={e.title} />
            {e.canEdit && (
              <LinkButton href={`${e.href}/bearbeiten`} variant="outline">
                <Pencil size={14} aria-hidden /> Bearbeiten
              </LinkButton>
            )}
          </div>
        </aside>
      </div>
    </Page>
  );
}
