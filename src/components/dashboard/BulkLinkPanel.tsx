'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { useBulkLinkStore } from '@/store/bulkLinkStore';
import { bulkDeleteObjects, type BulkDeleteResult } from '@/lib/api/objectDelete';
import { bulkLinkObjects, type BulkLinkResult } from '@/lib/api/bulkLinkObjects';
import { getObjectColor, type VideoColorTheme } from '@/lib/objectColors';
import type { BulkLinkObject } from '@/lib/api/bulkLinkObjects';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function TrajectoryTable({ title, items, tone, reasons, onRemove, busy, videoColorTheme }: {
  title: string;
  items: BulkLinkObject[];
  tone: 'selected' | 'active' | 'rejected';
  reasons?: Record<number, string>;
  onRemove?: (id: number) => void;
  busy: boolean;
  videoColorTheme: VideoColorTheme;
}) {
  const [idAscending, setIdAscending] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const visibleItems = useMemo(() => [...items].sort((a, b) => {
      if (idAscending === null) return 0;
      return (a.object_id - b.object_id) * (idAscending ? 1 : -1);
    }), [idAscending, items]);
  const changeIdSort = () => setIdAscending(value => value === null ? true : null);
  const styles = {
    selected: 'border-teal-200 bg-white',
    active: 'border-sky-200 bg-sky-50',
    rejected: 'border-amber-200 bg-amber-50',
  }[tone];
  const heading = {
    selected: 'text-teal-900',
    active: 'text-sky-900',
    rejected: 'text-amber-900',
  }[tone];
  return <section className={`mt-3 overflow-hidden rounded-md border ${styles}`} aria-label={`${title} trajectories`}>
    <div className="border-b border-inherit">
      <button type="button" onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500">
        <span className="flex min-w-0 items-center gap-1.5">
          <svg className={`h-4 w-4 shrink-0 transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          <span className={`text-xs font-semibold ${heading}`}>{title}</span>
        </span>
        <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-600">{items.length}</span>
      </button>
    </div>
    {!collapsed && (items.length === 0 ? <p className="px-3 py-3 text-xs text-slate-500">No trajectories</p> : <>
      <div className="max-h-56 w-full overflow-x-hidden overflow-y-auto">
      <Table className="w-full min-w-0 table-fixed text-left text-[10px]">
        <colgroup><col style={{ width: onRemove ? '25%' : '30%' }} /><col style={{ width: onRemove ? '19%' : '22%' }} /><col style={{ width: onRemove ? '19%' : '22%' }} /><col style={{ width: onRemove ? '27%' : '26%' }} />{onRemove && <col style={{ width: '10%' }} />}</colgroup>
        <TableHeader><TableRow className="bg-black/[0.03] text-[10px] uppercase tracking-wide text-slate-500">
          <TableHead className="h-8 px-1.5"><button className="font-semibold" onClick={changeIdSort}>ID {idAscending === true ? '↑' : idAscending === null ? '' : '↺'}</button></TableHead>
          <TableHead className="h-8 px-1.5 font-semibold">Start</TableHead><TableHead className="h-8 px-1.5 font-semibold">End</TableHead><TableHead className="h-8 px-1.5 font-semibold">Length</TableHead>{onRemove && <TableHead className="h-8 px-0" />}
        </TableRow></TableHeader>
        <TableBody>{visibleItems.map(item => <Fragment key={item.object_id}><TableRow className={reasons?.[item.object_id] ? 'border-b-0' : undefined}>
          <TableCell className="px-1.5 py-2 font-medium text-slate-800"><span className="flex min-w-0 items-center gap-1"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getObjectColor(item.object_id, videoColorTheme) }} /><button className="min-w-0 truncate text-teal-800 underline-offset-2 hover:underline" title={`Jump to frame ${item.start_frame}`} onClick={() => window.dispatchEvent(new CustomEvent('bulk-frame-jump', { detail: item.start_frame }))}>{item.object_id}</button></span></TableCell>
          <TableCell className="px-1.5 py-2 text-slate-600"><button className="underline-offset-2 hover:underline" onClick={() => window.dispatchEvent(new CustomEvent('bulk-frame-jump', { detail: item.start_frame }))}>{item.start_frame}</button></TableCell><TableCell className="px-1.5 py-2 text-slate-600"><button className="underline-offset-2 hover:underline" onClick={() => window.dispatchEvent(new CustomEvent('bulk-frame-jump', { detail: item.end_frame }))}>{item.end_frame}</button></TableCell><TableCell className="px-1.5 py-2 text-slate-600">{item.end_frame - item.start_frame + 1}</TableCell>
          {onRemove && <TableCell className="px-0 py-1 text-center"><button disabled={busy} onClick={() => onRemove(item.object_id)} aria-label={`Remove object ${item.object_id}`} className="h-7 w-7 rounded border border-red-200 text-base leading-none text-red-700 hover:bg-red-100 disabled:opacity-50">×</button></TableCell>}
        </TableRow>{reasons?.[item.object_id] && <TableRow className="border-b hover:bg-transparent"><TableCell colSpan={onRemove ? 5 : 4} className="border-b px-1.5 py-0.5 text-[10px] text-amber-800"><details><summary className="cursor-pointer text-amber-700">Reason</summary><span className="block break-words pb-1">{reasons[item.object_id]}</span></details></TableCell></TableRow>}</Fragment>)}</TableBody>
      </Table>
      </div>
    </>)}
  </section>;
}

export function BulkLinkPanel({ projectId, videoColorTheme, onSuccess, onDeleteSuccess }: { projectId: number; videoColorTheme: VideoColorTheme; onSuccess: (result: BulkLinkResult) => void; onDeleteSuccess: (result: BulkDeleteResult) => void }) {
  const state = useBulkLinkStore();
  const queryClient = useQueryClient();
  useEffect(() => {
    useBulkLinkStore.getState().reset();
    return () => useBulkLinkStore.getState().reset();
  }, [projectId]);
  const mutation = useMutation({
    mutationFn: async () => state.mode === 'delete'
      ? { mode: 'delete' as const, result: await bulkDeleteObjects(projectId, state.objects.map(object => object.object_id)) }
      : { mode: 'link' as const, result: await bulkLinkObjects(projectId, state.objects) },
    onSuccess: result => {
      if (useBulkLinkStore.getState().projectId !== projectId) return;
      state.reset();
      void queryClient.invalidateQueries({ queryKey: ['selected-object-lifecycle', String(projectId)] });
      void queryClient.invalidateQueries({ queryKey: ['activityLogs', projectId] });
      if (result.mode === 'delete') onDeleteSuccess(result.result);
      else onSuccess(result.result);
    },
    onError: error => {
      if (useBulkLinkStore.getState().projectId === projectId) useBulkLinkStore.setState({ error: error.message });
    },
    onSettled: () => {
      if (useBulkLinkStore.getState().projectId === projectId) useBulkLinkStore.setState({ busy: false });
    },
  });
  const submitBulkAction = useCallback(() => {
    const current = useBulkLinkStore.getState();
    if (!current.active || current.projectId !== projectId || current.busy || mutation.isPending ||
      current.pending.length > 0 || current.objects.length < (current.mode === 'delete' ? 1 : 2)) return;
    if (current.capturePhase !== 'ready') return;
    useBulkLinkStore.setState({ busy: true, error: null });
    mutation.mutate();
  }, [projectId, mutation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (sessionStorage.getItem('dialogOpen') === 'true' || document.querySelector('[role="dialog"]')) return;
      const target = document.activeElement as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const key = event.key.toLowerCase();
      const current = useBulkLinkStore.getState();
      if (key === 'b' || key === 'v') {
        event.preventDefault();
        if (!projectId || current.busy || mutation.isPending) return;
        const mode = key === 'b' ? 'link' : 'delete';
        if (current.active && current.projectId === projectId && current.mode === mode) current.reset();
        else current.start(projectId, mode);
      } else if (key === 'enter' && current.active && current.projectId === projectId) {
        // Enter applies the bulk action even when a toolbar button retains focus.
        event.preventDefault();
        submitBulkAction();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [projectId, mutation.isPending, submitBulkAction]);

  return <div className="p-3 pt-0">
    <div className="bulk-action-grid">
    {state.active && state.mode === 'link' ? (
      <div className="grid grid-cols-2 gap-2">
        <Button data-system-guide="sidebar-bulk-link" className="min-w-0 w-full h-9 px-2 py-1 text-xs leading-tight bg-teal-800 hover:bg-teal-900 text-white whitespace-normal" disabled={!projectId || state.busy || mutation.isPending}
          onClick={() => state.reset()} aria-pressed="true">
          Cancel (B)
        </Button>
        <Button className="min-w-0 w-full h-9 px-2 py-1 text-xs leading-tight bg-amber-600 hover:bg-amber-700 text-white whitespace-normal"
          disabled={state.busy || mutation.isPending || state.capturePhase !== 'capturing'}
          onClick={() => state.captureBoundary(state.captureFrame ?? state.captureStart ?? 0)}>
          Done (Ctrl+C)
        </Button>
      </div>
    ) : (
      <Button data-system-guide="sidebar-bulk-link" className="min-w-0 w-full h-9 px-2 py-1 text-xs leading-tight bg-teal-800 hover:bg-teal-900 text-white whitespace-normal" disabled={!projectId || mutation.isPending}
        onClick={() => state.start(projectId)} aria-pressed="false">
        Bulk Link (B)
      </Button>
    )}
    {state.active && state.mode === 'delete' ? (
      <div className="grid grid-cols-2 gap-2">
        <Button data-system-guide="sidebar-bulk-delete" className="min-w-0 w-full h-9 px-2 py-1 text-xs leading-tight bg-red-700 hover:bg-red-800 text-white whitespace-normal" disabled={!projectId || state.busy || mutation.isPending}
          onClick={() => state.reset()} aria-pressed="true">
          Cancel {state.mode === 'delete' ? '(V)' : '(B)'}
        </Button>
        <Button className="min-w-0 w-full h-9 px-2 py-1 text-xs leading-tight bg-amber-600 hover:bg-amber-700 text-white whitespace-normal"
          disabled={state.busy || mutation.isPending || state.capturePhase !== 'capturing'}
          onClick={() => state.captureBoundary(state.captureFrame ?? state.captureStart ?? 0)}>
          Done (Ctrl+C)
        </Button>
      </div>
    ) : !state.active || state.mode === 'link' ? (
      <Button data-system-guide="sidebar-bulk-delete" className="min-w-0 w-full h-9 px-2 py-1 text-xs leading-tight bg-red-700 hover:bg-red-800 text-white whitespace-normal" disabled={!projectId || state.busy || mutation.isPending}
        onClick={() => state.start(projectId, 'delete')} aria-pressed="false">
        Bulk Delete (V)
      </Button>
    ) : null}
    </div>
    {state.active && <section className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3" aria-label="Bulk selection">
      <h3 className="font-semibold" title={state.mode === 'link' ? 'Only full trajectories inside the box and frame range are selected.' : undefined}>{state.objects.length} selected</h3>
      <p className="mt-1 text-xs">{state.capturePhase === 'ready' ? `Frames ${state.captureStart}–${state.captureEnd}` : state.capturePhase === 'capturing' ? `Frames ${state.captureStart}-${state.captureFrame ?? state.captureStart} · Ctrl+C: end` : state.mode === 'link' ? 'Draw a rectangle to select trajectories.' : 'Draw box or select object.'}</p>
      <TrajectoryTable title="Selected" items={state.objects} tone="selected" onRemove={state.remove} busy={state.busy} videoColorTheme={videoColorTheme} />
      <TrajectoryTable title="Rejected" items={state.rejected.map(id => state.resolvedRanges[id] ?? { object_id: id, start_frame: 0, end_frame: 0 })} tone="rejected" reasons={state.rejectedReasons} busy={state.busy} videoColorTheme={videoColorTheme} />
      {state.pending.length > 0 && <p role="status" className="text-xs mt-2">Loading…</p>}
      {state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
      <Button className="mt-3 w-full" disabled={state.capturePhase !== 'ready' || state.objects.length < (state.mode === 'delete' ? 1 : 2) || state.pending.length > 0 || state.busy}
        onClick={submitBulkAction}>
        {state.busy ? (state.mode === 'delete' ? 'Deleting…' : 'Linking…') : `${state.mode === 'delete' ? 'Delete' : 'Link'} ${state.objects.length} objects (Enter)`}
      </Button>
    </section>}
  </div>;
}
