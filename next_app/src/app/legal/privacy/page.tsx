import LegalDocumentView from "@/components/legal/LegalDocumentView";

export const metadata = {
  title: "מדיניות פרטיות — JoinUp",
};

export default async function PrivacyPolicyPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await props.searchParams;
  return <LegalDocumentView kind="privacy" path="/legal/privacy" lang={typeof lang === "string" ? lang : undefined} />;
}
