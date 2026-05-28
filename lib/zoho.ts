import { NextResponse } from "next/server";

const BASE_URL = process.env.ZOHO_BASE_URL ?? "https://www.zohoapis.com";
const ACCOUNTS_URL =
  process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com";

let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(`${ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Zoho auth failed: ${JSON.stringify(data)}`);
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;
  return cachedToken!;
}

// REST API search — supports criteria on fields not queryable in COQL
async function zohoSearch(module: string, criteria: string): Promise<unknown[]> {
  const token = await getAccessToken();
  const res = await fetch(
    `${BASE_URL}/crm/v7/${module}/search?criteria=${encodeURIComponent(criteria)}&per_page=200`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  if (res.status === 204) return [];
  if (!res.ok) return [];
  const text = await res.text();
  if (!text || !text.trim()) return [];
  try {
    const d = JSON.parse(text) as { data?: unknown[] };
    return d.data ?? [];
  } catch { return []; }
}

async function zohoGet(path: string): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (res.status === 204) return {};
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Zoho API ${path} → ${res.status}: ${txt}`);
  }
  const text = await res.text();
  if (!text || !text.trim()) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

async function coql(query: string): Promise<unknown[]> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/crm/v7/coql`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ select_query: query }),
  });
  const text = await res.text();
  if (!text || !text.trim()) return [];
  let data: { data?: unknown[]; status?: string; message?: string; code?: string };
  try { data = JSON.parse(text); } catch { return []; }
  if (data.status === "error") {
    console.error("COQL error:", data.code, data.message, "| query:", query.trim().slice(0, 100));
    return [];
  }
  return data.data ?? [];
}

// Normalize a phone number to 10 digits (US)
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

// Build a set of phone variants to search (10-digit and +1 prefix)
export function phoneVariants(phone: string): string[] {
  const ten = normalizePhone(phone);
  return [ten, `+1${ten}`, `1${ten}`, `(${ten.slice(0,3)}) ${ten.slice(3,6)}-${ten.slice(6)}`];
}

// ─── Contact / Lead lookup ────────────────────────────────────────────────────

export interface ContactRecord {
  id: string;
  type: "Contact" | "Lead";
  fullName: string;
  email?: string;
  phone?: string;
  mobile?: string;
  accountName?: string;
  leadSource?: string;
  dataSource?: string;
  owner?: string;
  createdTime?: string;
  modifiedTime?: string;
  // medical/consent fields
  consentFields?: Record<string, string | boolean | null>;
  // webform / ad tracking
  campaignName?: string;
  adSource?: string;
  facebookLeadId?: string;
  gclid?: string;
  // custom
  patientId?: string;
  bestContactTime?: string;
  preferredAgentId?: string;
  deduplicationStatus?: string;
}

// COQL-safe fields for Contacts (excludes lookup fields like Account_Name which cause NO_PERMISSION)
const CONTACT_COQL_FIELDS = [
  "id", "Full_Name", "Email", "Phone", "Mobile", "Lead_Source",
  "Owner", "Created_Time", "Modified_Time", "Data_Source", "Campaign_Name",
  "Ad_Campaign_Name", "GCLID", "Facebook_Lead_ID", "patient_id",
  "Best_Contact_Time", "Preferred_Agent_ID", "Deduplication_Status",
  "Customer_phone_number", "Phone_Normalized",
  "Medullary_thyroid_cancer_or_a_history_of_such",
  "Did_anyone_assist_with_the_order",
].join(", ");

const REST_CONTACT_FIELDS = [
  "id", "Full_Name", "Email", "Phone", "Mobile", "Account_Name", "Lead_Source",
  "Owner", "Created_Time", "Modified_Time", "Data_Source", "Campaign_Name",
  "Ad_Campaign_Name", "GCLID", "Facebook_Lead_ID", "patient_id",
  "Best_Contact_Time", "Preferred_Agent_ID", "Deduplication_Status",
  "Customer_phone_number", "Phone_Normalized",
  "Medullary_thyroid_cancer_or_a_history_of_such",
  "Did_anyone_assist_with_the_order",
].join(",");

