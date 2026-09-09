import { create } from 'zustand';
import { getActiveObjectRange } from '@/lib/api/getObjectData';
import type { BulkLinkObject } from '@/lib/api/bulkLinkObjects';

type BulkLinkState = {
  projectId: number | null;
  active: boolean;
  mode: 'link' | 'delete';
  busy: boolean;
  generation: number;
  objects: BulkLinkObject[];
  pending: number[];
  selectionOrder: number[];
  error: string | null;
  start: (projectId: number, mode?: 'link' | 'delete') => void;
  reset: () => void;
  remove: (id: number) => void;
  select: (projectId: number, id: number, frame: number) => Promise<void>;
};

export const useBulkLinkStore = create<BulkLinkState>((set, get) => ({
  projectId: null, active: false, mode: 'link', busy: false, generation: 0, objects: [], pending: [], selectionOrder: [], error: null,
  start: (projectId, mode = 'link') => set(state => ({ projectId, mode, active: true, busy: false, objects: [], pending: [], selectionOrder: [], error: null, generation: state.generation + 1 })),
  reset: () => set(state => ({ projectId: null, active: false, mode: 'link', busy: false, objects: [], pending: [], selectionOrder: [], error: null, generation: state.generation + 1 })),
  remove: id => { if (!get().busy) set(state => ({ objects: state.objects.filter(obj => obj.object_id !== id), selectionOrder: state.selectionOrder.filter(value => value !== id) })); },
  select: async (projectId, id, frame) => {
    const state = get();
    if (!state.active || state.projectId !== projectId || state.busy || state.pending.includes(id)) return;
    if (state.objects.some(obj => obj.object_id === id)) {
      set(current => ({ selectionOrder: [...current.selectionOrder.filter(value => value !== id), id] }));
      return;
    }
    const generation = state.generation;
    set(current => ({ pending: [...current.pending, id], selectionOrder: [...current.selectionOrder, id], error: null }));
    try {
      const { object_id, start_frame, end_frame } = await getActiveObjectRange(projectId, id, frame);
      if (get().generation !== generation) return;
      set(current => ({ objects: [...current.objects, { object_id, start_frame, end_frame }]
        .sort((a, b) => a.start_frame - b.start_frame || a.object_id - b.object_id) }));
    } catch (error) {
      if (get().generation === generation) set(current => ({ selectionOrder: current.selectionOrder.filter(value => value !== id), error: error instanceof Error ? error.message : 'Could not load object range.' }));
    } finally {
      if (get().generation === generation) set(current => ({ pending: current.pending.filter(value => value !== id) }));
    }
  },
}));
