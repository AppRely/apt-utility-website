"use client";

import React, { useRef, useEffect } from "react";

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

  const formatNumber = (val: number | null | undefined, digits: number = 4) => {
    if (val === null || val === undefined) return "-";
    return val.toFixed(digits);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Main table */}
      <div className="border rounded overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-y-auto flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse table-auto min-w-[800px]">
              <thead className="sticky top-0 z-10 bg-gray-200">
                <tr>
                  <th className="border px-3 py-2 text-center whitespace-nowrap bg-gray-200">ID</th>
                  <th className="border px-3 py-2 text-center whitespace-nowrap bg-gray-200">Frames</th>
                  <th className="border px-3 py-2 text-center whitespace-nowrap bg-gray-200">Start</th>
                  <th className="border px-3 py-2 text-center whitespace-nowrap bg-gray-200">End</th>
                  <th className="border px-3 py-2 text-center whitespace-nowrap bg-gray-200">Best Match ID</th>
                  <th className="border px-3 py-2 text-center whitespace-nowrap bg-gray-200">Best Score</th>
                  <th className="border px-3 py-2 text-center whitespace-nowrap bg-gray-200">Uncertainty</th>
                  <th className="border px-3 py-2 text-center whitespace-nowrap bg-gray-200">2nd Match ID</th>
                  <th className="border px-3 py-2 text-center whitespace-nowrap bg-gray-200">2nd Score</th>
                  <th className="border px-3 py-2 text-center whitespace-nowrap bg-gray-200">Other Matches</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-3">Loading...</td>
                  </tr>
                ) : (
                  tableData.map(row => (
                    <tr
                      key={row.object_id}
                      ref={el => { rowRefs.current[row.object_id] = el; }}
                      className="cursor-pointer hover:bg-blue-50"
                      onClick={() => onSelectRow(row.object_id)}
                    >
                      <td className="border px-3 py-2 text-center whitespace-nowrap font-medium">{row.object_id}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{row.N_frame}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{row.start_frame}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{row.end_frame}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{row.best_match ?? "-"}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{formatNumber(row.best_match_score)}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{formatNumber(row.best_match_uncertainty)}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{row.second_match ?? "-"}</td>
                      <td className="border px-3 py-2 text-center whitespace-nowrap">{formatNumber(row.second_match_score)}</td>
                      <td className="border px-3 py-2 text-left whitespace-nowrap">
                        {row.other_matches && row.other_matches.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {row.other_matches.slice(0, 3).map(m => (
                              <div key={m.object_id} className="whitespace-nowrap">
                                ID {m.object_id}: {formatNumber(m.match_score)} (r{m.rank})
                              </div>
                            ))}
                            {row.other_matches.length > 3 && (
                              <div className="text-gray-500 text-[10px]">+{row.other_matches.length - 3} more</div>
                            )}
                          </div>
                        ) : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}