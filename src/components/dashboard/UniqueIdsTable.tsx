"use client";

import React, { useRef, useEffect } from "react";

type TrajectoryRow = {
  id: number;
  N_frame: number;
  trk_len: number;
  start_frame: number;
  end_frame: number;
};

interface Props {
  data: { objects: TrajectoryRow[] } | null | undefined;
  isLoading?: boolean;
  selectedIds: number[];
  linkedIds: number[];
  onSelectRow: (id: number) => void;
  onClear?: () => void;
}

export default function UniqueIdsTable({
  data,
  isLoading,
  selectedIds,
  linkedIds,
  onSelectRow,
}: Props) {
  const tableData = data?.objects || [];
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  useEffect(() => {
    const lastSelected = selectedIds[selectedIds.length - 1];
    if (lastSelected && rowRefs.current[lastSelected]) {
      rowRefs.current[lastSelected]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedIds]);

  const topIds = [...selectedIds, ...linkedIds.filter(id => !selectedIds.includes(id))];

  return (
    <div className="flex flex-col h-full">
      {/* Selected & suggested IDs summary */}
      <div className="mb-3 border rounded overflow-hidden">
        <div className="bg-gray-100 px-2 py-1 border-b flex justify-between items-center">
          <span className="text-xs font-semibold">Selected & Suggested IDs</span>
        </div>
        <div className="max-h-[120px] overflow-y-auto">
          <table className="w-full text-xs border-collapse table-auto">
            <tbody>
              {topIds.length === 0 ? (
                <tr>
                  <td className="p-2 text-center text-gray-400 border">No selection</td>
                </tr>
              ) : (
                topIds.map(id => (
                  <tr
                    key={id}
                    className={`cursor-pointer ${
                      selectedIds[0] === id ? "bg-green-200" : selectedIds[1] === id ? "bg-blue-200" : "bg-yellow-200"
                    }`}
                    onClick={() => onSelectRow(id)}
                  >
                    <td className="border px-3 py-2 text-left whitespace-nowrap">ID: {id}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main table */}
      <div className="border rounded overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="bg-gray-200 sticky top-0">
          <table className="w-full text-xs border-collapse table-auto">
            <thead>
              <tr>
                <th className="border px-3 py-2 text-center whitespace-nowrap">ID</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Frames</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Len</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">Start</th>
                <th className="border px-3 py-2 text-center whitespace-nowrap">End</th>
              </tr>
            </thead>
          </table>
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <p className="text-center py-3">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse table-auto">
                <tbody>
                  {tableData.map(row => (
                    <tr
                      key={row.id}
                      ref={el => { rowRefs.current[row.id] = el; }}
                      className={`cursor-pointer ${
                        selectedIds[0] === row.id ? "bg-green-200" :
                        selectedIds[1] === row.id ? "bg-blue-200" :
                        linkedIds.includes(row.id) ? "bg-yellow-200" :
                        "hover:bg-blue-100"
                      }`}
                      onClick={() => onSelectRow(row.id)}
                    >
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{row.id}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{row.N_frame}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{row.trk_len}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{row.start_frame}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{row.end_frame}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}