// Returns ALL contacts/leads matching the phone — covers duplicates across all records
export async function findAllContactsByPhone(phone: string): Promise<ContactRecord[]> {
  const ten = normalizePhone(phone);
  const e164 = `+1${ten}`;
  const escaped = ten.replace(/'/g, "\\'");
  const escaped164 = e164.replace(/'/g, "\\'");
  const seen = new Set<string>();
  const all: ContactRecord[] = [];

  function add(c: Record<string, unknown>, type: "Contact" | "Lead") {
    if (seen.has(c.id as string)) return;
    seen.add(c.id as string);
    all.push(mapContact(c, type));
  }

  // REST search covers Phone + Mobile fields and returns all matches
  for (const searchPhone of [ten, e164]) {
    const raw = await zohoGet(
      `/crm/v7/Contacts/search?phone=${encodeURIComponent(searchPhone)}&fields=${REST_CONTACT_FIELDS}&per_page=200`
    ) as { data?: Record<string, unknown>[] };
    for (const c of raw.data ?? []) add(c, "Contact");
  }

  // COQL for custom phone fields — split OR conditions into separate queries (COQL rejects OR)
  const [byCustomPhone, byNormalized] = await Promise.all([
    coql(`SELECT ${CONTACT_COQL_FIELDS} FROM Contacts WHERE Customer_phone_number = '${escaped}' LIMIT 200`),
    coql(`SELECT ${CONTACT_COQL_FIELDS} FROM Contacts WHERE Phone_Normalized = '${escaped}' LIMIT 200`),
  ]);
  for (const c of [...byCustomPhone, ...byNormalized]) add(c as Record<string, unknown>, "Contact");


  return all;
}

export async function findContactByPhone(phone: string): Promise<ContactRecord | null> {
  const all = await findAllContactsByPhone(phone);
  return all[0] ?? null;
}

function mapContact(c: Record<string, unknown>, type: "Contact" | "Lead"): ContactRecord {
  const owner = c.Owner as Record<string, unknown> | null;
  const accountName = c.Account_Name as Record<string, unknown> | string | null;
  return {
    id: c.id as string,
    type,
    fullName: (c.Full_Name as string) ?? "",
    email: (c.Email as string) ?? undefined,
    phone: (c.Phone as string) ?? undefined,
    mobile: (c.Mobile as string) ?? undefined,
    accountName:
      typeof accountName === "object" && accountName !== null
        ? (accountName.name as string)
        : (accountName as string) ?? undefined,
    leadSource: (c.Lead_Source as string) ?? undefined,
    dataSource: (c.Data_Source as string) ?? undefined,
    owner: owner ? (owner.name as string) : undefined,
    createdTime: (c.Created_Time as string) ?? undefined,
    modifiedTime: (c.Modified_Time as string) ?? undefined,
    consentFields: {
      medullaryThyroidCancer: c.Medullary_thyroid_cancer_or_a_history_of_such as string | null,
      assistedOrder: c.Did_anyone_assist_with_the_order as string | null,
    },
    campaignName: (c.Campaign_Name as string) ?? (c.Ad_Campaign_Name as string) ?? undefined,
    adSource: (c.SalesAPE_Lead_Source as string) ?? undefined,
    facebookLeadId: (c.Facebook_Lead_ID as string) ?? undefined,
    gclid: (c.GCLID as string) ?? undefined,
    patientId: (c.patient_id as string) ?? undefined,
    bestContactTime: (c.Best_Contact_Time as string) ?? undefined,
    preferredAgentId: (c.Preferred_Agent_ID as string) ?? undefined,
    deduplicationStatus: (c.Deduplication_Status as string) ?? undefined,
  };
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export interface NoteRecord {
  id: string;
  title: string;
  content: string;
  createdTime: string;
  modifiedTime?: string;
  owner?: string;
  parentId?: string;
}

export async function getNotes(contactIds: string[]): Promise<NoteRecord[]> {
  const seen = new Set<string>();
  const all: NoteRecord[] = [];
  // Fan out per ID — COQL polymorphic Parent_Id doesn't reliably support `in`
  await Promise.all(contactIds.map(async (contactId) => {
    const query = `SELECT id, Note_Title, Note_Content, Created_Time, Modified_Time, Owner FROM Notes WHERE Parent_Id = '${contactId}' ORDER BY Created_Time DESC LIMIT 100`;
    for (const r of await coql(query)) {
      const n = r as Record<string, unknown>;
      if (seen.has(n.id as string)) continue;
      seen.add(n.id as string);
      const owner = n.Owner as Record<string, unknown> | null;
      all.push({
        id: n.id as string,
        title: (n.Note_Title as string) ?? "",
        content: (n.Note_Content as string) ?? "",
        createdTime: n.Created_Time as string,
        modifiedTime: (n.Modified_Time as string) ?? undefined,
        owner: owner ? (owner.name as string) ?? undefined : undefined,
      });
    }
  }));
  return all.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
}

// ─── SMS ─────────────────────────────────────────────────────────────────────

export interface SmsRecord {
  id: string;
  fromNumber: string;
  toNumber: string;
  message: string;
  messageType: string;
  sentVia?: string;
  channel?: string;
  createdTime: string;
  media?: string[];
}

export async function getSmsHistory(contactIds: string[], phone: string): Promise<SmsRecord[]> {
  const seenIds = new Set<string>();
  const results: SmsRecord[] = [];

  function pushHelloSend(row: Record<string, unknown>) {
    if (seenIds.has(row.id as string)) return;
    seenIds.add(row.id as string);
    const media = [
      row.ringcentralbulksmsextensionforzohocrm__Media_1,
      row.ringcentralbulksmsextensionforzohocrm__Media_2,
      row.ringcentralbulksmsextensionforzohocrm__Media_3,
    ].filter(Boolean) as string[];
    results.push({
      id: row.id as string,
      fromNumber: (row.ringcentralbulksmsextensionforzohocrm__From_Number as string) ?? "",
      toNumber: (row.ringcentralbulksmsextensionforzohocrm__To as string) ?? "",
      message: (row.ringcentralbulksmsextensionforzohocrm__SMS as string) ?? "",
      messageType: (row.ringcentralbulksmsextensionforzohocrm__SMS_Type as string) ?? "SMS",
      sentVia: (row.ringcentralbulksmsextensionforzohocrm__SMS_Sent_Via as string) ?? undefined,
      channel: (row.ringcentralbulksmsextensionforzohocrm__Channel as string) ?? "HelloSend",
      createdTime: row.Created_Time as string,
      media: media.length > 0 ? media : undefined,
    });
  }

  // ── Module 1a: HelloSend by Contact_Lookup — fan out across all contact IDs ──
  await Promise.all(contactIds.map(async (contactId) => {
    const q = `SELECT id, ringcentralbulksmsextensionforzohocrm__From_Number, ringcentralbulksmsextensionforzohocrm__To, ringcentralbulksmsextensionforzohocrm__SMS, ringcentralbulksmsextensionforzohocrm__SMS_Type, ringcentralbulksmsextensionforzohocrm__SMS_Sent_Via, ringcentralbulksmsextensionforzohocrm__Channel, ringcentralbulksmsextensionforzohocrm__Media_1, ringcentralbulksmsextensionforzohocrm__Media_2, ringcentralbulksmsextensionforzohocrm__Media_3, Created_Time FROM ringcentralbulksmsextensionforzohocrm__RingCentral_SMS_History WHERE ringcentralbulksmsextensionforzohocrm__Contact_Lookup = '${contactId}' ORDER BY Created_Time DESC LIMIT 200`;
    for (const r of await coql(q)) pushHelloSend(r as Record<string, unknown>);
  }));

  // ── Module 1b: HelloSend by To phone — catches records not linked to any contact
  const e164 = `+1${phone}`;
  for (const r of await zohoSearch(
    "ringcentralbulksmsextensionforzohocrm__RingCentral_SMS_History",
    `(ringcentralbulksmsextensionforzohocrm__To:equals:${e164})`
  )) pushHelloSend(r as Record<string, unknown>);

  // ── Module 2: RingCentral ABR Extension SMS — fan out across all contact IDs ─
  await Promise.all(contactIds.map(async (contactId) => {
    const q = `SELECT id, ringcentralextensionabr__From_Number, ringcentralextensionabr__To_Number, ringcentralextensionabr__Message, ringcentralextensionabr__Message_Source, ringcentralextensionabr__Has_Attachment, ringcentralextensionabr__Contact, Created_Time FROM ringcentralextensionabr__RingCentral_SMS_History WHERE ringcentralextensionabr__Contact = '${contactId}' ORDER BY Created_Time DESC LIMIT 200`;
    for (const r of await coql(q)) {
      const row = r as Record<string, unknown>;
      if (seenIds.has(row.id as string)) return;
      seenIds.add(row.id as string);
      results.push({
        id: row.id as string,
        fromNumber: (row.ringcentralextensionabr__From_Number as string) ?? "",
        toNumber: (row.ringcentralextensionabr__To_Number as string) ?? "",
        message: (row.ringcentralextensionabr__Message as string) ?? "",
        messageType: "SMS",
        channel: (row.ringcentralextensionabr__Message_Source as string) ?? "RingCentral",
        createdTime: row.Created_Time as string,
      });
    }
  }));

  return results.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
}

// ─── Calls ───────────────────────────────────────────────────────────────────

export interface CallRecord {
  id: string;
  subject: string;
  callType: string;
  callPurpose?: string;
  callResult?: string;
  startTime: string;
  durationSeconds?: number;
  duration?: string;
  description?: string;
  contactName?: string;
  dialledNumber?: string;
  callerId?: string;
  outgoingStatus?: string;
  summary?: string;
  ringcentralCallId?: string;
}

// From_Number__s and To_Number__s are not accessible via COQL with current OAuth scopes
export async function getCallHistory(contactIds: string[], phone: string): Promise<CallRecord[]> {
  void phone;
  const seenIds = new Set<string>();
  const results: CallRecord[] = [];

  // Fan out across all contact IDs — Who_Id is polymorphic, parallel queries are safer than `in`
  await Promise.all(contactIds.map(async (contactId) => {
    const q = `SELECT id, Subject, Call_Type, Call_Purpose, Call_Result, Call_Start_Time, Call_Duration, Call_Duration_in_seconds, Description, Who_Id, Dialled_Number, Caller_ID, Outgoing_Call_Status, Call_Summary, RingCentral_Call_ID FROM Calls WHERE Who_Id = '${contactId}' AND Outgoing_Call_Status != 'Overdue' ORDER BY Call_Start_Time DESC LIMIT 200`;
    for (const r of await coql(q)) {
      const row = r as Record<string, unknown>;
      if (seenIds.has(row.id as string)) return;
      // Skip calls with no logged duration or too short to be real
      if (row.Call_Duration_in_seconds === null || row.Call_Duration_in_seconds === undefined) return;
      if ((row.Call_Duration_in_seconds as number) === 5) return;
      // Skip automation-generated follow-up calls and RingCentral auto-logged duplicates
      const subjectRaw = (row.Subject as string) ?? "";
      if (/\b(followup|follow[\s-]*up|follow|FU)\b/i.test(subjectRaw)) return;
      if (/ringcentral logged call/i.test(subjectRaw)) return;
      seenIds.add(row.id as string);
      const whoId = row.Who_Id as Record<string, unknown> | null;
      results.push({
        id: row.id as string,
        subject: (row.Subject as string) ?? "",
        callType: (row.Call_Type as string) ?? "",
        callPurpose: (row.Call_Purpose as string) ?? undefined,
        callResult: (row.Call_Result as string) ?? undefined,
        startTime: (row.Call_Start_Time as string) ?? "",
        durationSeconds: (row.Call_Duration_in_seconds as number) ?? undefined,
        duration: (row.Call_Duration as string) ?? undefined,
        description: (row.Description as string) ?? undefined,
        contactName: whoId ? (whoId.name as string) : undefined,
        dialledNumber: (row.Dialled_Number as string) ?? undefined,
        callerId: (row.Caller_ID as string) ?? undefined,
        outgoingStatus: (row.Outgoing_Call_Status as string) ?? undefined,
        summary: (row.Call_Summary as string) ?? undefined,
        ringcentralCallId: (row.RingCentral_Call_ID as string) ?? undefined,
      });
    }
  }));

  return results.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
}

// ─── Deals / Transactions ────────────────────────────────────────────────────

export interface DealRecord {
  id: string;
  dealName: string;
  stage: string;
  amount?: number;
  closingDate?: string;
  createdTime: string;
  owner?: string;
  accountName?: string;
}

export async function getDeals(contactIds: string[]): Promise<DealRecord[]> {
  const seen = new Set<string>();
  const all: DealRecord[] = [];
  await Promise.all(contactIds.map(async (contactId) => {
    const q = `SELECT id, Deal_Name, Stage, Amount, Closing_Date, Created_Time, Owner FROM Deals WHERE Contact_Name = '${contactId}' ORDER BY Created_Time DESC LIMIT 100`;
    for (const r of await coql(q)) {
      const d = r as Record<string, unknown>;
      if (seen.has(d.id as string)) return;
      seen.add(d.id as string);
      const owner = d.Owner as Record<string, unknown> | null;
      all.push({
        id: d.id as string,
        dealName: (d.Deal_Name as string) ?? "",
        stage: (d.Stage as string) ?? "",
        amount: (d.Amount as number) ?? undefined,
        closingDate: (d.Closing_Date as string) ?? undefined,
        createdTime: d.Created_Time as string,
        owner: owner ? (owner.name as string) ?? undefined : undefined,
      });
    }
  }));
  return all.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
}

// ─── Account info ─────────────────────────────────────────────────────────────

export interface AccountRecord {
  id: string;
  accountName: string;
  phone?: string;
  website?: string;
  industry?: string;
  owner?: string;
  description?: string;
  createdTime?: string;
}

export async function getAccountById(accountId: string): Promise<AccountRecord | null> {
  try {
    const raw = (await zohoGet(
      `/crm/v7/Accounts/${accountId}?fields=Account_Name,Phone,Website,Industry,Owner,Description,Created_Time`
    )) as { data?: Record<string, unknown>[] };
    const a = raw.data?.[0];
    if (!a) return null;
    const owner = a.Owner as Record<string, unknown> | null;
    return {
      id: a.id as string,
      accountName: (a.Account_Name as string) ?? "",
      phone: (a.Phone as string) ?? undefined,
      website: (a.Website as string) ?? undefined,
      industry: (a.Industry as string) ?? undefined,
      owner: owner ? (owner.name as string) : undefined,
      description: (a.Description as string) ?? undefined,
      createdTime: (a.Created_Time as string) ?? undefined,
    };
  } catch {
    return null;
  }
}

// ─── Webform / Consent summary (derived from contact fields) ──────────────────

export interface WebformData {
  leadSource?: string;
  dataSource?: string;
  campaignName?: string;
  adGroupName?: string;
  adsCreativeName?: string;
  gclid?: string;
  facebookLeadId?: string;
  facebookClickId?: string;
  socialLeadId?: string;
  zcampaignId?: string;
  // consent
  medullaryThyroidCancerConsent?: string;
  assistedOrder?: string;
  emailOptOut?: boolean;
  // contact method preference
  bestContactTime?: string;
}

export async function getWebformData(contactId: string): Promise<WebformData | null> {
  // Use REST API to get all fields (COQL blocks Account_Name lookup which causes module-level NO_PERMISSION)
  const fields = [
    "id", "Lead_Source", "Data_Source", "Campaign_Name", "AdGroup_Name",
    "Ads_Creative_Name", "GCLID", "Facebook_Lead_ID", "Facebook_Click_ID",
    "leadchain0__Social_Lead_ID", "ZCAMPAIGNID", "Email_Opt_Out",
    "Medullary_thyroid_cancer_or_a_history_of_such",
    "Did_anyone_assist_with_the_order", "Best_Contact_Time",
  ].join(",");
  const raw = await zohoGet(`/crm/v7/Contacts/${contactId}?fields=${fields}`) as { data?: Record<string, unknown>[] };
  const rows = raw.data ?? [];
  if (rows.length === 0) return null;
  const c = rows[0] as Record<string, unknown>;
  return {
    leadSource: (c.Lead_Source as string) ?? undefined,
    dataSource: (c.Data_Source as string) ?? undefined,
    campaignName: (c.Campaign_Name as string) ?? undefined,
    adGroupName: (c.AdGroup_Name as string) ?? undefined,
    adsCreativeName: (c.Ads_Creative_Name as string) ?? undefined,
    gclid: (c.GCLID as string) ?? undefined,
    facebookLeadId: (c.Facebook_Lead_ID as string) ?? undefined,
    facebookClickId: (c.Facebook_Click_ID as string) ?? undefined,
    socialLeadId: (c["leadchain0__Social_Lead_ID"] as string) ?? undefined,
    zcampaignId: (c.ZCAMPAIGNID as string) ?? undefined,
    emailOptOut: (c.Email_Opt_Out as boolean) ?? undefined,
    medullaryThyroidCancerConsent:
      (c.Medullary_thyroid_cancer_or_a_history_of_such as string) ?? undefined,
    assistedOrder: (c.Did_anyone_assist_with_the_order as string) ?? undefined,
    bestContactTime: (c.Best_Contact_Time as string) ?? undefined,
  };
}
