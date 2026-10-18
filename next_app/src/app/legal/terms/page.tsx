import LegalDocumentView from "@/components/legal/LegalDocumentView";

export const metadata = {
  title: "תנאי שימוש — JoinUp",
};

export default async function TermsOfServicePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await props.searchParams;
  return <LegalDocumentView kind="terms" path="/legal/terms" lang={typeof lang === "string" ? lang : undefined} />;
}
