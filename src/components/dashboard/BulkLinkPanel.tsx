'use client';
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { useBulkLinkStore } from '@/store/bulkLinkStore';
import { bulkDeleteObjects, type BulkDeleteResult } from '@/lib/api/objectDelete';
import { bulkLinkObjects, type BulkLinkResult } from '@/lib/api/bulkLinkObjects';
import { getObjectColor, type VideoColorTheme } from '@/lib/objectColors';

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
  return <div className="p-3 pt-0">
    <div className="grid grid-cols-2 gap-2">
    <Button className="min-w-0 w-full px-2 text-xs bg-teal-800 hover:bg-teal-900 text-white" disabled={!projectId || mutation.isPending}
      onClick={() => state.active && state.mode === 'link' ? state.reset() : state.start(projectId)} aria-pressed={state.active && state.mode === 'link'}>
      {state.active && state.mode === 'link' ? 'Cancel Bulk Link' : 'Bulk Link'}
    </Button>
    <Button className="min-w-0 w-full px-2 text-xs bg-red-700 hover:bg-red-800 text-white" disabled={!projectId || state.busy || mutation.isPending}
      onClick={() => state.active && state.mode === 'delete' ? state.reset() : state.start(projectId, 'delete')}
      aria-pressed={state.active && state.mode === 'delete'}>
      {state.active && state.mode === 'delete' ? 'Cancel Bulk Delete' : 'Bulk Delete'}
    </Button>
    </div>
    {state.active && <section className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3" aria-label="Bulk selection">
      <h3 className="font-semibold">Bulk {state.mode} selection ({state.objects.length})</h3>
      {state.mode === 'delete' && <p className="mt-1 text-xs">Deletes each selected object across its full trajectory.</p>}
      {/* <p className="mt-1 text-xs">Click objects in the video across frames to add them. The timeline shows {state.mode === 'link' ? 'the two most recently selected objects' : 'the last selected object'}. S / E jumps to the start / end of the last selected object.</p> */}
      <ol className="mt-3 max-h-56 overflow-y-auto space-y-2">
        {state.objects.map((obj, index) => <li key={obj.object_id} className="text-sm">
          {state.mode === 'link' && index > 0 && <div aria-hidden="true">↓</div>}
          <div className="flex items-center justify-between gap-2">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-full border border-black/20"
              style={{ backgroundColor: getObjectColor(obj.object_id, videoColorTheme) }}
            />
            <span>ID {obj.object_id}: start {obj.start_frame} {state.mode === 'link' ? '→' : ','} end {obj.end_frame}{state.selectionOrder[state.selectionOrder.length - 1] === obj.object_id && <strong className="ml-1 text-teal-800">(last selected)</strong>}</span>
            <button disabled={state.busy} onClick={() => state.remove(obj.object_id)} aria-label={`Remove object ${obj.object_id}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-200 text-2xl text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50">×</button>
          </div>
        </li>)}
      </ol>
      {state.pending.length > 0 && <p role="status" className="text-xs mt-2">Loading actual trajectory ranges…</p>}
      {state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
      <Button className="mt-3 w-full" disabled={state.objects.length < (state.mode === 'delete' ? 1 : 2) || state.pending.length > 0 || state.busy}
        onClick={() => { if (useBulkLinkStore.getState().busy) return; useBulkLinkStore.setState({ busy: true, error: null }); mutation.mutate(); }}>
        {state.busy ? (state.mode === 'delete' ? 'Deleting…' : 'Linking…') : `${state.mode === 'delete' ? 'Delete' : 'Link'} ${state.objects.length} objects`}
      </Button>
    </section>}
  </div>;
}
