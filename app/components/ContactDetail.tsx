"use client";
import { useState, useEffect } from "react";

interface ContactRecord {
  id: string; type: string; fullName: string; email?: string;
  phone?: string; mobile?: string; accountName?: string; leadSource?: string;
  dataSource?: string; owner?: string; createdTime?: string; modifiedTime?: string;
  consentFields?: Record<string, string | boolean | null>;
  campaignName?: string; facebookLeadId?: string; gclid?: string;
  patientId?: string; bestContactTime?: string; preferredAgentId?: string; deduplicationStatus?: string;
}
interface SmsRecord {
  id: string; fromNumber: string; toNumber: string; message: string;
  messageType: string; sentVia?: string; channel?: string; createdTime: string; media?: string[];
  directionType?: "MT" | "MO"; referenceType?: string | null;
}
interface CallRecord {
  id: string; subject: string; callType: string; callPurpose?: string; callResult?: string;
  startTime: string; durationSeconds?: number; duration?: string; description?: string;
  contactName?: string; dialledNumber?: string; callerId?: string; outgoingStatus?: string; summary?: string;
}
interface NoteRecord {
  id: string; title: string; content: string; createdTime: string; modifiedTime?: string; owner?: string;
}
interface DealRecord {
  id: string; dealName: string; stage: string; amount?: number; closingDate?: string;
  createdTime: string; owner?: string; accountName?: string;
}
interface WebformData {
  leadSource?: string; dataSource?: string; campaignName?: string; adGroupName?: string;
  adsCreativeName?: string; gclid?: string; facebookLeadId?: string; facebookClickId?: string;
  socialLeadId?: string; zcampaignId?: string; emailOptOut?: boolean;
  medullaryThyroidCancerConsent?: string; assistedOrder?: string; bestContactTime?: string;
}

interface FormSubmission {
  formName: string; submissionId: string; createdAt: string;
  firstName?: string; lastName?: string; fullName?: string; email?: string; phone?: string;
  bestDateForCall?: string; bestTimeForCall?: string; preferredLanguage?: string; zipCode?: string;
  consentChecked?: boolean;
  utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string;
  gclid?: string; fbclid?: string; submittedUrl?: string;
  procedure?: string; clinicLocation?: string; requestType?: string; requestDescription?: string;
  yearsExperience?: string; locationOfInterest?: string; otherLanguages?: string;
}

interface ApiResponse {
  contact: ContactRecord | null;
  allContacts: ContactRecord[];
  sms: SmsRecord[];
  calls: CallRecord[];
  notes: NoteRecord[];
  deals: DealRecord[];
  webform: WebformData | null;
  formSubmissions: FormSubmission[];
  error?: string;
}

function fmt(phone: string) {
  if (phone.length === 10)
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  return phone;
}

// Fixed locale + UTC so server and client always render identically (no hydration mismatch)
function fmtDate(iso: string | undefined) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch { return iso; }
}

