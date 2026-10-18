import LegalDocumentView from "@/components/legal/LegalDocumentView";
import { TERMS } from "@joinup/shared/legal";

export const metadata = {
  title: "תנאי שימוש — JoinUp",
};

export default function TermsOfServicePage() {
  return <LegalDocumentView doc={TERMS} />;
}
