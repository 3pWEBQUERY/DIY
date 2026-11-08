import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Banknote, Check, Circle, Minus } from "lucide-react";
import { SHOP_STATUS_LABEL } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getMyShop } from "@/server/commerce/shops";
import { paymentsMode } from "@/server/commerce/stripe";
import { formatBps } from "@/server/commerce/rules";
import { getSetting } from "@/server/settings";
import { PageHeader } from "@/components/shell/page";
import { LinkButton } from "@/components/ui/button";
import { ShopWizard, type ShopFormValues } from "@/components/commerce/shop-wizard";
import { PauseShopButton, RefreshStripeButton, SimulateVerificationButton, StripeOnboardingButton } from "@/components/commerce/shop-controls";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { describeStripeNote } from "@/lib/stripe-status";

export const metadata: Metadata = { title: "Shopverwaltung" };

function Step({ done, active, title, body, children }: { done: boolean; active?: boolean; title: string; body?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="relative pb-7 pl-8 last:pb-0">
      <span aria-hidden className={cn("absolute -left-[9px] top-0.5 grid size-[17px] place-items-center border rounded-xl", done ? "border-moss bg-moss text-paper" : active ? "border-rule bg-paper" : "border-line-strong bg-paper text-line-strong")}>
        {done ? <Check size={11} strokeWidth={3} /> : active ? <Circle size={6} className="fill-ink" /> : <Minus size={10} />}
      </span>
      <p className={cn("text-[14.5px]", done || active ? "font-semibold" : "text-muted")}>
        {title}
        <span className="sr-only">{done ? " – erledigt" : active ? " – aktueller Schritt" : " – ausstehend"}</span>
      </p>
      {body && <div className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{body}</div>}
      {children && <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>}
    </li>
  );
}