function Badge({ label, color }: { label: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    purple: "bg-purple-100 text-purple-700",
    red: "bg-red-100 text-red-700",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color] ?? colors.gray}`}>
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex gap-2 py-1">
      <span className="text-xs text-gray-500 w-40 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 break-words min-w-0">{value}</span>
    </div>
  );
}

const LEAD_SOURCE_TOOLTIPS: Record<string, string> = {
  "Instagram": "The lead sent an inbound message and the system automatically created a record to handle the inquiry.",
  "Instagram API": "The lead sent an inbound message and the system automatically created a record to handle the inquiry.",
  "Google AdWords": "The lead inquired through a paid ad or via website from a paid ad campaign.",
  "Google Ads": "The lead inquired through a paid ad or via website from a paid ad campaign.",
  "Facebook": "The lead inquired through a paid ad or via website from a paid ad campaign.",
  "Facebook Lead Ads": "The lead inquired through a paid ad or via website from a paid ad campaign.",
  "Web Form": "The lead came through the website with consent.",
  "Website": "The lead came through the website with consent.",
  "Web Site": "The lead came through the website with consent.",
  "Website Lead Form": "The lead came through the website with consent.",
  "SalesIQ": "The lead initiated a live chat on the website. This is treated as a website consent entry.",
};

function isSalesIQChat(note: NoteRecord): boolean {
  const text = `${note.title ?? ""} ${note.content ?? ""}`.toLowerCase();
  return /salesiq|sales\s*iq|live\s*chat|chat\s*transcript/.test(text);
}

function LeadSourceRow({ value }: { value?: string }) {
  if (!value) return null;
  const tooltip = LEAD_SOURCE_TOOLTIPS[value];
  return (
    <div className="flex gap-2 py-1 items-start">
      <span className="text-xs text-gray-500 w-40 shrink-0 pt-0.5">Lead Source</span>
      <span className="text-sm text-gray-800 break-words min-w-0 flex items-center gap-1.5">
        {value}
        {tooltip && (
          <span className="relative group inline-flex">
            <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center cursor-default select-none leading-none">i</span>
            <span className="pointer-events-none absolute left-5 top-0 z-50 w-64 rounded-md bg-gray-800 text-white text-xs px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-normal">
              {tooltip}
            </span>
          </span>
        )}
      </span>
    </div>
  );
}

type Tab = "overview" | "sms" | "calls" | "deals" | "webform" | "timeline";

export default function ContactDetail({ phone }: { phone: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!phone) return;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/contact/${encodeURIComponent(phone)}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => { setData(d); setActiveTab("overview"); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [phone]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm">Loading {fmt(phone)}…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-red-600 max-w-sm">
        <p className="font-medium">Error loading data</p>
        <p className="text-sm mt-1 text-gray-500">{error}</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      Select a phone number to view its record
    </div>
  );

  const { contact, allContacts = [], sms = [], calls = [], notes = [], deals = [], webform, formSubmissions = [] } = data;
  const salesIQChats = notes.filter(isSalesIQChat);
  const totalWebEntries = formSubmissions.length + salesIQChats.length;

  if (!contact) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 p-6">
      <div className="text-4xl">🔍</div>
      <p className="font-medium text-gray-600">No CRM record found</p>
      <p className="text-sm">for {fmt(phone)}</p>
      {(sms.length > 0 || calls.length > 0) && (
        <p className="text-xs text-gray-400 mt-1">
          {sms.length} SMS · {calls.length} calls (activity exists without a matched contact)
        </p>
      )}
      {formSubmissions.length > 0 && (
        <div className="w-full max-w-lg mt-4 space-y-3">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">
            {formSubmissions.length} Website Form Submission{formSubmissions.length !== 1 ? "s" : ""} Found
          </p>
          {formSubmissions.map((sub) => (
            <FormSubmissionCard key={sub.submissionId} sub={sub} />
          ))}
        </div>
      )}
    </div>
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "sms", label: "SMS", count: sms.length },
    { id: "calls", label: "Calls", count: calls.length },
    { id: "deals", label: "Transactions", count: deals.length },
    { id: "webform", label: "Webform / Consent", count: totalWebEntries > 0 ? totalWebEntries : undefined },
    { id: "timeline", label: "Timeline", count: sms.length + calls.length + notes.length },
  ];

  // Build merged timeline
  type TLItem = { ts: string; kind: "sms" | "call" | "note" | "chat"; data: SmsRecord | CallRecord | NoteRecord };
  const timeline: TLItem[] = [
    ...sms.map((s) => ({ ts: s.createdTime, kind: "sms" as const, data: s })),
    ...calls.map((c) => ({ ts: c.startTime, kind: "call" as const, data: c })),
    ...notes.map((n) => ({ ts: n.createdTime, kind: isSalesIQChat(n) ? "chat" as const : "note" as const, data: n })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  function exportRecord() {
    const lines: string[] = [];
    const sep = (title: string) => { lines.push(""); lines.push(`${"=".repeat(60)}`); lines.push(title.toUpperCase()); lines.push("=".repeat(60)); };
    const fmtDate = (s: string) => { try { return new Date(s).toLocaleString(); } catch { return s; } };

    lines.push(`TCPA COMPLIANCE RECORD EXPORT`);
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push(`Phone: ${fmt(phone)}`);

    sep("Contact Information");
    if (contact) {
      lines.push(`Name:        ${contact.fullName || "—"}`);
      lines.push(`Type:        ${contact.type}`);
      lines.push(`Email:       ${contact.email || "—"}`);
      lines.push(`Phone:       ${contact.phone || "—"}`);
      lines.push(`Mobile:      ${contact.mobile || "—"}`);
      lines.push(`Account:     ${contact.accountName || "—"}`);
      lines.push(`Owner:       ${contact.owner || "—"}`);
      lines.push(`Lead Source: ${contact.leadSource || "—"}`);
      lines.push(`Created:     ${contact.createdTime ? fmtDate(contact.createdTime) : "—"}`);
    } else {
      lines.push("No CRM contact found.");
    }

    sep(`SMS Messages (${sms.length})`);
    if (sms.length === 0) { lines.push("No SMS records."); }
    for (const m of sms) {
      const dir = m.directionType === "MO" ? "INBOUND" : "OUTBOUND";
      lines.push(`[${fmtDate(m.createdTime)}] ${dir} via ${m.channel || "—"}`);
      lines.push(`  From: ${m.fromNumber}  To: ${m.toNumber}`);
      lines.push(`  ${m.message}`);
      if (m.media && m.media.length > 0) lines.push(`  Media: ${m.media.join(", ")}`);
      lines.push("");
    }

    sep(`Phone Calls (${calls.length})`);
    if (calls.length === 0) { lines.push("No call records."); }
    for (const c of calls) {
      lines.push(`[${fmtDate(c.startTime)}] ${c.subject}`);
      lines.push(`  Type: ${c.callType}  Duration: ${c.duration || "—"}  Status: ${c.outgoingStatus || "—"}`);
      if (c.description) lines.push(`  Notes: ${c.description}`);
      lines.push("");
    }

    sep(`Deals / Transactions (${deals.length})`);
    if (deals.length === 0) { lines.push("No deal records."); }
    for (const d of deals) {
      lines.push(`[${fmtDate(d.createdTime)}] ${d.dealName}`);
      lines.push(`  Stage: ${d.stage}  Amount: ${d.amount != null ? `$${d.amount}` : "—"}  Close: ${d.closingDate || "—"}`);
      lines.push("");
    }

    sep(`Live Chat / Web Entries (${formSubmissions.length + salesIQChats.length})`);
    for (const n of salesIQChats) {
      lines.push(`[${fmtDate(n.createdTime)}] SalesIQ Live Chat — Website Consent`);
      lines.push(`  ${n.title || "Chat"}`);
      if (n.content) lines.push(`  ${n.content.slice(0, 300)}`);
      lines.push("");
    }
    if (formSubmissions.length === 0 && salesIQChats.length === 0) { lines.push("No web entries."); }
    for (const f of formSubmissions) {
      lines.push(`[${fmtDate(f.createdAt)}] ${f.formName}`);
      if (f.fullName || f.firstName) lines.push(`  Name: ${f.fullName || [f.firstName, f.lastName].filter(Boolean).join(" ")}`);
      if (f.email) lines.push(`  Email: ${f.email}`);
      if (f.phone) lines.push(`  Phone: ${f.phone}`);
      if (f.consentChecked !== undefined) lines.push(`  Consent: ${f.consentChecked ? "YES" : "NO"}`);
      if (f.utmSource) lines.push(`  UTM Source: ${f.utmSource}`);
      if (f.utmCampaign) lines.push(`  UTM Campaign: ${f.utmCampaign}`);
      lines.push("");
    }

    if (webform) {
      sep("CRM Web Form / Consent Data");
      lines.push(`Lead Source:   ${webform.leadSource || "—"}`);
      lines.push(`Data Source:   ${webform.dataSource || "—"}`);
      lines.push(`GCLID:         ${webform.gclid || "—"}`);
      lines.push(`FB Lead ID:    ${webform.facebookLeadId || "—"}`);
      lines.push(`Email Opt-Out: ${webform.emailOptOut ? "YES" : "NO"}`);
    }

    const text = lines.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${((contact?.fullName) ?? phone).replace(/\s+/g, "_")}_${phone}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{contact.fullName || "Unknown"}</h2>
            <p className="text-sm text-gray-500">{fmt(phone)}</p>
            {contact.leadSource && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-xs text-gray-400">Lead Source:</span>
                <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                  {contact.leadSource}
                </span>
                {LEAD_SOURCE_TOOLTIPS[contact.leadSource] && (
                  <span className="relative group inline-flex">
                    <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold flex items-center justify-center cursor-default select-none leading-none">i</span>
                    <span className="pointer-events-none absolute left-5 top-0 z-50 w-64 rounded-md bg-gray-800 text-white text-xs px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-normal">
                      {LEAD_SOURCE_TOOLTIPS[contact.leadSource]}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap justify-end items-start">
            <Badge label={contact.type} color={contact.type === "Contact" ? "blue" : "amber"} />
            {contact.accountName && <Badge label={contact.accountName} color="purple" />}
            {contact.owner && <Badge label={contact.owner} color="gray" />}
            <button
              onClick={exportRecord}
              className="ml-1 px-3 py-1 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 overflow-x-auto shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-600 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            {allContacts.length > 1 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">
                  {allContacts.length} duplicate records merged for this number
                </p>
                <div className="flex flex-col gap-1">
                  {allContacts.map((c) => (
                    <div key={c.id} className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-amber-600">{c.fullName || "—"} · {c.type} · {c.owner || "no owner"}</span>
                      {c.leadSource && (
                        <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                          {c.leadSource}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Section title="Contact Details">
              <Row label="Full Name" value={contact.fullName} />
              <Row label="Email" value={contact.email} />
              <Row label="Phone" value={contact.phone} />
              <Row label="Mobile" value={contact.mobile} />
              <Row label="Record Type" value={contact.type} />
              <Row label="Patient ID" value={contact.patientId} />
              <Row label="Created" value={fmtDate(contact.createdTime)} />
              <Row label="Last Modified" value={fmtDate(contact.modifiedTime)} />
              <Row label="Owner" value={contact.owner} />
              <Row label="Dedup Status" value={contact.deduplicationStatus} />
              <Row label="Best Contact Time" value={contact.bestContactTime} />
            </Section>
            <Section title="Account">
              <Row label="Account Name" value={contact.accountName} />
              <LeadSourceRow value={contact.leadSource} />
              <Row label="Data Source" value={contact.dataSource} />
            </Section>
            <Section title="Activity Summary">
              <div className="grid grid-cols-3 gap-3 mt-2">
                {[
                  { label: "SMS Messages", count: sms.length, color: "bg-blue-50 text-blue-700" },
                  { label: "Phone Calls", count: calls.length, color: "bg-green-50 text-green-700" },
                  { label: "Deals", count: deals.length, color: "bg-amber-50 text-amber-700" },
                  { label: "Web / Chat Entries", count: totalWebEntries, color: "bg-emerald-50 text-emerald-700" },
                ].map(({ label, count, color }) => (
                  <div key={label} className={`rounded-lg p-3 ${color}`}>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs mt-0.5 opacity-80">{label}</p>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="space-y-2">
            {timeline.length === 0 && <Empty text="No activity on record" />}
            {timeline.map((item, i) => (
              <TimelineCard key={i} item={item} />
            ))}
          </div>
        )}

        {activeTab === "sms" && (
          <div className="space-y-2">
            {sms.length === 0 && <Empty text="No SMS messages found" />}
            {sms.map((s) => <SmsCard key={s.id} sms={s} phone={phone} />)}
          </div>
        )}

        {activeTab === "calls" && (
          <div className="space-y-2">
            {calls.length === 0 && <Empty text="No call records found" />}
            {calls.map((c) => <CallCard key={c.id} call={c} />)}
          </div>
        )}


        {activeTab === "deals" && (
          <div className="space-y-2">
            {deals.length === 0 && <Empty text="No transactions on record" />}
            {deals.map((d) => <DealCard key={d.id} deal={d} />)}
          </div>
        )}

        {activeTab === "webform" && (
          <WebformPanel webform={webform} contact={contact} formSubmissions={formSubmissions} salesIQChats={salesIQChats} />
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
      <div className="bg-white rounded-lg border border-gray-200 px-4 py-2 divide-y divide-gray-50">
        {children}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 text-center py-8">{text}</p>;
}

type TLItem = { ts: string; kind: "sms" | "call" | "note" | "chat"; data: SmsRecord | CallRecord | NoteRecord };

function TimelineCard({ item }: { item: TLItem }) {
  const colors = { sms: "bg-blue-500", call: "bg-green-500", note: "bg-purple-500", chat: "bg-teal-500" };
  const labels = { sms: "SMS", call: "Call", note: "Note", chat: "Live Chat" };
  const borders = { sms: "border-gray-200", call: "border-gray-200", note: "border-gray-200", chat: "border-teal-200" };
  const bgs = { sms: "bg-white", call: "bg-white", note: "bg-white", chat: "bg-teal-50" };
  let preview = "";
  if (item.kind === "sms") preview = (item.data as SmsRecord).message?.slice(0, 100) ?? "";
  if (item.kind === "call") preview = `${(item.data as CallRecord).callType} · ${(item.data as CallRecord).duration ?? ""}`;
  if (item.kind === "note") preview = (item.data as NoteRecord).title ?? "";
  if (item.kind === "chat") preview = (item.data as NoteRecord).title ?? "SalesIQ Live Chat";

  return (
    <div className="flex gap-3 items-start">
      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${colors[item.kind]}`} />
      <div className={`flex-1 border rounded-lg px-3 py-2 ${bgs[item.kind]} ${borders[item.kind]}`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 uppercase">{labels[item.kind]}</span>
            {item.kind === "chat" && (
              <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium">Website Consent</span>
            )}
          </div>
          <span className="text-xs text-gray-400">{fmtDate(item.ts)}</span>
        </div>
        <p className="text-sm text-gray-700 mt-0.5 truncate">{preview || "—"}</p>
      </div>
    </div>
  );
}

