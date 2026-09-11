import type { ReactNode } from "react";

export type PolicyKey = "help" | "terms" | "privacy" | "collection" | "instagramData" | "deletion" | "contact";

export const policyLabels: Record<PolicyKey, string> = {
  help: "인스타그램 연동 안내",
  terms: "서비스 이용약관",
  privacy: "개인정보처리방침",
  collection: "개인정보 수집·이용 안내",
  instagramData: "Instagram 데이터 이용 안내",
  deletion: "연동 해제·데이터 삭제",
  contact: "연락처 수정 안내",
};

export function PolicyContent({ type, contactEmail }: { type: PolicyKey; contactEmail?: string | undefined }) {
  const publicContact = contactEmail ?? "";
  const contactLink = publicContact ? <a href={`mailto:${publicContact}`}>{publicContact}</a> : null;
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
    terms: (
      <>
        <p className="policy-summary">서비스 이용약관은 Instagram 계정 연결, 분석 신청 접수, 담당자 안내에 관한 기본 이용 조건입니다.</p>
        <h3>서비스 범위</h3>
        <p>셀럽라이프는 사용자가 명시적으로 동의하고 Instagram에서 승인한 범위 안에서 계정 연결과 분석 신청 접수 절차를 제공합니다.</p>
        <h3>이용자의 책임</h3>
        <p>사용자는 본인이 관리할 권한이 있는 계정을 연결해야 하며, 입력한 연락처가 정확한지 확인해야 합니다.</p>
      </>
    ),
    privacy: (
      <>
        <p className="policy-summary">개인정보처리방침은 수집·이용 동의서와 구분되는 공개 정책 문서입니다. 운영 전 법무/정책 소유자의 최종 확인이 필요합니다.</p>
        <h3>처리 항목</h3>
        <p>이름, 이메일, 연락처, 입력한 Instagram 아이디, Instagram 인증 후 확인된 계정 식별정보, 접수 및 동의 기록을 처리합니다.</p>
        <h3>처리 목적</h3>
        <p>계정 연결, 분석 신청 접수, 담당자 연락, 연동 해제 및 데이터 삭제 요청 처리를 위해 사용합니다.</p>
        <h3>문의</h3>
        {contactLink ? (
          <p>개인정보 문의는 공개 문의 이메일 {contactLink}로 접수해 주세요.</p>
        ) : (
          <p>공개 문의 이메일이 아직 설정되지 않았습니다. 운영 환경의 CONTACT_EMAIL 설정이 필요합니다.</p>
        )}
      </>
    ),
    collection: (
      <>
        <p className="policy-summary">개인정보 수집·이용 동의는 신청 접수를 위해 필요한 필수 동의입니다. 보기 버튼은 자동 동의로 이어지지 않습니다.</p>
        <dl>
          <dt>수집 항목</dt>
          <dd>이름, 연락처, 이메일, Instagram 아이디 및 인증된 계정 정보</dd>
          <dt>이용 목적</dt>
          <dd>분석 신청 접수, 계정 연결, 담당자 안내</dd>
          <dt>보유 기간</dt>
          <dd>운영 정책에 따른 보유 기간까지 보관 후 파기</dd>
          <dt>동의 거부</dt>
          <dd>동의를 거부할 수 있으나 신청 접수가 제한됩니다.</dd>
        </dl>
      </>
    ),
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
