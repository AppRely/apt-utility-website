"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  FolderKanban,
  MonitorPlay,
  Sparkles,
  TableProperties,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { systemGuideSteps } from "./guideContent";
import { announceSystemGuideStep } from "./events";

type GuideMode = "closed" | "map" | "tour";
type HighlightRect = Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height">;
type SystemMapSectionId = "projects" | "workspace" | "review";

const HIGHLIGHT_PADDING = 8;
const SYSTEM_MAP_SECTIONS = {
  projects: {
    title: "Projects & upload",
    summary: "Prepare source files and manage projects.",
    description: "Start here to create the project that supplies the annotation workspace.",
    items: ["Unique project name", "Required source video", "Optional tracking file", "Processing status", "Open, Audit, and Delete"],
    actionLabel: "Tour projects",
    path: "/" as const,
    startSelector: '[data-system-guide="landing-header"]',
  },
  workspace: {
    title: "Annotation workspace",
    summary: "Inspect video and correct trajectories.",
    description: "Learn the complete review and correction workspace for an active project.",
    items: ["Project and selection sidebar", "Swap, Break, Link, and Delete", "Interpolate, Confusion, and Clip", "Video and playback controls", "Coordinate and range timeline"],
    actionLabel: "Tour workspace",
    path: "/dashboard" as const,
    startSelector: '[data-system-guide="sidebar-project"]',
  },
  review: {
    title: "Review & navigation",
    summary: "Find advanced tools and export results.",
    description: "Explore display, navigation, review, shortcut, refresh, and output tools.",
    items: ["Auto-pan, colors, and skeleton", "Trajectory display settings", "Unique IDs and Confusion popups", "Browse by trajectory length", "Shortcuts, refresh, and TRK export"],
    actionLabel: "Explore review tools",
    path: "/dashboard" as const,
    startSelector: '[data-system-guide="workspace-menu-trigger"]',
  },
};