function SmsCard({ sms, phone }: { sms: SmsRecord; phone: string }) {
  // Use explicit directionType (SimpleTexting) or fall back to phone matching (Zoho)
  const isInbound = sms.directionType
    ? sms.directionType === "MO"
    : sms.fromNumber?.includes(phone.slice(-10));
  const isST = sms.channel === "SimpleTexting";

  return (
    <div className={`rounded-lg p-3 border ${isInbound ? "bg-white border-gray-200" : isST ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200"}`}>
      <div className="flex justify-between items-center mb-1">
        <div className="flex gap-2 items-center flex-wrap">
          <span className={`text-xs font-medium ${isInbound ? "text-gray-500" : isST ? "text-violet-600" : "text-blue-600"}`}>
            {isInbound ? "↙ Inbound" : "↗ Outbound"}
          </span>
          {sms.messageType && <Badge label={sms.messageType} color="gray" />}
          {sms.channel && <Badge label={sms.channel} color={isST ? "purple" : "gray"} />}
          {isST && sms.referenceType === "CMP" && <Badge label="Campaign" color="purple" />}
        </div>
        <span className="text-xs text-gray-400">{fmtDate(sms.createdTime)}</span>
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{sms.message || "—"}</p>
      {sms.media && sms.media.length > 0 && (
        <p className="text-xs text-blue-500 mt-1">📎 {sms.media.length} media attachment(s)</p>
      )}
      {!isST && <p className="text-xs text-gray-400 mt-1">{sms.fromNumber} → {sms.toNumber}</p>}
    </div>
  );
}

