import { PolicyPage } from "@/components/onboarding/policy-page";
import { getConfig } from "@/lib/config/env";

export default function PrivacyPage() {
  return <PolicyPage type="privacy" lead="개인정보처리방침은 개인정보 수집·이용 동의서와 별도로 제공되는 공개 정책입니다." contactEmail={getConfig().publicContactEmail} />;
}
