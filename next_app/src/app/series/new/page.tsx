import { redirect } from "next/navigation";

// There is no standalone "new group" page: groups are created from the game-creation flow.
// Without this, /series/new was captured by the dynamic [id] route and showed "group not found".
export default function NewSeriesRedirect() {
  redirect("/games/new");
}
