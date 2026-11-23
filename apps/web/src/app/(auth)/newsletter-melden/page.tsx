import { LinkButton } from "@/components/ui/button";
import { reportContext } from "@/server/pro/newsletter";
import { flatSearchParams } from "@/lib/search-params";
import { NewsletterReportForm } from "./form";

export const metadata = { title: "Newsletter melden", robots: { index: false } };

/** Newsletter einer Creatorin melden (Link aus der Mail, ohne Anmeldung) */
export default async function NewsletterReportPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = flatSearchParams(await searchParams);
  const ctx = await reportContext(t);
  return (
    <>
      <p className="spec mb-3">Newsletter</p>
      <h1 className="display text-5xl">{ctx ? "Newsletter melden" : "Link ungültig"}</h1>
      {ctx ? (
        <>
          <p className="mt-3 text-muted">
            „{ctx.subject}“ von {ctx.creatorName}. Verstösst der Newsletter gegen unsere Richtlinien – etwa Spam, Betrug oder Belästigung –, prüft ihn unser Moderationsteam.
          </p>
          <NewsletterReportForm token={t!} handle={ctx.handle} />
        </>
      ) : (
        <>
          <p className="mt-3 text-muted">Dieser Link ist nicht gültig. Du kannst Profile und Inhalte nach der Anmeldung direkt auf Werkuno melden.</p>
          <LinkButton href="/hilfe/sicherheit" size="lg" className="mt-8 w-full">
            Hilfe zu Meldungen
          </LinkButton>
        </>
      )}
    </>
  );
}
