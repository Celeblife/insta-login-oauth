import { PolicyPage } from "@/components/onboarding/policy-page";
import { getConfig } from "@/lib/config/env";

export default function TermsPage() {
  return <PolicyPage type="terms" lead="서비스 이용약관 전문을 독립 페이지로 제공합니다." contactEmail={getConfig().publicContactEmail} />;
}
