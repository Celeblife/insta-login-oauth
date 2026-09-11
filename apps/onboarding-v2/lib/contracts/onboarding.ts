export type UUID = string;
export type IsoDate = string;

export type ConsentInput = {
  age: true;
  terms: true;
  privacy: true;
  instagramData: true;
};

export interface StartRequest {
  requestKey: UUID;
  policyBundleId: string;
  fullName: string;
  email: string;
  phone: string;
  instagramUsername: string;
  consents: ConsentInput;
  replaceAttemptId?: UUID | undefined;
}

export interface BootstrapResponse {
  csrfToken: string;
  policyBundleId: string;
  activeAttempt?: {
    attemptId: UUID;
    revision: number;
    nextPath: "/connecting" | "/complete" | "/apply" | "/connection-error";
  };
  draft?: {
    attemptId: UUID;
    fullName: string;
    email: string;
    phone: string;
    instagramUsername: string;
  };
}

export type StartResponse =
  | {
      action: "authorize";
      attemptId: UUID;
      revision: number;
      authorizeUrl: string;
      expiresAt: IsoDate;
    }
  | {
      action: "resume";
      attemptId: UUID;
      revision: number;
      nextPath: "/connecting" | "/complete" | "/connection-error";
    };

export interface AttemptRequest {
  attemptId: UUID;
}

export interface ConfirmAccountRequest extends AttemptRequest {
  expectedRevision: number;
  accept: true;
}

export interface RestartRequest extends AttemptRequest {
  requestKey: UUID;
}

export type Stage = "account" | "storage" | "submission";
export type ReviewStatus = "pending_review" | "in_review" | "contacted" | "cancelled";

interface ConnectionResultBase {
  kind: "v2";
  requestId: UUID;
  receivedAt: IsoDate;
  fullName: string;
  email: string;
  phone: string;
  instagramUsername: string;
}

export type SubmittedResult = ConnectionResultBase &
  (
    | {
        connectionKind: "new";
        analysisRequested: true;
        reviewStatus: ReviewStatus;
      }
    | {
        connectionKind: "reconnection";
        analysisRequested: false;
        reviewStatus: "not_requested";
        initialRequestId: UUID;
      }
  );

export interface LegacyResult {
  kind: "legacy";
  instagramUsername: string;
}

export type PublicErrorCode =
  | "VALIDATION_FAILED"
  | "CONSENT_REQUIRED"
  | "POLICY_CHANGED"
  | "CSRF_REJECTED"
  | "RATE_LIMITED"
  | "CONFIGURATION_ERROR"
  | "OAUTH_CANCELLED"
  | "INVALID_STATE"
  | "SESSION_EXPIRED"
  | "REAUTH_REQUIRED"
  | "PROVIDER_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "ACTIVE_ATTEMPT_EXISTS"
  | "ACTIVE_PROCESSING"
  | "STALE_ATTEMPT"
  | "STALE_CONFIRMATION"
  | "PERMISSIONS_REQUIRED"
  | "UNSUPPORTED_ACCOUNT";

export type StatusResponse =
  | { status: "idle"; attemptId: null; revision: 0 }
  | { status: "awaiting_oauth"; attemptId: UUID; revision: number; expiresAt: IsoDate }
  | {
      status: "processing";
      attemptId: UUID;
      revision: number;
      stage: Stage;
      retryAfterMs: number;
      submissionIntent: "unknown" | "new" | "reconnection";
    }
  | {
      status: "account_confirmation_required";
      attemptId: UUID;
      revision: number;
      enteredUsername: string;
      connectedUsername: string;
    }
  | {
      status: "completed";
      attemptId: UUID;
      revision: number;
      result: SubmittedResult | LegacyResult;
    }
  | {
      status: "failed";
      attemptId: UUID;
      revision: number;
      code: PublicErrorCode;
      retryAction: "retry_status" | "retry_complete" | "restart_oauth" | "return_form";
      draftAvailable: boolean;
    };

export interface ApiError {
  error: {
    code: PublicErrorCode;
    message: string;
    fields?: Partial<
      Record<"fullName" | "phone" | "email" | "instagramUsername" | "consents", string>
    >;
  };
  traceId: UUID;
}

export interface InternalRefreshSummary {
  refreshed: number;
  failed: number;
  tooNew: number;
  reauthRequired: number;
  metadataMissing: number;
  skippedConcurrentChange: number;
}
