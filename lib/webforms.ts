import fs from "fs";
import path from "path";
import { normalizePhone } from "./zoho";

export interface FormSubmission {
  formName: string;
  submissionId: string;
  createdAt: string;
  // Contact info
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  // Home form fields
  bestDateForCall?: string;
  bestTimeForCall?: string;
  preferredLanguage?: string;
  zipCode?: string;
  consentChecked?: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  fbclid?: string;
  submittedUrl?: string;
  // Patient support fields
  procedure?: string;
  clinicLocation?: string;
  requestType?: string;
  requestDescription?: string;
  // Sales coordinator fields
  yearsExperience?: string;
  locationOfInterest?: string;
  otherLanguages?: string;
}

// phone (10-digit normalized) → submissions
type PhoneIndex = Map<string, FormSubmission[]>;

let _index: PhoneIndex | null = null;

function parseCSV(content: string): Record<string, string>[] {
  // Strip BOM
  const text = content.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let field = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ",") i++;
    } else {
      // Unquoted field
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function str(v: string | undefined): string | undefined {
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function buildIndex(): PhoneIndex {
  const index: PhoneIndex = new Map();
  const dir = path.join(process.cwd(), "data", "webforms");

  if (!fs.existsSync(dir)) return index;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".csv")) continue;
    const content = fs.readFileSync(path.join(dir, file), "utf-8");
    const rows = parseCSV(content);

    for (const row of rows) {
      const submission = extractSubmission(row);
      if (!submission) continue;

      const rawPhone =
        row["Phone"] ??
        row["Phone Number"] ??
        row["What's your phone number?"] ??
        "";

      if (!rawPhone.trim()) continue;

      // Skip clearly invalid/placeholder phones
      if (rawPhone.replace(/\D/g, "").length < 7) continue;

      const normalized = normalizePhone(rawPhone);
      if (normalized.length < 7) continue;

      // Index by last 10 digits for matching
      const key = normalized.slice(-10);
      if (!index.has(key)) index.set(key, []);
      index.get(key)!.push(submission);
    }
  }

  // Sort each entry newest first
  for (const [, subs] of index) {
    subs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return index;
}

function extractSubmission(row: Record<string, string>): FormSubmission | null {
  const formName =
    str(row["Form Name (ID)"]) ?? str(row["Form Name"]) ?? "Unknown Form";
  const submissionId = str(row["Submission ID"]) ?? "";
  const createdAt = str(row["Created At"]) ?? "";

  // New Form has no phone — skip it
  if (formName.startsWith("New Form")) return null;

  // Home form variants
  const isHomeForm = formName.startsWith("Home Form");
  if (isHomeForm) {
    return {
      formName,
      submissionId,
      createdAt,
      firstName: str(row["First Name "]) ?? str(row["First Name"]),
      lastName: str(row["Last Name"]),
      email: str(row["Email"]),
      phone: str(row["Phone"]),
      bestDateForCall: str(row["Best Date For Call"]),
      bestTimeForCall: str(row["Best Time For Call"]),
      preferredLanguage: str(row["Preferred Language"]),
      zipCode: str(row["Zip Code"]),
      consentChecked: row[""] === "on" || undefined,
      utmSource: str(row["utm_source"]),
      utmMedium: str(row["utm_medium"]),
      utmCampaign: str(row["utm_campaign"]),
      utmContent: str(row["utm_content"]),
      utmTerm: str(row["utm_term"]),
      gclid: str(row["gclid"]),
      fbclid: str(row["fbclid"]),
      submittedUrl: str(row["URL"]),
    };
  }

  // Patient support form
  if (formName.startsWith("Patient Support")) {
    return {
      formName,
      submissionId,
      createdAt,
      fullName: str(row["Full Name"]),
      email: str(row["Email"]),
      phone: str(row["Phone Number"]),
      procedure: str(row["Procedure/Date"]),
      clinicLocation: str(row["Clinic Location"]),
      requestType: str(row["Your Request Type"]),
      requestDescription: str(row["Describe Your Request"]),
    };
  }

  // Sales Coordinators form
  if (formName.startsWith("Sales Coordinators")) {
    return {
      formName,
      submissionId,
      createdAt,
      fullName: str(row["What's your full name?"]),
      email: str(row["What's your email?"]),
      phone: str(row["What's your phone number?"]),
      yearsExperience: str(row["How many years of sales experience do you have?"]),
      locationOfInterest: str(row["Please choose your location of interest"]),
      otherLanguages: str(row["What other languages do you speak (besides English)?"]),
    };
  }

  return null;
}

export function getWebformSubmissions(phone: string): FormSubmission[] {
  if (!_index) _index = buildIndex();
  const key = normalizePhone(phone).slice(-10);
  return _index.get(key) ?? [];
}

export function getWebformIndexStats(): { total: number; phones: number } {
  if (!_index) _index = buildIndex();
  let total = 0;
  for (const [, subs] of _index) total += subs.length;
  return { total, phones: _index.size };
}
