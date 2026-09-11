import { withCallbackRedirect } from "@/lib/services/http";
import { getOnboardingService } from "@/lib/services/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withCallbackRedirect(request, async (context) => {
    const result = await getOnboardingService().callback(context.browserBindingHash, new URL(request.url));
    return result;
  });
}