function CallCard({ call }: { call: CallRecord }) {
  const typeColor = call.callType === "Inbound" ? "green" : "blue";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex justify-between items-start mb-1">
        <div className="flex gap-2 flex-wrap items-center">
          <Badge label={call.callType || "Call"} color={typeColor} />
          {call.callResult && <Badge label={call.callResult} color="gray" />}
          {call.callPurpose && <Badge label={call.callPurpose} color="purple" />}
        </div>
        <span className="text-xs text-gray-400 shrink-0 ml-2">{fmtDate(call.startTime)}</span>
      </div>
      <p className="text-sm font-medium text-gray-800">{call.subject || "Call"}</p>
      {call.duration && <p className="text-xs text-gray-500 mt-0.5">Duration: {call.duration}</p>}
      {call.contactName && <p className="text-xs text-gray-500">Contact: {call.contactName}</p>}
      {call.dialledNumber && <p className="text-xs text-gray-400">Dialled: {call.dialledNumber}</p>}
      {call.callerId && <p className="text-xs text-gray-400">Caller ID: {call.callerId}</p>}
      {call.summary && (
        <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded p-2 text-xs">{call.summary}</p>
      )}
      {call.description && !call.summary && (
        <p className="text-sm text-gray-600 mt-2 text-xs">{call.description}</p>
      )}
    </div>
  );
}

