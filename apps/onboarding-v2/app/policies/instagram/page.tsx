import { PolicyPage } from "@/components/onboarding/policy-page";
import { getConfig } from "@/lib/config/env";

export default function InstagramPolicyPage() {
  return <PolicyPage type="instagramData" lead="Instagram 데이터 이용 범위와 목적을 별도 안내합니다." contactEmail={getConfig().publicContactEmail} />;
}
