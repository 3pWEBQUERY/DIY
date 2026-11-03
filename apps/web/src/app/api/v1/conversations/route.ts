import { api, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { listConversations, startConversation, type InboxBox } from "@/server/messaging/service";

const BOXES: InboxBox[] = ["inbox", "requests", "archived"];

/** GET /api/v1/conversations?box=inbox|requests|archived */
export const GET = api(async (req) => {
  const user = await requireUser();
  const box = req.nextUrl.searchParams.get("box") as InboxBox | null;
  return listConversations(user.id, box && BOXES.includes(box) ? box : "inbox");
});

/** POST /api/v1/conversations – Unterhaltung beginnen ({ recipientHandle, orderId?, productId?, body, media[] }). */
export const POST = api(async (req) => {
  const user = await requireUser();
  return startConversation(user, await body(req));
});