function NoteCard({ note }: { note: NoteRecord }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex justify-between items-center mb-1">
        <p className="text-sm font-medium text-gray-800">{note.title || "Note"}</p>
        <span className="text-xs text-gray-400">{fmtDate(note.createdTime)}</span>
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content || "—"}</p>
      {note.owner && <p className="text-xs text-gray-400 mt-1">By {note.owner}</p>}
    </div>
  );
}

function DealCard({ deal }: { deal: DealRecord }) {
  const stageColors: Record<string, string> = {
    "Closed Won": "green", "Closed Lost": "red",
    "Proposal": "blue", "Negotiation": "amber",
  };
  const color = stageColors[deal.stage] ?? "gray";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex justify-between items-start mb-1">
        <div>
          <p className="text-sm font-medium text-gray-800">{deal.dealName}</p>
          {deal.accountName && <p className="text-xs text-gray-500">{deal.accountName}</p>}
        </div>
        <Badge label={deal.stage} color={color} />
      </div>
      <div className="flex gap-4 mt-1">
        {deal.amount != null && (
          <p className="text-sm text-green-700 font-medium">${deal.amount.toLocaleString()}</p>
        )}
        {deal.closingDate && (
          <p className="text-xs text-gray-500">Close: {deal.closingDate}</p>
        )}
        <p className="text-xs text-gray-400">Created: {fmtDate(deal.createdTime)}</p>
      </div>
      {deal.owner && <p className="text-xs text-gray-400 mt-1">Owner: {deal.owner}</p>}
    </div>
  );
}

