"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import UniqueIdsTable from "@/components/dashboard/UniqueIdsTable";
import { getUniqueIds } from "@/lib/api/getTrajectoryTable";

export default function UniqueIdsPopup() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const [data, setData] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [linkedIds, setLinkedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    getUniqueIds(Number(projectId))
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [projectId]);

  const handleSelectRow = (id: number) => {
    let newSelected = [...selectedIds];
    if (newSelected.includes(id)) {
      newSelected = newSelected.filter(x => x !== id);
    } else if (newSelected.length < 2) {
      newSelected.push(id);
    } else {
      newSelected = [newSelected[0], id];
    }
    setSelectedIds(newSelected);

    const base = data?.objects?.find((r: any) => r.object_id === newSelected[0]);
    if (base) {
      const startRange = base.end_frame + 1;
      const endRange = base.end_frame + 3;
      const matched = (data?.objects || [])
        .filter((r: any) => r.start_frame >= startRange && r.start_frame <= endRange)
        .map((r: any) => r.object_id);
      setLinkedIds(matched);
    } else {
      setLinkedIds([]);
    }

    // Communicate back to main window
   const row = data?.objects?.find((r: any) => r.object_id === id);
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({type: "UNIQUE_SELECT", id, frame: row?.end_frame, }, "*" );}
  };

  return (
    <div className="p-4 h-screen flex flex-col bg-gray-50">
      <Card className="flex-1 flex flex-col overflow-hidden p-4">
        <h2 className="text-lg font-bold mb-2">Linking Table</h2>
        <UniqueIdsTable
          data={data}
          isLoading={loading}
          selectedIds={selectedIds}
          linkedIds={linkedIds}
          onSelectRow={handleSelectRow}
        />
      </Card>
    </div>
  );
}