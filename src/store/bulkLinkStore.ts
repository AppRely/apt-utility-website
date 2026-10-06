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
  overlapping: number[];
  selectionOrder: number[];
  error: string | null;
  capturePhase: 'idle' | 'armed' | 'capturing' | 'ready';
  captureStart: number | null;
  captureEnd: number | null;
  captureBoundary: (frame: number) => void;
  armCapture: () => void;
  beginCapture: (frame: number) => void;
  finishCapture: (frame: number) => void;
  start: (projectId: number, mode?: 'link' | 'delete') => void;
  reset: () => void;
  remove: (id: number) => void;
  select: (projectId: number, id: number, frame: number, source?: 'manual' | 'rectangle') => Promise<void>;
};

let linkQueue = Promise.resolve();
let linkGeneration = -1;

export const useBulkLinkStore = create<BulkLinkState>((set, get) => ({
  projectId: null, active: false, mode: 'link', busy: false, generation: 0, objects: [], pending: [], excluded: [], overlapping: [], selectionOrder: [], capturePhase: 'idle', captureStart: null, captureEnd: null, error: null,
  start: (projectId, mode = 'link') => set(state => ({ projectId, mode, active: true, busy: false, objects: [], pending: [], excluded: [], overlapping: [], selectionOrder: [], capturePhase: 'idle', captureStart: null, captureEnd: null, error: null, generation: state.generation + 1 })),
  reset: () => set(state => ({ projectId: null, active: false, mode: 'link', busy: false, objects: [], pending: [], excluded: [], overlapping: [], selectionOrder: [], capturePhase: 'idle', captureStart: null, captureEnd: null, error: null, generation: state.generation + 1 })),
  captureBoundary: frame => {
    const state = get();
    if (!state.active || state.busy || state.capturePhase !== 'capturing' || !Number.isInteger(frame) || frame < 0) return;
    state.finishCapture(frame);
  },
  armCapture: () => {
    const state = get();
    if (!state.active || state.busy) return;
    set({ capturePhase: 'armed', captureStart: null, captureEnd: null,
      objects: [], pending: [], overlapping: [], selectionOrder: [], error: null, generation: state.generation + 1 });
  },
  beginCapture: frame => {
    const state = get();
    if (!state.active || (state.capturePhase !== 'armed' && state.capturePhase !== 'idle') || state.busy || !Number.isInteger(frame) || frame < 0) return;
    set({ capturePhase: 'capturing', captureStart: frame, captureEnd: null });
  },
  finishCapture: frame => {
    const state = get();
    if (!state.active || state.capturePhase !== 'capturing' || state.captureStart === null || !Number.isInteger(frame) || frame < 0) return;
    const start = Math.min(state.captureStart, frame);
    const end = Math.max(state.captureStart, frame);
    // Both bulk actions require the full trajectory to be inside the range.
    const objects = state.objects.filter(object => object.start_frame >= start && object.end_frame <= end);
    set({ capturePhase: 'ready', captureStart: start, captureEnd: end, objects,
      selectionOrder: state.selectionOrder.filter(id => state.pending.includes(id) || objects.some(object => object.object_id === id)) });
  },
  remove: id => { if (!get().busy) set(state => ({ excluded: [...new Set([...state.excluded, id])], objects: state.objects.filter(obj => obj.object_id !== id), selectionOrder: state.selectionOrder.filter(value => value !== id) })); },
  select: async (projectId, id, frame, source = 'manual') => {
    const state = get();
    if (!state.active || state.projectId !== projectId || state.busy || state.pending.includes(id)) return;
    if (state.capturePhase === 'idle' && source === 'manual') get().beginCapture(frame);
    if (get().capturePhase !== 'armed' && get().capturePhase !== 'capturing') return;
    // Removing an entry protects it from every rectangle for this operation.
    // Only an explicit click/keyboard selection may add it back.
    if (source === 'rectangle' && (state.excluded.includes(id) || (state.mode === 'link' && state.overlapping.includes(id)))) return;
    if (source === 'manual' && state.excluded.includes(id)) {
      set(current => ({ excluded: current.excluded.filter(value => value !== id) }));
    }
    if (state.objects.some(obj => obj.object_id === id)) {
      set(current => ({ selectionOrder: [...current.selectionOrder.filter(value => value !== id), id] }));
      return;
    }
    const generation = state.generation;
    set(current => ({ pending: [...current.pending, id], selectionOrder: [...current.selectionOrder, id], error: null }));
    // Preserve selection order even when lifecycle requests finish out of order.
    let previous = Promise.resolve();
    let release = () => {};
    if (state.mode === 'link') {
      if (linkGeneration !== generation) {
        linkQueue = Promise.resolve();
        linkGeneration = generation;
      }
      previous = linkQueue;
      linkQueue = new Promise<void>(resolve => { release = resolve; });
    }
    try {
      if (state.mode === 'link') await previous;
      if (get().generation !== generation || get().excluded.includes(id)) return;
      const { object_id, start_frame, end_frame } = await getActiveObjectRange(projectId, id, frame);
      if (get().generation !== generation || get().excluded.includes(id)) return;
      const current = get();
      if (current.capturePhase === 'ready' &&
          (current.captureStart === null || current.captureEnd === null || start_frame < current.captureStart || end_frame > current.captureEnd)) {
        set(current => ({ selectionOrder: current.selectionOrder.filter(value => value !== id) }));
        return;
      }
      if (state.mode === 'link') {
        const conflict = get().objects.find(object => start_frame <= object.end_frame && end_frame >= object.start_frame);
        if (conflict) {
          set(current => ({ overlapping: [...new Set([...current.overlapping, id])],
            selectionOrder: current.selectionOrder.filter(value => value !== id),
            error: `Skipped ID ${id}: frames ${start_frame}–${end_frame} overlap selected ID ${conflict.object_id} (${conflict.start_frame}–${conflict.end_frame}).` }));
          return;
        }
      }
      set(current => ({ objects: [...current.objects, { object_id, start_frame, end_frame }]
        .sort((a, b) => a.start_frame - b.start_frame || a.object_id - b.object_id) }));
    } catch (error) {
      if (get().generation === generation) set(current => ({ selectionOrder: current.selectionOrder.filter(value => value !== id), error: error instanceof Error ? error.message : 'Could not load object range.' }));
    } finally {
      release();
      if (get().generation === generation) set(current => ({ pending: current.pending.filter(value => value !== id) }));
    }
  },
}));
