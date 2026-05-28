"use client";
import { useState, useCallback } from "react";
import PhoneList from "./components/PhoneList";
import ContactDetail from "./components/ContactDetail";

export default function Home() {
  const [phones, setPhones] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/phones", { method: "POST", body: text });
      const { phones: parsed } = await res.json();
      setPhones(parsed);
      setSelected(null);
      setFilter("");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  if (phones.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Phone Record Consolidator</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Upload a CSV of phone numbers to view CRM, SMS, call, and webform records
          </p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`w-full max-w-md border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50"
          }`}
          onClick={() => document.getElementById("csv-input")?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-blue-600">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
              <p className="text-sm">Parsing CSV…</p>
            </div>
          ) : (
            <>
              <div className="text-4xl mb-3">📂</div>
              <p className="font-medium text-gray-700">Drop your CSV here</p>
              <p className="text-sm text-gray-400 mt-1">or click to browse</p>
              <p className="text-xs text-gray-400 mt-3">
                The file should have one phone number per row (any format)
              </p>
            </>
          )}
          <input
            id="csv-input"
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processFile(file);
            }}
          />
        </div>

        <p className="text-xs text-gray-400">
          Zoho CRM · RingCentral SMS · Call Logs · Webform Consent
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shrink-0">
        <h1 className="text-sm font-semibold text-gray-800">Phone Record Consolidator</h1>
        <span className="text-xs text-gray-400">{phones.length} numbers loaded</span>
        <button
          onClick={() => { setPhones([]); setSelected(null); }}
          className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Clear &amp; upload new CSV
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <PhoneList
            phones={phones}
            selected={selected}
            onSelect={setSelected}
            filter={filter}
            onFilterChange={setFilter}
          />
        </div>

        <div className="flex-1 overflow-hidden">
          {selected ? (
            <ContactDetail phone={selected} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              ← Select a number from the list
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