function SalesIQChatCard({ note }: { note: NoteRecord }) {
  return (
    <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 border-l-4 border-l-teal-400">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-700">
            Live Chat · Website Consent
          </span>
        </div>
        <span className="text-xs text-gray-400 shrink-0 ml-2">{fmtDate(note.createdTime)}</span>
      </div>
      <p className="text-sm font-medium text-gray-800">{note.title || "SalesIQ Chat"}</p>
      {note.content && (
        <p className="text-xs text-gray-600 mt-1 bg-white rounded p-2 border border-teal-100 whitespace-pre-wrap line-clamp-4">
          {note.content}
        </p>
      )}
      {note.owner && <p className="text-xs text-gray-400 mt-1">Agent: {note.owner}</p>}
    </div>
  );
}

function WebformPanel({ webform, contact, formSubmissions, salesIQChats }: { webform: WebformData | null; contact: ContactRecord; formSubmissions: FormSubmission[]; salesIQChats: NoteRecord[] }) {
  return (
    <div className="space-y-6">
      {salesIQChats.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Live Chat Sessions — Website Consent ({salesIQChats.length})
          </h3>
          <div className="space-y-3">
            {salesIQChats.map((n) => (
              <SalesIQChatCard key={n.id} note={n} />
            ))}
          </div>
        </div>
      )}

      {formSubmissions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Website Form Submissions ({formSubmissions.length})
          </h3>
          <div className="space-y-3">
            {formSubmissions.map((sub) => (
              <FormSubmissionCard key={sub.submissionId} sub={sub} />
            ))}
          </div>
        </div>
      )}

      {webform && (
        <>
          <Section title="Lead / Webform Source (CRM)">
            <LeadSourceRow value={webform.leadSource} />
            <Row label="Data Source" value={webform.dataSource} />
            <Row label="Ad Group" value={webform.adGroupName} />
            <Row label="Ad Creative" value={webform.adsCreativeName} />
            <Row label="GCLID (Google)" value={webform.gclid} />
            <Row label="Facebook Lead ID" value={webform.facebookLeadId} />
            <Row label="Facebook Click ID" value={webform.facebookClickId} />
            <Row label="Social Lead ID" value={webform.socialLeadId} />
            <Row label="Zoho Campaign ID" value={webform.zcampaignId} />
          </Section>
          <Section title="Consent Disclosures">
            <Row
              label="Email Opt-Out"
              value={
                webform.emailOptOut === true ? (
                  <span className="text-red-600 font-medium">Yes — opted out</span>
                ) : webform.emailOptOut === false ? (
                  <span className="text-green-600">No — opted in</span>
                ) : (
                  "Unknown"
                )
              }
            />
            <Row label="Best Contact Time" value={webform.bestContactTime} />
          </Section>
        </>
      )}

      {!webform && formSubmissions.length === 0 && salesIQChats.length === 0 && (
        <Empty text="No webform or consent data found" />
      )}
    </div>
  );
}

