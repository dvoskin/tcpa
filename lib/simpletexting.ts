const ST_BASE = "https://api-app2.simpletexting.com/v2/api";

interface STMessage {
  id: string;
  text: string | null;
  contactPhone: string;
  accountPhone: string;
  directionType: "MT" | "MO";
  timestamp: string;
  referenceType: string | null;
  category: string;
  mediaItems: unknown[] | null;
}

interface STPage {
  content: STMessage[];
  totalPages: number;
  totalElements: number;
}

export interface SimpleTextingRecord {
  id: string;
  fromNumber: string;
  toNumber: string;
  message: string;
  messageType: string;
  channel: "SimpleTexting";
  directionType: "MT" | "MO";
  referenceType: string | null;
  createdTime: string;
  media?: string[];
}

export async function getSimpleTextingMessages(tenDigitPhone: string): Promise<SimpleTextingRecord[]> {
  const key = process.env.SIMPLE_TEXTING_API_KEY;
  if (!key) return [];

  const all: STMessage[] = [];
  const size = 200;

  for (let page = 0; page <= 10; page++) {
    let data: STPage;
    try {
      const res = await fetch(
        `${ST_BASE}/messages?contactPhone=${tenDigitPhone}&size=${size}&page=${page}`,
        { headers: { Authorization: `Bearer ${key}` } }
      );
      if (!res.ok) break;
      const text = await res.text();
      if (!text) break;
      data = JSON.parse(text) as STPage;
    } catch {
      break;
    }

    if (!data.content?.length) break;
    all.push(...data.content);
    if (page >= data.totalPages - 1) break;
  }

  return all.map((m) => ({
    id: `st_${m.id}`,
    fromNumber: m.directionType === "MT" ? m.accountPhone : m.contactPhone,
    toNumber: m.directionType === "MT" ? m.contactPhone : m.accountPhone,
    message: m.text ?? "",
    messageType: m.category === "EXTENDED_SMS" ? "MMS" : "SMS",
    channel: "SimpleTexting" as const,
    directionType: m.directionType,
    referenceType: m.referenceType,
    createdTime: m.timestamp,
    ...(m.mediaItems?.length ? { media: m.mediaItems as string[] } : {}),
  }));
}
