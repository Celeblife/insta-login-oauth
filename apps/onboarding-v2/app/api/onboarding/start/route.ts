import { jsonResponse, readJsonBody, withApi } from "@/lib/services/http";
import { getOnboardingService } from "@/lib/services/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApi(
    request,
    async (context) => {
      const body = await readJsonBody(request);
      const result = await getOnboardingService().start(context.browserBindingHash, body);
      return jsonResponse(result.response, { status: result.created ? 201 : 200 }, context.setCookie);
    },
    { mutation: true },
  );
}
