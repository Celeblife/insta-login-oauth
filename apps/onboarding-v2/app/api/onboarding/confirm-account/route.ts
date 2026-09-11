import { jsonResponse, readJsonBody, refreshBrowserCookie, withApi } from "@/lib/services/http";
import { getOnboardingService } from "@/lib/services/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApi(
    request,
    async (context) => {
      const body = await readJsonBody(request);
      const result = await getOnboardingService().confirmAccount(context.browserBindingHash, body);
      return jsonResponse(result, { status: 200 }, result.status === "completed" ? refreshBrowserCookie(context) : context.setCookie);
    },
    { mutation: true },
  );
}