/** Shop-Eröffnung, Verifizierungsstatus und Einstellungen (§13.2). */
export default async function StudioShopPage({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  if (!user?.profile) redirect("/anmelden?weiter=/studio/shop");
  const [shop, feeBps] = await Promise.all([getMyShop(user.id), getSetting("commerce.feeBps")]);
  const mode = paymentsMode();
  const v = shop?.verification;

  const initial: ShopFormValues = {
    name: shop?.name ?? "",
    slug: shop?.slug ?? "",
    tagline: shop?.tagline ?? "",
    description: shop?.description ?? "",
    sellerType: shop?.sellerType ?? "PRIVATE",
    legalName: v?.legalName ?? "",
    businessName: v?.businessName ?? "",
    vatId: v?.vatId ?? "",
    addressLine: v?.addressLine ?? "",
    postalCode: v?.postalCode ?? "",
    city: v?.city ?? "",
    country: ((v?.country ?? shop?.country ?? "CH") as ShopFormValues["country"]),
    shippingPolicy: shop?.shippingPolicy ?? "",
    returnPolicy: shop?.returnPolicy ?? "",
    processingDays: shop?.processingDays ?? 3,
  };

  if (!shop || shop.status === "DRAFT") {
    return (
      <div>
        <PageHeader
          kicker="Creator Studio · Shop"
          title={shop ? "Shop fertig einrichten" : "Eröffne deinen Shop"}
          description="Verkaufe Einzelstücke, Kleinserien, Materialsets oder digitale Anleitungen – direkt neben deinen Projekten. Der Marktplatz ergänzt die Community, er ersetzt sie nicht."
        />
        {v?.state === "REJECTED" && (
          <Notice tone="danger" className="mb-8 max-w-2xl" title="Dein Antrag wurde nicht freigegeben">
            {describeStripeNote(v.notes)?.text ?? (v.notes || "Bitte prüfe deine Angaben und reiche den Antrag erneut ein.")}
          </Notice>
        )}
        {!shop && (
          <dl className="mb-12 grid max-w-3xl gap-6 border-y border-line py-6 sm:grid-cols-3">
            <div>
              <dt className="spec">Provision</dt>
              <dd className="mt-1 text-2xl font-semibold num">{formatBps(feeBps)}</dd>
              <dd className="mt-1 text-[12.5px] text-muted">nur auf den Warenwert verkaufter Artikel – keine Grund- oder Listungsgebühr</dd>
            </div>
            <div>
              <dt className="spec">Auszahlung</dt>
              <dd className="mt-1 text-2xl font-semibold">Stripe</dd>
              <dd className="mt-1 text-[12.5px] text-muted">direkt auf dein Bankkonto; Stripe-Gebühren werden separat ausgewiesen</dd>
            </div>
            <div>
              <dt className="spec">Dauer</dt>
              <dd className="mt-1 text-2xl font-semibold num">~10 Min.</dd>
              <dd className="mt-1 text-[12.5px] text-muted">Angaben ausfüllen und Identität bei Stripe bestätigen</dd>
            </div>
          </dl>
        )}
        <ShopWizard initial={initial} mode="wizard" slugLocked={false} emailVerified={!!user.emailVerifiedAt} />
      </div>
    );
  }

  const accountConnected = !!shop.stripeAccountId;
  const active = shop.status === "ACTIVE" || shop.status === "PAUSED";
  const verified = v?.state === "VERIFIED";
  const stripeNote = describeStripeNote(v?.notes);
  // Stripe-Modus: nur ein echtes, bei Stripe ausgefülltes Konto zählt – eine manuelle Freigabe ersetzt es nicht
  const stripeDetailsDone = accountConnected && (shop.chargesEnabled || (!!v && v.state !== "NOT_STARTED" && !/ausstehend/.test(v.notes ?? "")));
  const connectDone = mode === "stripe" ? stripeDetailsDone : accountConnected || verified;

  return (
    <div>
      <PageHeader
        kicker="Creator Studio · Shop"
        title={shop.name}
        description={shop.tagline || undefined}
        actions={
          <>
            <Badge tone={shop.status === "ACTIVE" ? "moss" : shop.status === "SUSPENDED" ? "danger" : "warn"}>{SHOP_STATUS_LABEL[shop.status]}</Badge>
            <Link href={`/markt/${shop.slug}`} className="text-[13.5px] font-semibold underline underline-offset-2">
              Shopseite ansehen
            </Link>
          </>
        }
      />

      {shop.status === "SUSPENDED" && (
        <Notice tone="danger" className="mb-8 max-w-3xl" title="Dein Shop ist gesperrt">
          Produkte sind nicht sichtbar und können nicht gekauft werden. Details und die Möglichkeit zum Einspruch findest du in deinen Benachrichtigungen.
        </Notice>
      )}

      <div className="grid gap-14 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <SectionTitle n="01" title="Einstellungen" className="mb-8" />
          <ShopWizard initial={initial} mode="settings" slugLocked emailVerified={!!user.emailVerifiedAt} />
        </div>

        <aside className="space-y-10">
          <section aria-labelledby="verifizierung">
            <SectionTitle n="02" title={<span id="verifizierung">Verifizierung & Auszahlung</span>} action={accountConnected ? <RefreshStripeButton auto={sp.stripe === "zurueck"} /> : undefined} />
            {mode === "disabled" && (
              <Notice tone="warn" className="mt-5" title="Zahlungen noch nicht aktiviert">
                Die Verifizierung über Stripe ist freigeschaltet, sobald die Zahlungsabwicklung aktiviert ist. Dein Antrag bleibt gespeichert.
              </Notice>
            )}
            {mode === "stripe" && sp.stripe === "erneut" && (
              <Notice tone="warn" className="mt-5" title="Der Stripe-Link ist abgelaufen">
                Das passiert, wenn die Seite länger offen war. Klicke einfach erneut auf „Auszahlungskonto verbinden“.
              </Notice>
            )}
            {mode === "stripe" && !accountConnected && verified && (
              <Notice tone="warn" className="mt-5" title="Auszahlungskonto fehlt noch">
                Dein Shop ist freigegeben. Damit Kundinnen und Kunden bezahlen können und du Auszahlungen erhältst, verbinde jetzt dein Auszahlungskonto bei Stripe.
              </Notice>
            )}
            {mode === "simulated" && !active && (
              <Notice tone="warn" className="mt-5" title="Testmodus">
                Stripe ist in dieser Umgebung nicht konfiguriert. Du kannst die Verifizierung simulieren, um den Ablauf zu testen.
              </Notice>
            )}
            <ol className="relative ml-2 mt-6 border-l border-line">
              <Step done title="Antrag eingereicht" body="Shop- und Anbieterangaben liegen vor." />
              <Step
                done={connectDone}
                active={!connectDone}
                title="Auszahlungskonto verbinden"
                body="Bei Stripe bestätigst du Identität und Bankverbindung. Werkuno sieht keine Kontodaten."
              >
                {!connectDone && mode === "stripe" && <StripeOnboardingButton label={accountConnected ? "Angaben bei Stripe fortsetzen" : "Auszahlungskonto verbinden"} />}
                {!verified && mode === "simulated" && <SimulateVerificationButton />}
              </Step>
              <Step
                done={shop.chargesEnabled || (verified && mode !== "stripe")}
                active={connectDone && !shop.chargesEnabled}
                title="Zahlungen empfangen"
                body={
                  accountConnected && !shop.chargesEnabled ? (
                    <span className="block">
                      <span className={cn("mb-0.5 inline-flex items-center gap-1.5 font-semibold", stripeNote?.tone === "problem" ? "text-danger" : stripeNote?.tone === "action" ? "text-clay-ink" : "text-ink")}>
                        {stripeNote?.tone === "info" && <span className="size-1.5 animate-pulse rounded-full bg-moss" aria-hidden />}
                        {stripeNote?.title ?? "Wird geprüft"}
                      </span>
                      <span className="block">{stripeNote?.text ?? "Stripe prüft deine Angaben – das dauert meist nur wenige Minuten."}</span>
                    </span>
                  ) : undefined
                }
              >
                {connectDone && !shop.chargesEnabled && mode === "stripe" && stripeNote?.needsAction !== false && <StripeOnboardingButton label="Angaben bei Stripe ergänzen" />}
              </Step>
              <Step done={shop.payoutsEnabled || (verified && mode !== "stripe")} active={shop.chargesEnabled && !shop.payoutsEnabled} title="Auszahlungen aktiv" />
              <Step
                done={active && (mode !== "stripe" || shop.chargesEnabled)}
                active={!active || (mode === "stripe" && !shop.chargesEnabled)}
                title="Shop aktiv"
                body={
                  active && mode === "stripe" && !shop.chargesEnabled
                    ? "Freigegeben – Käufe sind möglich, sobald Stripe dein Auszahlungskonto bestätigt hat."
                    : active
                      ? "Du kannst Produkte veröffentlichen."
                      : "Sobald Stripe die Prüfung abschliesst, wird dein Shop automatisch aktiv."
                }
              />
            </ol>
            {accountConnected && mode === "stripe" && (
              <div className="mt-6">
                <LinkButton href="/studio/einnahmen#auszahlungen" variant="outline">
                  <Banknote size={15} aria-hidden /> Guthaben & Auszahlungen
                </LinkButton>
              </div>
            )}
          </section>

          {active && (
            <section aria-labelledby="pause">
              <SectionTitle n="03" title={<span id="pause">Pause</span>} />
              <p className="mt-4 text-[13.5px] leading-relaxed text-ink-2">
                {shop.status === "PAUSED"
                  ? "Dein Shop ist pausiert. Produkte bleiben sichtbar, können aber nicht bestellt werden."
                  : "Ferien oder volle Werkbank? Pausiere den Shop – offene Bestellungen bleiben bestehen."}
              </p>
              <div className="mt-4">
                <PauseShopButton paused={shop.status === "PAUSED"} />
              </div>
            </section>
          )}

          <section className="border-t border-line pt-5 text-[12.5px] leading-relaxed text-muted">
            <p className="spec mb-1">Gebühren</p>
            Plattformprovision {formatBps(feeBps)} auf den Warenwert (ohne Versand), nur bei abgeschlossenen Verkäufen. Bei Erstattungen wird die Provision anteilig zurückerstattet. Die Gebühren von
            Stripe werden von Stripe separat abgezogen.
          </section>
        </aside>
      </div>
    </div>
  );
}
