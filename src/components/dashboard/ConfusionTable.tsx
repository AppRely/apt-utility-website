"use client";

import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type SortKey = "frame_no" | "current_object_id" | "nearby_object_count" |
  "nearby_object_ids" | "confusion_score";

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "frame_no", label: "Frame" },
  { key: "current_object_id", label: "Obj ID" },
  { key: "nearby_object_count", label: "Nearby Count" },
  { key: "nearby_object_ids", label: "Nearby IDs" },
  { key: "confusion_score", label: "Confusion" },
];

interface Props {
  rows: any[];
  loading: boolean;
  message?: string;
  onRowClick: (frame: number) => void;
}

export default function ConfusionTable({ rows, loading, message, onRowClick,}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" } | null>(null);
  const [filters, setFilters] = useState<Partial<Record<SortKey, string>>>({});

  const formatNearbyIds = (ids: number[] | undefined) => {
    if (!ids?.length) return "—";
    return ids.join(", ");
  };

  const getValue = (row: any, key: SortKey): number | string | null => {
    if (key === "nearby_object_ids") return row.nearby_object_ids?.join(", ") ?? "";
    return row[key] ?? null;
  };

  const visibleRows = useMemo(() => {
    const filtered = rows.filter(row => columns.every(({ key }) => {
      const filter = filters[key]?.trim().toLowerCase();
      if (!filter) return true;
      if (key === "nearby_object_ids") {
        return row.nearby_object_ids?.some((id: number) => String(id) === filter) ?? false;
      }
      const value = getValue(row, key);
      if (typeof value === "number") {
        const numericFilter = Number(filter);
        return Number.isFinite(numericFilter) && value === numericFilter;
      }
      return String(value ?? "").toLowerCase().includes(filter);
    }));
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const aValue = getValue(a, sort.key);
      const bValue = getValue(b, sort.key);
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      const comparison = typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [rows, filters, sort]);

  const toggleSort = (key: SortKey) => {
    setSort(current => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center border rounded">
        Loading...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center border rounded text-gray-500 text-lg">
        {message || "No data available"}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto border rounded">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky top-0 bg-gray-200 z-20 border px-3 py-2 text-center">#</th>
            {columns.map(column => (
              <th key={column.key} className="sticky top-0 bg-gray-200 z-20 border px-3 py-2 text-center whitespace-nowrap">
                <button type="button" onClick={() => toggleSort(column.key)} className="flex w-full items-center justify-center gap-1 font-semibold hover:text-blue-700">
                  <span>{column.label}</span>
                  {sort?.key === column.key
                    ? sort.direction === "asc"
                      ? <ArrowUp className="h-3 w-3" aria-hidden="true" />
                      : <ArrowDown className="h-3 w-3" aria-hidden="true" />
                    : <ArrowUpDown className="h-3 w-3 text-gray-500" aria-hidden="true" />}
                </button>
              </th>
            ))}
          </tr>
          <tr>
            <th className="sticky top-9 z-20 border bg-gray-100 px-1 py-1 text-[10px] font-normal text-gray-500">—</th>
            {columns.map(column => (
              <th key={column.key} className="sticky top-9 z-20 border bg-gray-100 px-1 py-1">
                <input
                  value={filters[column.key] ?? ""}
                  onChange={(event) => setFilters(current => ({ ...current, [column.key]: event.target.value }))}
                  placeholder="Filter"
                  aria-label={`Filter ${column.label}`}
                  className="h-6 w-full min-w-[70px] rounded border border-gray-300 bg-white px-1 text-[10px] font-normal"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="border px-3 py-4 text-center text-gray-500">No matching rows</td>
            </tr>
          ) : visibleRows.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick(row.frame_no)}
              className="cursor-pointer hover:bg-gray-50"
            >
              <td className="border px-3 py-2 text-center">{idx + 1}</td>
              <td className="border px-3 py-2 text-center font-mono">{row.frame_no}</td>
              <td className="border px-3 py-2 text-center">{row.current_object_id ?? "—"}</td>
              <td className="border px-3 py-2 text-center">
                {row.nearby_object_count ?? "—"}</td>
              <td
                className="border px-3 py-2 text-center"
                title={row.nearby_object_ids?.join(", ")}
              >
                {formatNearbyIds(row.nearby_object_ids)}
              </td>
              <td className="border px-3 py-2 text-center">
                {row.confusion_score?.toFixed(4) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
