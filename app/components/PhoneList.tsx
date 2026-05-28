"use client";

interface Props {
  phones: string[];
  selected: string | null;
  onSelect: (phone: string) => void;
  filter: string;
  onFilterChange: (v: string) => void;
}

function fmt(phone: string) {
  if (phone.length === 10)
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  return phone;
}

export default function PhoneList({ phones, selected, onSelect, filter, onFilterChange }: Props) {
  const visible = phones.filter((p) => p.includes(filter.replace(/\D/g, "")));

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-200">
        <input
          type="text"
          placeholder="Filter numbers…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1.5 text-xs text-gray-400">{visible.length} of {phones.length} numbers</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {visible.map((phone) => (
          <button
            key={phone}
            onClick={() => onSelect(phone)}
            className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 hover:bg-blue-50 transition-colors ${
              selected === phone ? "bg-blue-100 text-blue-800 font-medium" : "text-gray-700"
            }`}
          >
            {fmt(phone)}
          </button>
        ))}
        {visible.length === 0 && (
          <p className="p-4 text-sm text-gray-400 text-center">No numbers match</p>
        )}
      </div>
    </div>
  );
}
