import { NextRequest, NextResponse } from "next/server";
import {
  findContactByPhone,
  getNotes,
  getSmsHistory,
  getCallHistory,
  getDeals,
  getWebformData,
  normalizePhone,
} from "@/lib/zoho";
import { getWebformSubmissions } from "@/lib/webforms";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { phone } = await params;
  const normalized = normalizePhone(decodeURIComponent(phone));

  try {
    const [contact, formSubmissions] = await Promise.all([
      findContactByPhone(normalized),
      Promise.resolve(getWebformSubmissions(normalized)),
    ]);

    if (!contact) {
      return NextResponse.json({ contact: null, sms: [], calls: [], notes: [], deals: [], webform: null, formSubmissions });
    }

    const [sms, calls, notes, deals, webform] = await Promise.all([
      getSmsHistory(contact.id, normalized),
      getCallHistory(contact.id, normalized),
      contact.type === "Contact" ? getNotes(contact.id) : Promise.resolve([]),
      contact.type === "Contact" ? getDeals(contact.id) : Promise.resolve([]),
      contact.type === "Contact" ? getWebformData(contact.id) : Promise.resolve(null),
    ]);

    return NextResponse.json({ contact, sms, calls, notes, deals, webform, formSubmissions });
  } catch (err) {
    const e = err as Error;
    console.error("contact lookup failed", e.message, e.cause ?? "");
    return NextResponse.json({ error: e.message, cause: String(e.cause ?? "") }, { status: 500 });
  }
}
