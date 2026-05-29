import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
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


function fmt(phone: string) {
  return phone.length === 10
    ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
    : phone;
}

function fmtDate(iso: string | undefined) {
  if (!iso) return "unknown date";
  try { return new Date(iso).toLocaleString("en-US", { timeZone: "UTC" }); } catch { return iso; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { phone } = await params;
  const normalized = normalizePhone(decodeURIComponent(phone));

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured. Add it to your Render environment variables." }, { status: 500 });
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // Fetch all data — same fan-out as main contact route
    const [allContacts, formSubmissions] = await Promise.all([
      findAllContactsByPhone(normalized),
      Promise.resolve(getWebformSubmissions(normalized)),
    ]);

    const contact = allContacts[0] ?? null;
    if (!contact) {
      return NextResponse.json({ error: "No CRM contact found for this number" }, { status: 404 });
    }

    const contactIds = allContacts.map((c) => c.id);
    const primaryId = contact.id;

    const [zohoSms, stSms, calls, notes, deals, webform] = await Promise.all([
      getSmsHistory(contactIds, normalized),
      getSimpleTextingMessages(normalized),
      getCallHistory(contactIds, normalized),
      getNotes(contactIds),
      getDeals(contactIds),
      getWebformData(primaryId),
    ]);

    const sms = [...zohoSms, ...stSms].sort(
      (a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
    );

    // ── Build structured context for Claude ─────────────────────────────────

    const contactSection = allContacts.map((c, i) => [
      `Record ${i + 1}${i === 0 ? " (primary)" : ""}:`,
      `  Name: ${c.fullName}`,
      `  Type: ${c.type}`,
      `  Lead Source: ${c.leadSource || "none"}`,
      `  Data Source: ${c.dataSource || "none"}`,
      `  Owner: ${c.owner || "none"}`,
      `  Created: ${fmtDate(c.createdTime)}`,
      `  Patient ID: ${c.patientId || "none"}`,
      `  Dedup Status: ${c.deduplicationStatus || "none"}`,
    ].join("\n")).join("\n\n");

    const callsSection = calls.length === 0
      ? "No calls on record."
      : calls.map(c =>
          `[${fmtDate(c.startTime)}] ${c.callType} | ${c.subject} | Duration: ${c.duration ?? "unknown"} | Result: ${c.callResult ?? "—"} | Status: ${c.outgoingStatus ?? "—"}`
        ).join("\n");

    const smsSection = sms.length === 0
      ? "No SMS on record."
      : sms.map(s => {
          const dir = (s as { directionType?: string }).directionType === "MO" ? "INBOUND" : "OUTBOUND";
          return `[${fmtDate(s.createdTime)}] ${dir} via ${s.channel ?? "unknown"}: ${s.message?.slice(0, 200) ?? ""}`;
        }).join("\n");

    const notesSection = notes.length === 0
      ? "No notes on record."
      : notes.map(n =>
          `[${fmtDate(n.createdTime)}] ${n.title}: ${n.content?.slice(0, 300) ?? ""}`
        ).join("\n");

    const dealsSection = deals.length === 0
      ? "No deals on record."
      : deals.map(d =>
          `[${fmtDate(d.createdTime)}] "${d.dealName}" | Stage: ${d.stage} | Amount: ${d.amount != null ? `$${d.amount.toLocaleString()}` : "unknown"} | Close: ${d.closingDate ?? "—"} | Owner: ${d.owner ?? "—"}`
        ).join("\n");

    const webformSection = !webform
      ? "No CRM webform/consent data."
      : [
          `Lead Source: ${webform.leadSource ?? "—"}`,
          `Data Source: ${webform.dataSource ?? "—"}`,
          `GCLID (Google): ${webform.gclid ?? "none"}`,
          `Facebook Lead ID: ${webform.facebookLeadId ?? "none"}`,
          `Email Opt-Out: ${webform.emailOptOut ? "YES" : "NO"}`,
        ].join("\n");

    const formSubSection = formSubmissions.length === 0
      ? "No website form submissions on record."
      : formSubmissions.map(f => {
          const name = f.fullName ?? [f.firstName, f.lastName].filter(Boolean).join(" ");
          return [
            `[${f.createdAt}] Form: "${f.formName}"`,
            `  Name: ${name || "—"} | Email: ${f.email ?? "—"} | Phone: ${f.phone ?? "—"}`,
            `  Consent: ${f.consentChecked ? "YES" : "NO"}`,
            f.utmSource ? `  UTM: source=${f.utmSource} medium=${f.utmMedium ?? "—"} campaign=${f.utmCampaign ?? "—"}` : "",
            f.gclid ? `  GCLID: ${f.gclid}` : "",
            f.fbclid ? `  FBCLID: ${f.fbclid}` : "",
            f.submittedUrl ? `  Page: ${f.submittedUrl}` : "",
            f.procedure ? `  Procedure of interest: ${f.procedure}` : "",
            f.requestDescription ? `  Message: ${f.requestDescription.slice(0, 200)}` : "",
          ].filter(Boolean).join("\n");
        }).join("\n\n");

    // ── Claude prompt ────────────────────────────────────────────────────────

    const systemPrompt = `You are a forensic investigator analyzing a patient/lead record for a plastic surgery practice. Your job is to produce a clear, structured analysis of the contact's history for legal and compliance review purposes — specifically TCPA compliance, consent documentation, and understanding the full timeline of how this person came to be in the system and how the practice engaged with them.

Be precise, factual, and highlight anything notable: multiple records for the same number, multiple form submissions, repeated deal creation (multiple quotes), gaps in communication, the original acquisition channel, consent status, and any patterns that a lawyer or compliance officer would need to know.

Format your response in clearly labeled sections using markdown. Be concise but thorough. Flag anything unusual or potentially problematic.`;

    const userPrompt = `Please analyze the following contact record for phone number ${fmt(normalized)}.

=== CRM CONTACT RECORDS (${allContacts.length} total) ===
${contactSection}

=== CALL HISTORY (${calls.length} calls) ===
${callsSection}

=== SMS / TEXT MESSAGES (${sms.length} messages) ===
${smsSection}

=== NOTES (${notes.length} notes) ===
${notesSection}

=== DEALS / QUOTES (${deals.length} deals) ===
${dealsSection}

=== WEBSITE FORM SUBMISSIONS (${formSubmissions.length} submissions) ===
${formSubSection}

=== CRM WEBFORM / CONSENT DATA ===
${webformSection}

Please provide a comprehensive forensic analysis covering:
1. First contact — when and from what source did this person first enter the system?
2. Lead acquisition — what channel/source brought them in? Is attribution clear?
3. Consent documentation — did they submit a web form with consent? Any SalesIQ live chat entries? What's the consent trail?
4. Communication timeline — summarize the full arc of engagement (calls, texts, notes)
5. Multiple inquiries / duplicate records — did they submit multiple forms, get multiple quotes, or have multiple CRM records?
6. Compliance flags — anything a TCPA compliance reviewer or attorney needs to pay attention to?
7. Overall assessment — what does this record tell us about this patient's journey?`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const analysis = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    return NextResponse.json({
      analysis,
      meta: {
        contactCount: allContacts.length,
        callCount: calls.length,
        smsCount: sms.length,
        noteCount: notes.length,
        dealCount: deals.length,
        formCount: formSubmissions.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const e = err as Error;
    console.error("analysis failed", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
