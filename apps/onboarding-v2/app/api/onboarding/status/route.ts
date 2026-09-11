import { jsonResponse, refreshBrowserCookie, withApi } from "@/lib/services/http";
import { getOnboardingService } from "@/lib/services/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApi(request, async (context) => {
    const url = new URL(request.url);
    const body = await getOnboardingService().status(
      context.browserBindingHash,
      url.searchParams.get("attemptId"),
    );
    return jsonResponse(body, { status: 200 }, body.status === "completed" ? refreshBrowserCookie(context) : context.setCookie);
  });
}
