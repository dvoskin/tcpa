import { NextRequest, NextResponse } from "next/server";
import {
  findAllContactsByPhone,
  getNotes,
  getSmsHistory,
  getCallHistory,
  getDeals,
  getWebformData,
  normalizePhone,
} from "@/lib/zoho";
import { getWebformSubmissions } from "@/lib/webforms";
import { getSimpleTextingMessages } from "@/lib/simpletexting";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { phone } = await params;
  const normalized = normalizePhone(decodeURIComponent(phone));

  try {
    const [allContacts, formSubmissions] = await Promise.all([
      findAllContactsByPhone(normalized),
      Promise.resolve(getWebformSubmissions(normalized)),
    ]);

    // Primary contact for display — first result from REST search (most relevant)
    const contact = allContacts[0] ?? null;

    if (!contact) {
      return NextResponse.json({ contact: null, allContacts: [], sms: [], calls: [], notes: [], deals: [], webform: null, formSubmissions });
    }

    // Aggregate data across ALL matching contact IDs so duplicates don't hide activity
    const contactIds = allContacts.map((c) => c.id);
    const primaryId = contact.id;

    const [zohoSms, stSms, calls, notes, deals, webform] = await Promise.all([
      getSmsHistory(contactIds, normalized),
      getSimpleTextingMessages(normalized),
      getCallHistory(contactIds, normalized),
      contact.type === "Contact" ? getNotes(contactIds) : Promise.resolve([]),
      contact.type === "Contact" ? getDeals(contactIds) : Promise.resolve([]),
      contact.type === "Contact" ? getWebformData(primaryId) : Promise.resolve(null),
    ]);

    const sms = [...zohoSms, ...stSms].sort(
      (a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
    );

    return NextResponse.json({ contact, allContacts, sms, calls, notes, deals, webform, formSubmissions });
  } catch (err) {
    const e = err as Error;
    console.error("contact lookup failed", e.message, e.cause ?? "");
    return NextResponse.json({ error: e.message, cause: String(e.cause ?? "") }, { status: 500 });
  }
}
