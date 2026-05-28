"use client";
import { useState } from "react";
import PhoneList from "./components/PhoneList";
import ContactDetail from "./components/ContactDetail";
import { PHONE_LIST } from "@/lib/phones";

export default function Home() {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shrink-0">
        <h1 className="text-sm font-semibold text-gray-800">TCPA Dashboard</h1>
        <span className="text-xs text-gray-400">{PHONE_LIST.length} numbers</span>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <PhoneList
            phones={PHONE_LIST}
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
