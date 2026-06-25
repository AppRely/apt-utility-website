"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import ConfusionTable from "@/components/dashboard/ConfusionTable";
import { getConfusionTable } from "@/lib/api/getConfusionTable";
import { getConfusionStatus } from "@/lib/api/getConfusionStatus";

export default function ConfusionPopup() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!projectId) return;
    let intervalId: NodeJS.Timeout;
    const fetchTable = async () => {
      try {
        const res = await getConfusionTable(Number(projectId));

        if (res.status === "success") {
          setRows(res.data.rows || []);
          setMessage("");
        } else if (res.status === "processing") {
          setRows([]);
          setMessage(res.message);
        } else {
          setRows([]);
          setMessage("No data available.");
        }
      } catch (err) {
        console.error(err);
        setRows([]);
        setMessage("Failed to load confusion table.");
      } finally {
        setLoading(false);
      }
    };

    const checkStatus = async () => {
      try {
        const statusRes = await getConfusionStatus(Number(projectId));

        console.log("Status Response:", statusRes);

        switch (statusRes.confusion_status) {
          case "COMPLETED":
            clearInterval(intervalId);
            await fetchTable();
            break;

          case "FAILED":
            clearInterval(intervalId);
            setLoading(false);
            setMessage("Confusion calculation failed.");
            break;

          case "PROCESSING":
          default:
            setLoading(false);
            setRows([]);
            setMessage("Confusion calculation is in progress...");
            break;
        }
      } catch (err) {
        console.error(err);
        clearInterval(intervalId);
        setLoading(false);
        setMessage("Unable to check confusion status.");
      }
    };

    // Initial status check
    checkStatus();
    // Poll every 3 seconds
    intervalId = setInterval(checkStatus, 3000);

    return () => clearInterval(intervalId);
  }, [projectId]);

  const handleRowClick = (frame: number) => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "CONFUSION_JUMP", frame }, "*");
    }
  };

  return (
    <div className="h-screen bg-gray-50 p-4">
      <Card className="h-full flex flex-col p-4">
        <h2 className="text-xl font-semibold mb-4">Confusion Table</h2>
        <div className="flex-1 min-h-0"><ConfusionTable rows={rows} loading={loading} message={message} onRowClick={handleRowClick}/> </div>
      </Card>
    </div>
  );
}