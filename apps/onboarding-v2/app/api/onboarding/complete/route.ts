import { jsonResponse, readJsonBody, refreshBrowserCookie, withApi } from "@/lib/services/http";
import { scheduleCompletedNotificationRetry } from "@/lib/jobs/notification-scheduler";
import { getOnboardingService } from "@/lib/services/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return withApi(
    request,
    async (context) => {
      const body = await readJsonBody(request);
      const result = await getOnboardingService().complete(context.browserBindingHash, body);
      scheduleCompletedNotificationRetry(result.body, "complete");
      return jsonResponse(result.body, { status: result.status }, result.body.status === "completed" ? refreshBrowserCookie(context) : context.setCookie);
    },
    { mutation: true },
  );
}
