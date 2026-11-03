import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";

export default async function MyProfile() {
  const u = await currentUser();
  redirect(u?.profile ? `/u/${u.profile.handle}` : "/anmelden?weiter=/profil");
}