export default function SystemGuide() {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<GuideMode>("closed");
  const [stepIndex, setStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
  const [pendingTour, setPendingTour] = useState<{ path: "/" | "/dashboard"; startSelector?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [systemMapSection, setSystemMapSection] = useState<SystemMapSectionId>("projects");

  const steps = systemGuideSteps[pathname] ?? [];
  const step = steps[stepIndex];
  const selectedMapSection = SYSTEM_MAP_SECTIONS[systemMapSection];

  const closeGuide = useCallback(() => {
    announceSystemGuideStep(null);
    setMode("closed");
    setStepIndex(0);
    setPendingTour(null);
    setNotice(null);
    setHighlightRect(null);
  }, []);

  const startTour = useCallback((startSelector?: string) => {
    if (steps.length === 0) {
      setNotice("Open the Projects screen or an active project workspace to start a guided tour.");
      setMode("map");
      return;
    }

    setNotice(null);
    const requestedStepIndex = startSelector
      ? steps.findIndex((guideStep) => guideStep.selector === startSelector)
      : 0;
    setStepIndex(requestedStepIndex >= 0 ? requestedStepIndex : 0);
    setMode("tour");
  }, [steps]);

  const navigateAndTour = (path: "/" | "/dashboard", startSelector?: string) => {
    if (path === pathname) {
      startTour(startSelector);
      return;
    }

    if (path === "/dashboard" && !sessionStorage.getItem("projectId")) {
      setNotice("Choose a project from the Projects screen first. The dashboard needs that project's existing session details.");
      return;
    }

    setNotice(null);
    setPendingTour({ path, startSelector });
    router.push(path);
  };

  useEffect(() => {
    if (!pendingTour || pathname !== pendingTour.path) return;

    const routeSteps = systemGuideSteps[pathname] ?? [];
    const requestedStepIndex = pendingTour.startSelector
      ? routeSteps.findIndex((guideStep) => guideStep.selector === pendingTour.startSelector)
      : 0;
    setPendingTour(null);
    setStepIndex(requestedStepIndex >= 0 ? requestedStepIndex : 0);
    setMode("tour");
  }, [pathname, pendingTour]);

  useEffect(() => {
    if (mode !== "tour" || !step) {
      announceSystemGuideStep(null);
      setHighlightRect(null);
      return;
    }

    announceSystemGuideStep(step.selector);
    let missingTargetTimer: number | null = null;

    const updateHighlight = () => {
      const target = document.querySelector<HTMLElement>(step.selector);
      if (!target) {
        if (missingTargetTimer === null) {
          missingTargetTimer = window.setTimeout(() => {
            setHighlightRect(null);
            missingTargetTimer = null;
          }, 200);
        }
        return;
      }

      if (missingTargetTimer !== null) {
        window.clearTimeout(missingTargetTimer);
        missingTargetTimer = null;
      }

      const scrollContainer = target.closest<HTMLElement>("[data-system-guide-scroll-container]");
      if (scrollContainer) {
        const targetRect = target.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        if (targetRect.top < containerRect.top || targetRect.bottom > containerRect.bottom) {
          target.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }

      const rect = target.getBoundingClientRect();
      setHighlightRect({
        top: Math.max(0, rect.top - HIGHLIGHT_PADDING),
        right: Math.min(window.innerWidth, rect.right + HIGHLIGHT_PADDING),
        bottom: Math.min(window.innerHeight, rect.bottom + HIGHLIGHT_PADDING),
        left: Math.max(0, rect.left - HIGHLIGHT_PADDING),
        width: Math.min(window.innerWidth, rect.right + HIGHLIGHT_PADDING) - Math.max(0, rect.left - HIGHLIGHT_PADDING),
        height: Math.min(window.innerHeight, rect.bottom + HIGHLIGHT_PADDING) - Math.max(0, rect.top - HIGHLIGHT_PADDING),
      });
    };

    updateHighlight();
    const observer = new MutationObserver(updateHighlight);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", updateHighlight);
    window.addEventListener("scroll", updateHighlight, true);

    return () => {
      if (missingTargetTimer !== null) window.clearTimeout(missingTargetTimer);
      observer.disconnect();
      window.removeEventListener("resize", updateHighlight);
      window.removeEventListener("scroll", updateHighlight, true);
    };
  }, [mode, step]);

  useEffect(() => {
    if (mode === "closed") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeGuide();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeGuide, mode]);

  const panelPosition = useMemo<CSSProperties>(() => {
    if (!highlightRect || typeof window === "undefined") {
      return { right: "1.5rem", bottom: "1.5rem" };
    }

    const margin = 20;
    const gap = 16;
    const panelWidth = Math.min(384, window.innerWidth - margin * 2);
    const estimatedPanelHeight = 330;
    const clampedTop = Math.min(
      Math.max(highlightRect.top, margin),
      Math.max(margin, window.innerHeight - estimatedPanelHeight - margin),
    );

    if (window.innerWidth < 640) {
      return { left: margin, right: margin, bottom: margin };
    }

    if (window.innerWidth - highlightRect.right >= panelWidth + gap + margin) {
      return { left: highlightRect.right + gap, top: clampedTop };
    }

    if (highlightRect.left >= panelWidth + gap + margin) {
      return { left: highlightRect.left - panelWidth - gap, top: clampedTop };
    }

    const centeredLeft = Math.min(
      Math.max(highlightRect.left + highlightRect.width / 2 - panelWidth / 2, margin),
      window.innerWidth - panelWidth - margin,
    );

    if (window.innerHeight - highlightRect.bottom >= estimatedPanelHeight + gap + margin) {
      return { left: centeredLeft, top: highlightRect.bottom + gap };
    }

    return { left: centeredLeft, bottom: margin };
  }, [highlightRect]);

  if (mode === "closed") {
    return (
      <div className="group fixed bottom-5 right-5 z-[60]">
        <Button
          type="button"
          onClick={() => {
            setNotice(null);
            setSystemMapSection(pathname === "/dashboard" ? "workspace" : "projects");
            setMode("map");
          }}
          className="relative h-10 w-10 overflow-hidden rounded-full border border-white/40 bg-gradient-to-r from-indigo-600 to-violet-600 px-0 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-200/70 transition-[width,transform,box-shadow] duration-300 ease-out group-hover:w-44 group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:shadow-indigo-600/40 group-focus-within:w-44 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          aria-label="Explore the APT Vision system"
        >
          <span className="absolute inset-0 flex items-center justify-center transition-all duration-200 group-hover:scale-75 group-hover:opacity-0 group-focus-within:scale-75 group-focus-within:opacity-0" aria-hidden="true">
            <Compass className="h-5 w-5 drop-shadow-sm" />
          </span>
          <span className="absolute inset-0 flex translate-x-3 items-center justify-center gap-2 whitespace-nowrap opacity-0 transition-all delay-75 duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100" aria-hidden="true">
            <Compass className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            <span>Explore System</span>
          </span>
        </Button>
      </div>
    );
  }

  if (mode === "map") {
    return (
      <div data-system-guide-ui className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 p-4" role="dialog" aria-modal="true" aria-labelledby="system-guide-title">
        <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-indigo-100 bg-white shadow-2xl">
          <div className="flex items-start justify-between bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm">
                <Sparkles className="h-4 w-4" />
                Interactive application tour
              </div>
              <h2 id="system-guide-title" className="text-2xl font-bold tracking-tight text-slate-900">Where would you like to explore?</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                Choose an area to see a focused overview before starting its guided walkthrough.
              </p>
            </div>
            <button type="button" onClick={closeGuide} className="rounded-xl border border-transparent p-2 text-slate-500 transition hover:border-slate-200 hover:bg-white hover:text-slate-900 hover:shadow-sm" aria-label="Close system guide">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="border-t border-indigo-100 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Choose a section</p>
              <span className="text-xs text-slate-400">One section at a time</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3" role="tablist" aria-label="System guide sections">
              <GuideSectionTab
                icon={<FolderKanban className="h-6 w-6" />}
                title={SYSTEM_MAP_SECTIONS.projects.title}
                summary={SYSTEM_MAP_SECTIONS.projects.summary}
                active={systemMapSection === "projects"}
                onSelect={() => setSystemMapSection("projects")}
              />
              <GuideSectionTab
                icon={<MonitorPlay className="h-6 w-6" />}
                title={SYSTEM_MAP_SECTIONS.workspace.title}
                summary={SYSTEM_MAP_SECTIONS.workspace.summary}
                active={systemMapSection === "workspace"}
                onSelect={() => setSystemMapSection("workspace")}
              />
              <GuideSectionTab
                icon={<TableProperties className="h-6 w-6" />}
                title={SYSTEM_MAP_SECTIONS.review.title}
                summary={SYSTEM_MAP_SECTIONS.review.summary}
                active={systemMapSection === "review"}
                onSelect={() => setSystemMapSection("review")}
              />
            </div>

            <section className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-5 text-white shadow-lg shadow-slate-950/10">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">Selected guide</p>
                  <h3 className="mt-2 text-xl font-semibold">{selectedMapSection.title}</h3>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">{selectedMapSection.description}</p>
                </div>
                <Button type="button" onClick={() => navigateAndTour(selectedMapSection.path, selectedMapSection.startSelector)} className="shrink-0 bg-white text-indigo-950 shadow hover:bg-indigo-50">
                  {selectedMapSection.actionLabel}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {selectedMapSection.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-200">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-400/20 text-indigo-300">
                      <Check className="h-3 w-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            {notice && <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">{notice}</p>}

            <div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">The guide never starts automatically. Press Escape or Close to leave at any time.</p>
              <Button type="button" onClick={() => startTour()} className="bg-[#3B46A0] text-white hover:bg-[#303a8b]" disabled={steps.length === 0}>
                Tour this screen ({steps.length})
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-system-guide-ui className="pointer-events-none fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-label="Guided screen tour">
      {highlightRect ? (
        <>
          <div className="pointer-events-auto absolute left-0 right-0 top-0 bg-slate-950/65 transition-all duration-200 ease-out" style={{ height: highlightRect.top }} />
          <div className="pointer-events-auto absolute bottom-0 left-0 bg-slate-950/65 transition-all duration-200 ease-out" style={{ top: highlightRect.top, width: highlightRect.left }} />
          <div className="pointer-events-auto absolute bottom-0 right-0 bg-slate-950/65 transition-all duration-200 ease-out" style={{ top: highlightRect.top, width: window.innerWidth - highlightRect.right }} />
          <div className="pointer-events-auto absolute bottom-0 bg-slate-950/65 transition-all duration-200 ease-out" style={{ left: highlightRect.left, right: window.innerWidth - highlightRect.right, top: highlightRect.bottom }} />
          <div className="pointer-events-none absolute rounded-xl border-2 border-indigo-400 shadow-[0_0_0_4px_rgba(129,140,248,0.25)] transition-all duration-200 ease-out" style={{ left: highlightRect.left, top: highlightRect.top, width: highlightRect.width, height: highlightRect.height }} />
          {!step?.allowInteraction && (
            <div className="pointer-events-auto absolute" style={{ left: highlightRect.left, top: highlightRect.top, width: highlightRect.width, height: highlightRect.height }} />
          )}
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-slate-950/65" />
      )}

      <div className="pointer-events-auto absolute w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl transition-[left,right,top,bottom] duration-200 ease-out" style={panelPosition}>
        <div aria-hidden="true" className="absolute -top-20 right-5 hidden items-end sm:flex">
          <span className="mr-1 rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 shadow-md">Let&apos;s explore!</span>
          <GuideMascot />
        </div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Step {stepIndex + 1} of {steps.length}</span>
          <button type="button" onClick={closeGuide} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Exit guided tour"><X className="h-4 w-4" /></button>
        </div>
        <h2 className="text-lg font-bold text-slate-900">{step?.title ?? "Screen overview"}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{step?.description ?? "This screen does not have a detailed tour yet."}</p>
        {highlightRect && step?.allowInteraction && (
          <p className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-900">
            This highlighted control is available to click. The guide will not click it for you.
          </p>
        )}
        {!highlightRect && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            This control is not currently visible. Go back and open the form or menu described in the previous step, or continue to read the explanation.
          </p>
        )}
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${((stepIndex + 1) / Math.max(steps.length, 1)) * 100}%` }} />
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => {
            if (stepIndex === 0) setMode("map");
            else setStepIndex((index) => index - 1);
          }}>
            <ArrowLeft className="h-4 w-4" />
            {stepIndex === 0 ? "System map" : "Back"}
          </Button>
          <Button type="button" onClick={() => {
            if (stepIndex === steps.length - 1) closeGuide();
            else setStepIndex((index) => index + 1);
          }} className="bg-[#3B46A0] text-white hover:bg-[#303a8b]">
            {stepIndex === steps.length - 1 ? "Finish" : "Next"}
            {stepIndex < steps.length - 1 && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GuideMascot() {
  return (
    <div className="relative h-24 w-20 origin-bottom motion-safe:animate-[bounce_3s_ease-in-out_infinite]">
      <div className="absolute inset-x-2 bottom-0 h-2 rounded-full bg-indigo-950/25 blur-sm" />
      <Image
        src="/images/system-guide-mascot.png"
        alt=""
        fill
        sizes="80px"
        className="object-contain drop-shadow-xl motion-safe:animate-[pulse_4s_ease-in-out_infinite]"
      />
    </div>
  );
}

function GuideSectionTab({ icon, title, summary, active, onSelect }: { icon: ReactNode; title: string; summary: string; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`group/section flex min-h-28 items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-200 ${
        active
          ? "border-indigo-400 bg-indigo-50 shadow-md shadow-indigo-100"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 group-hover/section:bg-indigo-100 group-hover/section:text-indigo-700"}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-1 block text-xs leading-4 text-slate-500">{summary}</span>
      </span>
    </button>
  );
}
