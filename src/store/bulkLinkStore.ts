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
  excluded: number[];
  selectionOrder: number[];
  error: string | null;
  start: (projectId: number, mode?: 'link' | 'delete') => void;
  reset: () => void;
  remove: (id: number) => void;
  select: (projectId: number, id: number, frame: number, source?: 'manual' | 'rectangle') => Promise<void>;
};

export const useBulkLinkStore = create<BulkLinkState>((set, get) => ({
  projectId: null, active: false, mode: 'link', busy: false, generation: 0, objects: [], pending: [], excluded: [], selectionOrder: [], error: null,
  start: (projectId, mode = 'link') => set(state => ({ projectId, mode, active: true, busy: false, objects: [], pending: [], excluded: [], selectionOrder: [], error: null, generation: state.generation + 1 })),
  reset: () => set(state => ({ projectId: null, active: false, mode: 'link', busy: false, objects: [], pending: [], excluded: [], selectionOrder: [], error: null, generation: state.generation + 1 })),
  remove: id => { if (!get().busy) set(state => ({ excluded: [...new Set([...state.excluded, id])], objects: state.objects.filter(obj => obj.object_id !== id), selectionOrder: state.selectionOrder.filter(value => value !== id) })); },
  select: async (projectId, id, frame, source = 'manual') => {
    const state = get();
    if (!state.active || state.projectId !== projectId || state.busy || state.pending.includes(id)) return;
    // Removing an entry protects it from every rectangle for this operation.
    // Only an explicit click/keyboard selection may add it back.
    if (source === 'rectangle' && state.excluded.includes(id)) return;
    if (source === 'manual' && state.excluded.includes(id)) {
      set(current => ({ excluded: current.excluded.filter(value => value !== id) }));
    }
    if (state.objects.some(obj => obj.object_id === id)) {
      set(current => ({ selectionOrder: [...current.selectionOrder.filter(value => value !== id), id] }));
      return;
    }
    const generation = state.generation;
    set(current => ({ pending: [...current.pending, id], selectionOrder: [...current.selectionOrder, id], error: null }));
    try {
      const { object_id, start_frame, end_frame } = await getActiveObjectRange(projectId, id, frame);
      if (get().generation !== generation || get().excluded.includes(id)) return;
      set(current => ({ objects: [...current.objects, { object_id, start_frame, end_frame }]
        .sort((a, b) => a.start_frame - b.start_frame || a.object_id - b.object_id) }));
    } catch (error) {
      if (get().generation === generation) set(current => ({ selectionOrder: current.selectionOrder.filter(value => value !== id), error: error instanceof Error ? error.message : 'Could not load object range.' }));
    } finally {
      if (get().generation === generation) set(current => ({ pending: current.pending.filter(value => value !== id) }));
    }
  },
}));
