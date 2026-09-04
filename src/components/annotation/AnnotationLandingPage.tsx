"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getProjectList } from "@/lib/api/getProjectList";
import AuditModal from "@/components/annotation/AuditModal";
import CreateProjectModal from "@/components/annotation/CreateProjectModal";
import { deleteProject } from "@/lib/api/deleteProject";
import { exportTrk } from "@/lib/api/exportTrk";
import { getISTDateTimeParts } from "@/lib/utils/formatDateTime";
import { formatFileName } from "@/lib/utils/formatFileName";
import { Loader2, Search } from "lucide-react";
import {
  SYSTEM_GUIDE_STEP_EVENT,
  type SystemGuideStepEventDetail,
} from "@/features/system-guide/events";

export default function AnnotationLandingPage() {
  const pageSize = 5;
  const [modalOpen, setModalOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditProjectId, setAuditProjectId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const [exportProjectId, setExportProjectId] = useState<number | null>(null);
  const [pendingProjects, setPendingProjects] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const projectModalOpenedByGuideRef = useRef(false);
  const auditModalUsedByGuideRef = useRef(false);
  const auditProjectIdRef = useRef<number | null>(null);

  useEffect(() => {
    const handleGuideStep = (event: Event) => {
      const { selector } = (event as CustomEvent<SystemGuideStepEventDetail>).detail;
      const isProjectFormStep = [
        '[data-system-guide="project-form"]',
        '[data-system-guide="project-name"]',
        '[data-system-guide="video-upload"]',
        '[data-system-guide="tracking-upload"]',
        '[data-system-guide="project-submit"]',
      ].includes(selector ?? "");
      const isAuditDialogStep = [
        '[data-system-guide="audit-dialog"]',
        '[data-system-guide="audit-export"]',
        '[data-system-guide="audit-table"]',
      ].includes(selector ?? "");

      if (isProjectFormStep) {
        projectModalOpenedByGuideRef.current = true;
        setModalOpen(true);
      } else if (projectModalOpenedByGuideRef.current) {
        projectModalOpenedByGuideRef.current = false;
        setModalOpen(false);
      }

      if (isAuditDialogStep) {
        if (auditProjectIdRef.current === null) {
          const firstAvailableAuditButton = Array.from(
            document.querySelectorAll<HTMLButtonElement>('[data-system-guide="project-audit"]'),
          ).find((button) => !button.disabled);
          const firstAvailableProjectId = Number(firstAvailableAuditButton?.dataset.projectId);
          if (Number.isFinite(firstAvailableProjectId) && firstAvailableProjectId > 0) {
            auditProjectIdRef.current = firstAvailableProjectId;
          }
        }

        if (auditProjectIdRef.current !== null) {
          setAuditProjectId(auditProjectIdRef.current);
          setAuditOpen(true);
        }
        auditModalUsedByGuideRef.current = true;
      } else if (auditModalUsedByGuideRef.current) {
        auditModalUsedByGuideRef.current = false;
        auditProjectIdRef.current = null;
        setAuditOpen(false);
        setAuditProjectId(null);
      }
    };

    document.addEventListener(SYSTEM_GUIDE_STEP_EVENT, handleGuideStep);
    return () => document.removeEventListener(SYSTEM_GUIDE_STEP_EVENT, handleGuideStep);
  }, []);

  const router = useRouter();
  const { toast } = useToast();

  // Fetch project list
  const { data, isLoading, isError } = useQuery({
    queryKey: ["project-list", page, pageSize],
    queryFn: () => getProjectList(page, pageSize),
  });

  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      toast({
        title: "Project Deleted",
        description: "Project deleted successfully",
        duration: 3000,
        className: "text-red-600",
      });

      queryClient.invalidateQueries({ queryKey: ["project-list"] });
      setDeleteOpen(false);
      setDeleteProjectId(null);
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Something went wrong while deleting the project",
        variant: "destructive",
      });
      setDeleteOpen(false);
      setDeleteProjectId(null);
    },
  });

  const exportMutation = useMutation({
    mutationFn: (projectId: number) => exportTrk(projectId),
    onMutate: (projectId: number) => setExportProjectId(projectId),
    onSuccess: (
      response: { data?: { download_url?: string; trk_version?: string | number } },
      projectId: number,
    ) => {
      const downloadUrl = response?.data?.download_url;
      if (downloadUrl) {
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `project_${projectId}_v${response?.data?.trk_version ?? "latest"}.trk`;
        link.click();
      }
      toast({
        title: "Export completed",
        description: downloadUrl ? "TRK download started." : "TRK export is ready.",
        duration: 3000,
        className: "text-green-600",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    },
    onSettled: () => setExportProjectId(null),
  });

  // Add new pending project
  const handlePendingProject = (project: any) => {
    setPendingProjects((prev) => [...prev, project]);
  };

  // Remove pending project after successful creation
  const handleProjectCreated = (createdProject: any) => {
    setPendingProjects((prev) => prev.filter((p) => !p._isPending));
    setPage(1);
    queryClient.invalidateQueries({ queryKey: ["project-list"] });
  };

  // Remove pending project if creation fails
  const handleProjectFailed = (tempId: number) => {
    setPendingProjects((prev) => prev.filter((p) => p.project_id !== tempId));
  };

  const NoData = ({ message }: { message: string }) => (
    <p className="text-center py-6 text-gray-500">{message}</p>
  );

  const projects = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
      ? data
      : [];

  const pagination = data?.pagination ?? data?.meta ?? data ?? {};
  const totalItems = Number(
    pagination.total_count ??
      pagination.total_items ??
      pagination.count ??
      data?.total_count ??
      data?.count,
  );
  const reportedTotalPages = Number(
    pagination.total_pages ??
      pagination.totalPages ??
      data?.total_pages ??
      data?.totalPages,
  );
  const totalPages =
    Number.isFinite(reportedTotalPages) && reportedTotalPages > 0
      ? reportedTotalPages
      : Number.isFinite(totalItems)
        ? Math.max(1, Math.ceil(totalItems / pageSize))
        : null;
  const hasNextPage = totalPages
    ? page < totalPages
    : Boolean(pagination.next ?? data?.next) || projects.length === pageSize;

  const allProjects = [...pendingProjects, ...projects];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredProjects = allProjects
    .filter((project: any) => {
      const searchableText = [
        project.project_name,
        project.video_name,
        project.trk_file_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    })
    .sort((first: any, second: any) => {
      if (first._isPending !== second._isPending) {
        return first._isPending ? -1 : 1;
      }

      const firstCreatedAt = Date.parse(first.created_at ?? "") || 0;
      const secondCreatedAt = Date.parse(second.created_at ?? "") || 0;
      return secondCreatedAt - firstCreatedAt;
    });

  // --------------------------------------------------------------
  // Helper to store project data in sessionStorage and navigate
  // --------------------------------------------------------------
  const navigateToDashboard = (project: any) => {
    sessionStorage.setItem("projectId", project.project_id);
    sessionStorage.setItem("project_name", project.project_name);
    sessionStorage.setItem("video_name", project.video_name);
    sessionStorage.setItem("videoPath", project.video_path);
    sessionStorage.setItem("trk_file_name", project.trk_file_name);
    sessionStorage.setItem("fps", project.fps);
    sessionStorage.setItem("width", project.width);
    sessionStorage.setItem("height", project.height);
    sessionStorage.setItem("duration", project.duration);
    sessionStorage.setItem("total_frames", project.total_frames);
    sessionStorage.setItem("active_object_count", project.active_object_count);
    sessionStorage.setItem("skeleton_graph", JSON.stringify(project.skeleton_graph));

    // ✅ Store storage paths for hover and dashboard use
    sessionStorage.setItem("video_storage_path", project.video_storage_path);
    sessionStorage.setItem("trk_storage_path", project.trk_storage_path);

    router.push("/dashboard");
  };

  const renderDateTime = (value: unknown) => {
    const parts = getISTDateTimeParts(value);

    if (!parts) return "—";

    return (
      <div className="flex flex-col items-start leading-tight">
        <span className="text-gray-900">{parts.date}</span>
        <span className="mt-1 text-xs text-gray-500">{parts.time}</span>
      </div>
    );
  };

  const renderTable = (rows: any[]) => (
    <Table className="text-left">
      <TableHeader className="bg-[#F1F3F5] text-[#374151]">
        <TableRow className="border-[#E2E5E9] hover:bg-[#F1F3F5]">
          <TableHead className="text-left text-[#374151]">Sr No.</TableHead>
          <TableHead className="text-left text-[#374151]">Project Name</TableHead>
          <TableHead className="text-left text-[#374151]">Video File</TableHead>
          <TableHead className="text-left text-[#374151]">TRK File</TableHead>
          <TableHead className="text-left text-[#374151]">Date &amp; Time</TableHead>
          <TableHead className="text-left text-[#374151]">Last Updated At</TableHead>
          <TableHead className="text-center text-[#374151]">Action</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((p, index) => {
          const isDeletingRow =
            deleteMutation.isPending && deleteProjectId === p.project_id;
          const isExportingRow =
            exportMutation.isPending && exportProjectId === p.project_id;

          const isPendingProject = p._isPending;

          return (
            <TableRow
              key={p.project_id}
              className="hover:bg-[#FAFAF9]"
            >
              <TableCell>
                {String((page - 1) * pageSize + index + 1).padStart(2, "0")}
              </TableCell>
              <TableCell>
                <span
                  data-system-guide="project-open"
                  className="text-blue-600 hover:text-blue-800 cursor-pointer font-medium"
                  onClick={() => navigateToDashboard(p)} // uses helper
                >
                  {p.project_name}
                </span>
              </TableCell>

              {/* ✅ Video File – show storage path on hover */}
              <TableCell
                className="max-w-[220px] truncate"
                title={p.video_storage_path || p.video_name}
              >
                {formatFileName(p.video_name)}
              </TableCell>

              {/* ✅ TRK File – show storage path on hover */}
              <TableCell
                className="max-w-[260px] truncate"
                title={p.trk_storage_path || p.trk_file_name}
              >
                {formatFileName(p.trk_file_name)}
              </TableCell>

              <TableCell>{renderDateTime(p.created_at)}</TableCell>
              <TableCell>{renderDateTime(p.last_updated)}</TableCell>

              {/* ACTION BUTTONS */}
              <TableCell>
                <div className="flex items-center justify-center gap-2">
                  {/* Edit */}
                  <Button
                    data-system-guide="project-edit"
                    size="sm"
                    disabled={isDeletingRow || isPendingProject}
                    className="bg-purple-100 text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                    onClick={() => navigateToDashboard(p)} // uses helper
                  >
                    Edit
                  </Button>

                  {/* Audit */}
                  <Button
                    data-system-guide="project-audit"
                    data-project-id={p.project_id}
                    size="sm"
                    disabled={isDeletingRow || isPendingProject}
                    className="bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                    onClick={() => {
                      auditProjectIdRef.current = p.project_id;
                      setAuditOpen(true);
                      setAuditProjectId(p.project_id);
                    }}
                  >
                    Audit
                  </Button>

                  {/* Delete */}
                  <Button
                    data-system-guide="project-delete"
                    size="sm"
                    disabled={deleteMutation.isPending || exportMutation.isPending || isPendingProject}
                    className="bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                    onClick={() => {
                      setDeleteOpen(true);
                      setDeleteProjectId(p.project_id);
                    }}
                  >
                    {isDeletingRow ? "Deleting..." : "Delete"}
                  </Button>

                  {/* Export */}
                  <Button
                    data-system-guide="project-export"
                    size="sm"
                    disabled={deleteMutation.isPending || exportMutation.isPending || isPendingProject}
                    className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                    onClick={() => exportMutation.mutate(p.project_id)}
                  >
                    {isExportingRow ? "Exporting..." : "Export"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F9FB] font-sans">
      {/* LANDING CONTENT */}
      <main
        data-system-guide="landing-home"
        className="flex flex-1 flex-col items-center justify-center text-center"
      >
        <h1 className="pt-10 text-[24px] font-bold text-black">
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
          data-system-guide="create-project"
          size={null}
          onClick={() => setModalOpen(true)}
          className="bg-[#3B46A0] hover:bg-[#3B46A0] text-[20px] font-normal px-7 py-[11px]"
        >
          <Image
            src="/images/create.svg"
            alt="Create Icon"
            width={18}
            height={18}
          />
          Create a new Project
        </Button>

        {/* PROJECT TABLE */}
        <section data-system-guide="project-list" className="w-[85%] mx-auto bg-white shadow rounded-md p-10 mb-5 mt-14">
          <div className="mb-5 flex">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                data-system-guide="project-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search projects..."
                aria-label="Search projects"
                className="h-10 pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <NoData message="Loading projects..." />
          ) : isError ? (
            <NoData message="Unable to load projects" />
          ) : filteredProjects.length === 0 ? (
            <NoData
              message={
                searchQuery
                  ? "No projects match your search"
                  : "No projects found"
              }
            />
          ) : (
            <div className="max-h-[420px] overflow-y-auto rounded-sm">
              {renderTable(filteredProjects)}
            </div>
          )}

          {!isError && (
            <div className="mt-5 flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 1 || isLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="min-w-24 text-sm text-gray-600">
                Page {page}{totalPages ? ` of ${totalPages}` : ""}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNextPage || isLoading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </section>
      </main>

      {/* MODAL */}
      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onProjectPending={handlePendingProject}
        onProjectCreated={handleProjectCreated}
        onProjectFailed={handleProjectFailed}
      />
      {auditOpen && (
        <AuditModal
          open={auditOpen}
          onClose={() => setAuditOpen(false)}
          projectId={Number(auditProjectId)}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the
              project and remove all associated data.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!deleteProjectId) return;
                deleteMutation.mutate(deleteProjectId);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
