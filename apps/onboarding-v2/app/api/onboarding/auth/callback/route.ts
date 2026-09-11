import { GET as instagramCallback } from "@/app/auth/instagram/callback/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return instagramCallback(request);
}
