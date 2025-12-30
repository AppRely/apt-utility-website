"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { getActivityLogs } from "@/lib/api/getActivityLogs";
import { getProjectList } from "@/lib/api/getProjectList";
import AuditModal from "@/components/annotation/AuditModal";
import CreateProjectModal from "@/components/annotation/CreateProjectModal";

export default function AnnotationLandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditProjectId, setauditProjectId] = useState<number | null>(null);

  const router = useRouter();

  // Fetch project list
  const { data, isLoading, isError } = useQuery({
    queryKey: ["project-list"],
    queryFn: getProjectList,
  });

  // Format backend array
  // const projects = data || [];
  // //const projects = data?.data || [];

  

  // // Filter using project_status
  // const inProgress = projects.filter(
  //   (p: any) => p.project_status.toLowerCase() === "inprogress"
  // );

  const projects = Array.isArray(data?.data) ? data.data : 
                  Array.isArray(data) ? data : [];

  // ✅ SAFE: Only filter if projects is array (always true now)
  const inProgress = projects.filter(
    (p: any) => p.project_status?.toLowerCase() === "inprogress"
  );

  const completed = projects.filter(
    (p: any) => p.project_status.toLowerCase() === "completed"
  );

  const getStatusBadge = (status: string) => {
    if (status === "inprogress")
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
          In Progress
        </Badge>
      );

    if (status === "completed")
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
          Completed
        </Badge>
      );

    return (
      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
        Archived
      </Badge>
    );
  };

  // TABLE WITH TOGGLE (to hide Mark as Complete in Completed tab)
  const renderTable = (rows: any[], isCompleted: boolean) => (
    <Table>
      <TableHeader className="bg-[#3B3B3B] text-white hover:bg-[#3B3B3B]">
        <TableRow className="hover:bg-[#3B3B3B]">
          <TableHead className="text-white text-center">Sr No.</TableHead>
          <TableHead className="text-white text-center">Project Name</TableHead>
          <TableHead className="text-white text-center">Video File</TableHead>
          <TableHead className="text-white text-center">TRK File</TableHead>
          <TableHead className="text-white text-center">Date</TableHead>
          <TableHead className="text-white text-center">Status</TableHead>
          <TableHead className="text-white">Action</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((p, index) => (
          <TableRow key={p.project_id}>
            <TableCell>{String(index + 1).padStart(2, "0")}</TableCell>
            <TableCell>{p.project_name}</TableCell>
            <TableCell>{p.video_name}</TableCell>
            <TableCell>{p.trk_file_name}</TableCell>
            <TableCell>{p.created_at.split("T")[0]}</TableCell>
            <TableCell>
              {getStatusBadge(p.project_status.toLowerCase())}
            </TableCell>

            {/* ACTION BUTTONS */}
            <TableCell className="flex gap-2">
              {/* Hide "Mark as Complete" in Completed tab */}
              {/* {!isCompleted && (
                <Button
                  size="sm"
                  className="bg-green-100 text-green-700 hover:bg-green-100">
                  Mark as Complete
                </Button>
              )} */}

              {/* <Button
                size="sm"
                className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                Archived
              </Button> */}

              <Button
                size="sm"
                className="bg-purple-100 text-purple-700 hover:bg-purple-100"
                onClick={() => {
                  sessionStorage.setItem("projectId", p.project_id);
                  sessionStorage.setItem("project_name", p.project_name);
                  sessionStorage.setItem("video_name", p.video_name);
                  sessionStorage.setItem("videoPath", p.video_path);
                  sessionStorage.setItem("trk_file_name", p.trk_file_name);
                  sessionStorage.setItem("frameId", "0");
                  sessionStorage.setItem("fps", "30");
                  router.push("/dashboard");
                }}>
                Edit
              </Button>
              <Button
                size="sm"
                className="bg-blue-100 text-blue-700 hover:bg-blue-200"
                onClick={() => {
                  setAuditOpen(true);
                  setauditProjectId(p.project_id);
                }}>
                Audit
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F9FB] font-sans">
      {/* HEADER */}
      <header className="flex justify-between items-center bg-white h-16 px-7 py-9 shadow-sm">
        <div className="bg-[#D9D9D9] text-white text-[16px] font-medium px-8 py-[11px] leading-[21px]">
          Logo
        </div>

        <div className="flex items-center gap-2">
          <Avatar className="w-[34px] h-[34px]">
            <AvatarFallback className="bg-[#F3B56E] text-white text-[16px] font-medium leading-[12px]">
              M
            </AvatarFallback>
          </Avatar>

          <Image
            src="/images/downArrow.svg"
            alt="Down Arrow"
            width={13}
            height={7}
            className="opacity-80"
          />
        </div>
      </header>

      {/* LANDING CONTENT */}
      <main className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="text-[24px] font-bold text-black py-4">
          APT TRACKING SYSTEM
        </h1>

        <Image
          src="/images/landingPageIcon.svg"
          alt="Annotation Icon"
          width={125}
          height={125}
        />

        <p className="text-[#7B7B7B] text-[24px] font-normal pt-2 pb-3">
          To get started with your annotation project
        </p>

        <Button
          size={null}
          onClick={() => setModalOpen(true)}
          className="bg-[#3B46A0] hover:bg-[#3B46A0] text-[20px] font-normal px-7 py-[11px]">
          <Image
            src="/images/create.svg"
            alt="Create Icon"
            width={18}
            height={18}
          />
          Create a new Project
        </Button>

        {/* TABS + TABLE BOX */}
        <section className="w-[85%] mx-auto bg-white shadow rounded-md p-10 mb-5 mt-14">
          <Tabs defaultValue="inprogress" className="w-full">
            <TabsList className="grid grid-cols-2 w-1/3 mx-auto mb-4 bg-gray-100">
              <TabsTrigger value="inprogress">In Progress</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>

            {/* IN PROGRESS TAB */}
            <TabsContent value="inprogress">
              {renderTable(inProgress, false)}
            </TabsContent>

            {/* COMPLETED TAB */}
            <TabsContent value="completed">
              {renderTable(completed, true)}
            </TabsContent>
          </Tabs>
        </section>
      </main>

      {/* MODAL */}
      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
      {auditOpen && (
        <AuditModal
          open={auditOpen}
          onClose={() => setAuditOpen(false)}
          projectId={Number(auditProjectId)}
        />
      )}
    </div>
  );
}
