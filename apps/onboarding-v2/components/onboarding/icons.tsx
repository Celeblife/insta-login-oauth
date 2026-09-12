import Link from "next/link";

export function IconDefs() {
  return (
    <svg className="defs" aria-hidden="true">
      <symbol id="i-ig" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="5.4" />
        <circle cx="12" cy="12" r="4.1" />
        <circle cx="17.6" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="i-check" viewBox="0 0 24 24">
        <path d="m5 12 4.5 4.5L19 7" />
      </symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24">
        <path d="M4 12h15M13 6l6 6-6 6" />
      </symbol>
      <symbol id="i-chevron" viewBox="0 0 24 24">
        <path d="m9 5 7 7-7 7" />
      </symbol>
      <symbol id="i-back" viewBox="0 0 24 24">
        <path d="M20 12H5m6-6-6 6 6 6" />
      </symbol>
      <symbol id="i-shield" viewBox="0 0 24 24">
        <path d="m12 3 7 3v5c0 4.5-2.8 7.4-7 10-4.2-2.6-7-5.5-7-10V6l7-3Z" />
        <path d="m8.5 12 2.3 2.3 4.9-5" />
      </symbol>
      <symbol id="i-lock" viewBox="0 0 24 24">
        <rect x="5" y="10" width="14" height="11" rx="2.5" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </symbol>
      <symbol id="i-mail" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m4 7 8 6 8-6" />
      </symbol>
      <symbol id="i-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </symbol>
      <symbol id="i-cross" viewBox="0 0 24 24">
        <path d="m6 6 12 12M18 6 6 18" />
      </symbol>
      <symbol id="i-help" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.3 8.5a2.8 2.8 0 0 1 5.4 1c0 1.6-2.7 2-2.7 3.7m0 3h.01" />
      </symbol>
      <symbol id="i-star" viewBox="0 0 24 24">
        <path d="M12 2c.8 6.2 3.8 9.2 10 10-6.2.8-9.2 3.8-10 10C11.2 15.8 8.2 12.8 2 12c6.2-.8 9.2-3.8 10-10Z" />
      </symbol>
      <symbol id="i-link" viewBox="0 0 24 24">
        <path d="m10 13 4-4m-5 8-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1" transform="translate(1,0) scale(.92)" />
      </symbol>
      <symbol id="i-chart" viewBox="0 0 24 24">
        <path d="M4 4v16h16M8 15v-3m5 3V9m5 6V6" />
      </symbol>
      <symbol id="i-user" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </symbol>
      <symbol id="i-info" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6m0 4h.01" />
      </symbol>
      <symbol id="cl-symbol" viewBox="0 0 32 36">
        <path d="M14.5 0c.6 8.5 4.7 14.6 14.5 18-9.8 3.4-13.9 9.5-14.5 18C13.9 27.5 9.8 21.4 0 18 9.8 14.6 13.9 8.5 14.5 0Z" />
        <path d="M29.5 1c.2 2.5 1.3 4.3 4.2 5.4-2.9 1-4 2.8-4.2 5.4-.2-2.6-1.3-4.4-4.2-5.4 2.9-1.1 4-2.9 4.2-5.4Z" transform="translate(-3,0)" />
      </symbol>
    </svg>
  );
}

export function Icon({ id, className = "ic" }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

export function BrandMark({ mobile = false }: { mobile?: boolean }) {
  return (
    <Link className={`brand${mobile ? " mobile-brand" : ""}`} href="/" aria-label="셀럽라이프 홈">
      <span className="brand-logo" aria-hidden="true" />
    </Link>
  );
}
