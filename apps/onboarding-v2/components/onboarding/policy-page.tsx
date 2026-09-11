import { BrandMark, IconDefs } from "./icons";
import { PolicyContent, policyLabels, type PolicyKey } from "./policies";

export function PolicyPage({ type, lead, contactEmail }: { type: PolicyKey; lead: string; contactEmail?: string | undefined }) {
  return (
    <>
      <IconDefs />
      <main className="policy-page">
        <BrandMark />
        <article>
          <h1>{policyLabels[type]}</h1>
          <p>{lead}</p>
          <PolicyContent type={type} contactEmail={contactEmail} />
          <p className="policy-back-wrap">
            <a className="secondary policy-back-link" href="/apply">
              정보 입력으로 돌아가기
            </a>
          </p>
        </article>
      </main>
    </>
  );
}
