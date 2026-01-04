import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";

import GamesPageContent from "@/components/GamesPageContent";
import HomeHero from "@/components/HomeHero";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default async function GamesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const user = await currentUser();

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const initialDate =
    (typeof searchParams.date === "string" && searchParams.date) || todayStr;

  return (
    <main>
      <HomeHero />

      <GamesPageContent initialDate={initialDate} fieldId={typeof searchParams.fieldId === "string" ? searchParams.fieldId : undefined} />
    </main>
  );
}