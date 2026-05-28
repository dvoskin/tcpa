import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/zoho";

// POST: accept CSV body, return normalized list
export async function POST(req: NextRequest) {
  const text = await req.text();
  const lines = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const phones: string[] = [];
  for (const line of lines) {
    // CSV may have multiple columns — grab everything that looks like a phone
    const cells = line.split(",");
    for (const cell of cells) {
      const stripped = cell.replace(/^["']|["']$/g, "").trim();
      const digits = stripped.replace(/\D/g, "");
      if (digits.length >= 10) {
        phones.push(normalizePhone(stripped));
        break; // take first phone-like value per row
      }
    }
  }

  const unique = [...new Set(phones)];
  return NextResponse.json({ phones: unique });
}