function FormSubmissionCard({ sub }: { sub: FormSubmission }) {
  const name = sub.fullName ?? [sub.firstName, sub.lastName].filter(Boolean).join(" ");
  const hasUtm = sub.utmSource || sub.utmMedium || sub.utmCampaign;
  return (
    <div className="bg-white border border-green-200 rounded-lg p-3 border-l-4 border-l-green-400">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
              Web Consent
            </span>
            <span className="text-xs text-gray-500">{sub.formName}</span>
          </div>
          {name && <p className="text-sm font-medium text-gray-800 mt-1">{name}</p>}
        </div>
        <span className="text-xs text-gray-400 shrink-0 ml-2">{sub.createdAt}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {sub.email && <p className="text-gray-600"><span className="text-gray-400">Email:</span> {sub.email}</p>}
        {sub.phone && <p className="text-gray-600"><span className="text-gray-400">Phone:</span> {sub.phone}</p>}
        {sub.bestDateForCall && <p className="text-gray-600"><span className="text-gray-400">Call Date:</span> {sub.bestDateForCall}</p>}
        {sub.bestTimeForCall && <p className="text-gray-600"><span className="text-gray-400">Call Time:</span> {sub.bestTimeForCall}</p>}
        {sub.preferredLanguage && <p className="text-gray-600"><span className="text-gray-400">Language:</span> {sub.preferredLanguage}</p>}
        {sub.zipCode && <p className="text-gray-600"><span className="text-gray-400">Zip:</span> {sub.zipCode}</p>}
        {sub.requestType && <p className="text-gray-600 col-span-2"><span className="text-gray-400">Request:</span> {sub.requestType}</p>}
        {sub.procedure && <p className="text-gray-600 col-span-2"><span className="text-gray-400">Procedure:</span> {sub.procedure}</p>}
        {sub.clinicLocation && <p className="text-gray-600"><span className="text-gray-400">Clinic:</span> {sub.clinicLocation}</p>}
        {sub.locationOfInterest && <p className="text-gray-600"><span className="text-gray-400">Location:</span> {sub.locationOfInterest}</p>}
        {sub.yearsExperience && <p className="text-gray-600"><span className="text-gray-400">Sales Exp:</span> {sub.yearsExperience} yrs</p>}
      </div>
      {sub.requestDescription && (
        <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2">{sub.requestDescription}</p>
      )}
      {hasUtm && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-1">UTM Attribution</p>
          <div className="flex flex-wrap gap-1">
            {sub.utmSource && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">src: {sub.utmSource}</span>}
            {sub.utmMedium && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">med: {sub.utmMedium}</span>}
            {sub.utmCampaign && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">cmp: {sub.utmCampaign}</span>}
            {sub.utmContent && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">cnt: {sub.utmContent}</span>}
            {sub.utmTerm && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">trm: {sub.utmTerm}</span>}
            {sub.gclid && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">gclid</span>}
            {sub.fbclid && <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">fbclid</span>}
          </div>
        </div>
      )}
      {sub.submittedUrl && (
        <p className="mt-1 text-xs text-gray-400 truncate">Page: {sub.submittedUrl}</p>
      )}
      {sub.consentChecked && (
        <p className="mt-1 text-xs text-green-600 font-medium">✓ Consent checkbox checked</p>
      )}
    </div>
  );
}
