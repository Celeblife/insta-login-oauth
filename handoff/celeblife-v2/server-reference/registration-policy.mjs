/**
 * Pure reference policy, not an implemented database transaction.
 * Inputs MUST be server-derived facts for the verified Instagram account while
 * holding the account-row lock in the final transaction. Never trust client flags.
 * Database UNIQUE constraints, leases, token exchange and writes are separate work.
 */
export function registrationDecision(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || typeof input.attemptAlreadyCompleted !== 'boolean'
      || typeof input.hasInitialV2Request !== 'boolean') {
    throw new TypeError('INVALID_REGISTRATION_FACTS');
  }
  if (input.attemptAlreadyCompleted) {
    return { action: 'reuse_existing_result', createReceipt: false,
      createAnalysisRequest: false, enqueueNotification: false };
  }
  if (input.hasInitialV2Request) {
    return { action: 'reconnection', createReceipt: true,
      createAnalysisRequest: false, enqueueNotification: true,
      connectionKind: 'reconnection', reviewStatus: 'not_requested' };
  }
  return { action: 'initial_registration', createReceipt: true,
    createAnalysisRequest: true, enqueueNotification: true,
    connectionKind: 'new', reviewStatus: 'pending_review' };
}
