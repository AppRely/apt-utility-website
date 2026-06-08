"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import ConfusionTable from "@/components/dashboard/ConfusionTable";
import { getConfusionTable } from "@/lib/api/getConfusionTable";

export default function ConfusionPopup() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    getConfusionTable(Number(projectId))
      .then(res => {
        setRows(res.data.rows || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [projectId]);

  const handleRowClick = (frame: number) => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "CONFUSION_JUMP", frame }, "*");
    }
  };

  return (
    <div className="p-4 h-screen flex flex-col bg-gray-50">
      <Card className="flex-1 flex flex-col overflow-hidden p-4">
        <h2 className="text-lg font-bold mb-2">Object Matching Uncertainty (Popout)</h2>
        <ConfusionTable rows={rows} loading={loading} onRowClick={handleRowClick} />
      </Card>
    </div>
  );
}