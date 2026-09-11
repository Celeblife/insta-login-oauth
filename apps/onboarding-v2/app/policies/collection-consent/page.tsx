import { PolicyPage } from "@/components/onboarding/policy-page";
import { getConfig } from "@/lib/config/env";

export default function CollectionConsentPage() {
  return <PolicyPage type="collection" lead="신청 접수를 위한 개인정보 수집·이용 동의 내용을 확인합니다." contactEmail={getConfig().publicContactEmail} />;
}
