'use client';
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { useBulkLinkStore } from '@/store/bulkLinkStore';
import { bulkLinkObjects, type BulkLinkResult } from '@/lib/api/bulkLinkObjects';

export function BulkLinkPanel({ projectId, onSuccess }: { projectId: number; onSuccess: (result: BulkLinkResult) => void }) {
  const state = useBulkLinkStore();
  const queryClient = useQueryClient();
  useEffect(() => {
    useBulkLinkStore.getState().reset();
    return () => useBulkLinkStore.getState().reset();
  }, [projectId]);
  const mutation = useMutation({
    mutationFn: () => bulkLinkObjects(projectId, state.objects),
    onSuccess: result => {
      if (useBulkLinkStore.getState().projectId !== projectId) return;
      state.reset();
      void queryClient.invalidateQueries({ queryKey: ['selected-object-lifecycle', String(projectId)] });
      onSuccess(result);
    },
    onError: error => {
      if (useBulkLinkStore.getState().projectId === projectId) useBulkLinkStore.setState({ error: error.message });
    },
    onSettled: () => {
      if (useBulkLinkStore.getState().projectId === projectId) useBulkLinkStore.setState({ busy: false });
    },
  });
  return <div className="p-3 pt-0">
    <Button className="w-full bg-teal-800 hover:bg-teal-900 text-white" disabled={!projectId || mutation.isPending}
      onClick={() => state.active ? state.reset() : state.start(projectId)} aria-pressed={state.active}>
      {state.active ? 'Cancel Bulk Link' : 'Bulk Link'}
    </Button>
    {state.active && <section className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3" aria-label="Bulk selection">
      <h3 className="font-semibold">Bulk selection ({state.objects.length})</h3>
      <p className="mt-1 text-xs">Click objects in the video across frames to add them. Normal selection stays unchanged. S / E jumps to the start / end of the last selected object.</p>
      <ol className="mt-3 max-h-56 overflow-y-auto space-y-2">
        {state.objects.map((obj, index) => <li key={obj.object_id} className="text-sm">
          {index > 0 && <div aria-hidden="true">↓</div>}
          <div className="flex items-center justify-between gap-2">
            <span>ID {obj.object_id}: start {obj.start_frame} → end {obj.end_frame}{state.selectionOrder[state.selectionOrder.length - 1] === obj.object_id && <strong className="ml-1 text-teal-800">(last selected)</strong>}</span>
            <button disabled={state.busy} onClick={() => state.remove(obj.object_id)} aria-label={`Remove object ${obj.object_id}`} className="text-red-700">×</button>
          </div>
        </li>)}
      </ol>
      {state.pending.length > 0 && <p role="status" className="text-xs mt-2">Loading actual trajectory ranges…</p>}
      {state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
      <Button className="mt-3 w-full" disabled={state.objects.length < 2 || state.pending.length > 0 || state.busy}
        onClick={() => { if (useBulkLinkStore.getState().busy) return; useBulkLinkStore.setState({ busy: true, error: null }); mutation.mutate(); }}>
        {state.busy ? 'Linking…' : `Link ${state.objects.length} objects`}
      </Button>
    </section>}
  </div>;
}
