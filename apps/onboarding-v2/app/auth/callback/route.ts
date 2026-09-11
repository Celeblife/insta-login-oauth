import { withCallbackRedirect } from "@/lib/services/http";
import { getOnboardingService } from "@/lib/services/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withCallbackRedirect(request, async (context) =>
    getOnboardingService().legacyCallback(context.browserBindingHash, new URL(request.url), request.headers.get("cookie")),
  );
}
