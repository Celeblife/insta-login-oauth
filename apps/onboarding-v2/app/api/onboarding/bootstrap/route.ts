import { jsonResponse, withApi } from "@/lib/services/http";
import { getOnboardingService } from "@/lib/services/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApi(request, async (context) => {
    const body = await getOnboardingService().bootstrap(
      context.browserBindingHash,
      context.csrfToken,
    );
    return jsonResponse(body, { status: 200 }, context.setCookie);
  });
}
