"use client";

import React, { useRef, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type TrajectoryRow = {
  object_id: number;
  N_frame: number;
  trk_len: number;
  start_frame: number;
  end_frame: number;
  start_coordinate?: [number, number];
  end_coordinate?: [number, number];
  best_match: number | null;
  best_match_score: number | null;
  best_match_uncertainty: number | null;
  second_match: number | null;
  second_match_score: number | null;
  other_matches: {
    object_id: number;
    match_score: number;
    rank: number;
  }[];
};

type SortKey = "object_id" | "N_frame" | "start_frame" | "end_frame" |
  "best_match" | "best_match_score" | "best_match_uncertainty" |
  "second_match" | "second_match_score" | "other_matches";

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "object_id", label: "ID" },
  { key: "N_frame", label: "Frames" },
  { key: "start_frame", label: "Start" },
  { key: "end_frame", label: "End" },
  { key: "best_match", label: "Best Match ID" },
  { key: "best_match_score", label: "Best Score" },
  { key: "best_match_uncertainty", label: "Uncertainty" },
  { key: "second_match", label: "2nd Match ID" },
  { key: "second_match_score", label: "2nd Score" },
  { key: "other_matches", label: "Other Matches" },
];

interface Props {
  data: { objects: TrajectoryRow[] } | null | undefined;
  isLoading?: boolean;
  selectedIds: number[];
  linkedIds: number[];
  highlightedId: number | null;
  onSelectRow: (id: number) => void;
  onClear?: () => void;
}

export default function UniqueIdsTable({
  data,
  isLoading,
  selectedIds,
  linkedIds,
  highlightedId,
  onSelectRow,
}: Props) {
  const tableData = data?.objects || [];
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" } | null>(null);
  const [filters, setFilters] = useState<Partial<Record<SortKey, string>>>({});

  useEffect(() => {
    const lastSelected = selectedIds[selectedIds.length - 1];
    if (lastSelected && rowRefs.current[lastSelected]) {
      rowRefs.current[lastSelected]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedIds]);

  const formatNumber = (val: number | null | undefined, digits: number = 4) => {
    if (val === null || val === undefined) return "-";
    return val.toFixed(digits);
  };

  const getValue = (row: TrajectoryRow, key: SortKey): number | string | null => {
    if (key === "other_matches") {
      return row.other_matches?.map(match => `${match.object_id} ${match.match_score} ${match.rank}`).join(" ") ?? "";
    }
    return row[key] as number | null;
  };

  const visibleRows = useMemo(() => {
    const filtered = tableData.filter(row => columns.every(({ key }) => {
      const filter = filters[key]?.trim().toLowerCase();
      if (!filter) return true;
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
  }, [tableData, filters, sort]);

  const toggleSort = (key: SortKey) => {
    setSort(current => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-auto border rounded">
        <table className="w-full min-w-[800px] border-collapse text-xs table-auto">
          <thead>
            <tr>
              {columns.map(column => (
                <th key={column.key} className="sticky top-0 z-20 bg-gray-200 border px-3 py-2 text-center whitespace-nowrap">
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
              {columns.map(column => (
                <th key={column.key} className="sticky top-8 z-20 border bg-gray-100 px-1 py-1">
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
            {isLoading ? (
              <tr>
                <td colSpan={10} className="py-3 text-center">
                  Loading...
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-3 text-center text-gray-500">No matching rows</td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                    key={row.object_id}
                    ref={(el) => {
                      rowRefs.current[row.object_id] = el;
                    }}
                    onClick={() => onSelectRow(row.object_id)}
                    className={`
                      cursor-pointer
                      transition-all
                      duration-500
                      hover:bg-blue-50
                      ${
                        highlightedId === row.object_id
                          ? "bg-yellow-200 ring-2 ring-yellow-400"
                          : ""
                      }
                    `}
                  >
                  <td className="border px-3 py-2 text-center font-medium whitespace-nowrap">
                    {row.object_id}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {row.N_frame}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {row.start_frame}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {row.end_frame}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {row.best_match ?? "-"}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {formatNumber(row.best_match_score)}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {formatNumber(row.best_match_uncertainty)}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {row.second_match ?? "-"}
                  </td>
                  <td className="border px-3 py-2 text-center whitespace-nowrap">
                    {formatNumber(row.second_match_score)}
                  </td>
                  <td className="border px-3 py-2 text-left">
                    {row.other_matches?.length ? (
                      <div className="flex flex-col gap-0.5">
                        {row.other_matches.slice(0, 3).map((m) => (
                          <div
                            key={m.object_id}
                            className="whitespace-nowrap"
                          >
                            ID {m.object_id}: {formatNumber(m.match_score)} (r{m.rank})
                          </div>
                        ))}
                        {row.other_matches.length > 3 && (
                          <div className="text-[10px] text-gray-500">
                            +{row.other_matches.length - 3} more
                          </div>
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
