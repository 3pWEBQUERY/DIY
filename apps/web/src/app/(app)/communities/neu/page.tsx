import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { Page, PageHeader } from "@/components/shell/page";
import { CommunityForm } from "@/components/communities/community-forms";

export const metadata: Metadata = { title: "Community gründen", robots: { index: false } };

export default async function NewCommunityPage() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/communities/neu");
  return (
    <Page width="feed">
      <PageHeader kicker="Communities · Neu" title="Community gründen" description="Du wirst automatisch Gründer:in und kannst später Admins und Moderator:innen ernennen." />
      <CommunityForm />
    </Page>
  );
}
