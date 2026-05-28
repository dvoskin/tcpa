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

type Tab = "overview" | "timeline" | "sms" | "calls" | "notes" | "deals" | "webform";

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

  const { contact, sms = [], calls = [], notes = [], deals = [], webform, formSubmissions = [] } = data;

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
    { id: "timeline", label: "Timeline", count: sms.length + calls.length + notes.length },
    { id: "sms", label: "SMS", count: sms.length },
    { id: "calls", label: "Calls", count: calls.length },
    { id: "notes", label: "Notes", count: notes.length },
    { id: "deals", label: "Transactions", count: deals.length },
    { id: "webform", label: "Webform / Consent", count: formSubmissions.length > 0 ? formSubmissions.length : undefined },
  ];

  // Build merged timeline
  type TLItem = { ts: string; kind: "sms" | "call" | "note"; data: SmsRecord | CallRecord | NoteRecord };
  const timeline: TLItem[] = [
    ...sms.map((s) => ({ ts: s.createdTime, kind: "sms" as const, data: s })),
    ...calls.map((c) => ({ ts: c.startTime, kind: "call" as const, data: c })),
    ...notes.map((n) => ({ ts: n.createdTime, kind: "note" as const, data: n })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{contact.fullName || "Unknown"}</h2>
            <p className="text-sm text-gray-500">{fmt(phone)}</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Badge label={contact.type} color={contact.type === "Contact" ? "blue" : "amber"} />
            {contact.accountName && <Badge label={contact.accountName} color="purple" />}
            {contact.owner && <Badge label={contact.owner} color="gray" />}
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
              <Row label="Lead Source" value={contact.leadSource} />
              <Row label="Data Source" value={contact.dataSource} />
              <Row label="Campaign" value={contact.campaignName} />
            </Section>
            <Section title="Activity Summary">
              <div className="grid grid-cols-3 gap-3 mt-2">
                {[
                  { label: "SMS Messages", count: sms.length, color: "bg-blue-50 text-blue-700" },
                  { label: "Phone Calls", count: calls.length, color: "bg-green-50 text-green-700" },
                  { label: "Notes", count: notes.length, color: "bg-purple-50 text-purple-700" },
                  { label: "Deals", count: deals.length, color: "bg-amber-50 text-amber-700" },
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

        {activeTab === "notes" && (
          <div className="space-y-2">
            {notes.length === 0 && <Empty text="No notes on file" />}
            {notes.map((n) => <NoteCard key={n.id} note={n} />)}
          </div>
        )}

        {activeTab === "deals" && (
          <div className="space-y-2">
            {deals.length === 0 && <Empty text="No transactions on record" />}
            {deals.map((d) => <DealCard key={d.id} deal={d} />)}
          </div>
        )}

        {activeTab === "webform" && (
          <WebformPanel webform={webform} contact={contact} formSubmissions={formSubmissions} />
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

type TLItem = { ts: string; kind: "sms" | "call" | "note"; data: SmsRecord | CallRecord | NoteRecord };

function TimelineCard({ item }: { item: TLItem }) {
  const colors = { sms: "bg-blue-500", call: "bg-green-500", note: "bg-purple-500" };
  const labels = { sms: "SMS", call: "Call", note: "Note" };
  let preview = "";
  if (item.kind === "sms") preview = (item.data as SmsRecord).message?.slice(0, 100) ?? "";
  if (item.kind === "call") preview = `${(item.data as CallRecord).callType} · ${(item.data as CallRecord).duration ?? ""}`;
  if (item.kind === "note") preview = (item.data as NoteRecord).title ?? "";

  return (
    <div className="flex gap-3 items-start">
      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${colors[item.kind]}`} />
      <div className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-gray-500 uppercase">{labels[item.kind]}</span>
          <span className="text-xs text-gray-400">{fmtDate(item.ts)}</span>
        </div>
        <p className="text-sm text-gray-700 mt-0.5 truncate">{preview || "—"}</p>
      </div>
    </div>
  );
}

function SmsCard({ sms, phone }: { sms: SmsRecord; phone: string }) {
  const isInbound = sms.fromNumber?.includes(phone.slice(-10));
  return (
    <div className={`rounded-lg p-3 border ${isInbound ? "bg-white border-gray-200" : "bg-blue-50 border-blue-200"}`}>
      <div className="flex justify-between items-center mb-1">
        <div className="flex gap-2 items-center">
          <span className={`text-xs font-medium ${isInbound ? "text-gray-500" : "text-blue-600"}`}>
            {isInbound ? "↙ Inbound" : "↗ Outbound"}
          </span>
          {sms.messageType && <Badge label={sms.messageType} color="gray" />}
          {sms.channel && <Badge label={sms.channel} color="gray" />}
        </div>
        <span className="text-xs text-gray-400">{fmtDate(sms.createdTime)}</span>
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{sms.message || "—"}</p>
      {sms.media && sms.media.length > 0 && (
        <p className="text-xs text-blue-500 mt-1">📎 {sms.media.length} media attachment(s)</p>
      )}
      <p className="text-xs text-gray-400 mt-1">{sms.fromNumber} → {sms.toNumber}</p>
    </div>
  );
}

function CallCard({ call }: { call: CallRecord }) {
  const typeColor = call.callType === "Inbound" ? "green" : "blue";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex justify-between items-start mb-1">
        <div className="flex gap-2 flex-wrap">
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

function WebformPanel({ webform, contact, formSubmissions }: { webform: WebformData | null; contact: ContactRecord; formSubmissions: FormSubmission[] }) {
  return (
    <div className="space-y-6">
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
            <Row label="Lead Source" value={webform.leadSource} />
            <Row label="Data Source" value={webform.dataSource} />
            <Row label="Campaign Name" value={webform.campaignName} />
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
              label="Medullary Thyroid Cancer History"
              value={webform.medullaryThyroidCancerConsent ?? "Not answered"}
            />
            <Row
              label="Order Assisted By Agent"
              value={webform.assistedOrder ?? "Not answered"}
            />
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

      {!webform && formSubmissions.length === 0 && (
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
