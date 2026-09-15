import type { ReactNode } from "react";
import { V1_PRIVACY_BODY, V1_TERMS_BODY } from "@/lib/policies/v1-consent";

export type PolicyKey = "help" | "terms" | "privacy" | "collection" | "instagramData" | "deletion" | "contact";

export const policyLabels: Record<PolicyKey, string> = {
  help: "인스타그램 연동 안내",
  terms: "서비스 이용약관",
  privacy: "개인정보처리방침",
  collection: "개인정보 수집·이용",
  instagramData: "Instagram 데이터 이용 안내",
  deletion: "연동 해제·데이터 삭제",
  contact: "연락처 수정 안내",
};

export function PolicyContent({ type, contactEmail }: { type: PolicyKey; contactEmail?: string | undefined }) {
  const publicContact = contactEmail ?? "";
  const contactLink = publicContact ? <a href={`mailto:${publicContact}`}>{publicContact}</a> : null;
  const v1Terms = <PolicyDocument body={V1_TERMS_BODY} />;
  const v1Privacy = <PolicyDocument body={V1_PRIVACY_BODY} />;
  const bodies: Record<PolicyKey, ReactNode> = {
    help: (
      <>
        <p className="policy-summary">기본 정보와 필수 동의 후 Instagram 공식 승인 화면으로 이동합니다. 셀럽라이프는 Instagram 비밀번호나 2단계 인증 코드를 받지 않습니다.</p>
        <h3>어떻게 연결하나요?</h3>
        <p>다음 단계에서 Instagram 로그인 및 권한 승인이 진행됩니다. 완료 후 셀럽라이프로 돌아와 연결 상태를 확인합니다.</p>
        <h3>분석 결과는 어디서 보나요?</h3>
        <p>이 앱은 접수 완료까지만 안내합니다. 담당자가 입력하신 연락처로 후속 안내를 드립니다.</p>
      </>
    ),
    terms: v1Terms,
    privacy: v1Privacy,
    collection: v1Privacy,
    instagramData: (
      <>
        <p className="policy-summary">Instagram 데이터 이용 동의는 공식 승인 화면에서 사용자가 허용한 권한 범위 안에서만 적용됩니다.</p>
        <h3>이용 목적</h3>
        <p>채널 분석과 담당자 검토를 위해 계정 정보와 승인된 성과 데이터를 사용합니다.</p>
        <h3>연동 해제</h3>
        <p>Instagram 앱 연결 해제 또는 셀럽라이프 데이터 삭제 요청 경로를 통해 후속 처리를 요청할 수 있습니다.</p>
      </>
    ),
    deletion: (
      <>
        <p className="policy-summary">연동 해제와 데이터 삭제는 본인 확인과 대상 계정 확인을 거쳐 처리됩니다.</p>
        <h3>Instagram 연결 해제</h3>
        <p>Instagram 설정에서 앱 연결을 해제하면 이후 데이터 접근이 제한될 수 있습니다.</p>
        <h3>셀럽라이프 보관 데이터 삭제</h3>
        {contactLink ? (
          <p>삭제 요청은 공개 문의 이메일 {contactLink}로 접수하며, 접수번호만으로 타인의 정보를 조회하거나 삭제할 수 없습니다.</p>
        ) : (
          <p>삭제 요청용 공개 문의 이메일이 아직 설정되지 않았습니다. 운영 환경의 CONTACT_EMAIL 설정이 필요합니다.</p>
        )}
      </>
    ),
    contact: (
      <>
        <p className="policy-summary">완료 후 연락처 수정은 본인 확인이 필요한 별도 문의로 처리됩니다.</p>
        {publicContact ? (
          <p>
            공개 문의 이메일 <a href={`mailto:${publicContact}`}>{publicContact}</a>로 접수번호와 수정 요청 내용을 보내 주세요.
          </p>
        ) : (
          <p>공개 문의 이메일이 아직 설정되지 않았습니다. 운영 환경의 CONTACT_EMAIL 설정이 필요합니다.</p>
        )}
        <p>이 화면에서는 비밀번호, OAuth 코드, 토큰, 내부 담당자 주소를 노출하지 않습니다.</p>
      </>
    ),
  };

  return bodies[type];
}

function PolicyDocument({ body }: { body: string }) {
  return <pre className="policy-document">{body}</pre>;
}
