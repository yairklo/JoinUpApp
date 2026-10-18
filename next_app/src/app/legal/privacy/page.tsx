import LegalDocumentView from "@/components/legal/LegalDocumentView";
import { PRIVACY } from "@joinup/shared/legal";

export const metadata = {
  title: "מדיניות פרטיות — JoinUp",
};

export default function PrivacyPolicyPage() {
  return <LegalDocumentView doc={PRIVACY} />;
}
