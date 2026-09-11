import { PolicyPage } from "@/components/onboarding/policy-page";
import { getConfig } from "@/lib/config/env";

export default function DeletionPage() {
  return <PolicyPage type="deletion" lead="연동 해제와 데이터 삭제 요청 절차를 안내합니다." contactEmail={getConfig().publicContactEmail} />;
}
