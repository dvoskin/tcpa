import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com";

  try {
    const r = await fetch(`${accountsUrl}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&client_id=test&client_secret=test&refresh_token=test`,
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    return NextResponse.json({ env_loaded: !!clientId, zoho_reachable: true, response: data });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ env_loaded: !!clientId, zoho_reachable: false, error: err.message, cause: String(err.cause) });
  }
}
