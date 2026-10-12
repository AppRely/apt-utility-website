import { create } from 'zustand';
import { getActiveObjectRange } from '@/lib/api/getObjectData';
import { isBulkTrajectoryInside, type BulkRectangle } from '@/lib/bulkSelection';
import type { BulkLinkObject } from '@/lib/api/bulkLinkObjects';

type BulkLinkState = {
  projectId: number | null;
  active: boolean;
  mode: 'link' | 'delete';
  busy: boolean;
  generation: number;
  objects: BulkLinkObject[];
  candidates: BulkLinkObject[];
  parent: BulkLinkObject | null;
  parentId: number | null;
  rectangle: BulkRectangle | null;
  rejected: number[];
  pending: number[];
  excluded: number[];
  overlapping: number[];
  selectionOrder: number[];
  error: string | null;
  capturePhase: 'idle' | 'armed' | 'capturing' | 'ready';
  captureStart: number | null;
  captureEnd: number | null;
  captureFrame: number | null;
  updateCaptureFrame: (frame: number) => void;
  captureBoundary: (frame: number) => void;
  armCapture: (rectangle?: BulkRectangle) => void;
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
  projectId: null, active: false, mode: 'link', busy: false, generation: 0, objects: [], candidates: [], parent: null, parentId: null, rectangle: null, rejected: [], pending: [], excluded: [], overlapping: [], selectionOrder: [], capturePhase: 'idle', captureStart: null, captureEnd: null, captureFrame: null, error: null,
  start: (projectId, mode = 'link') => set(state => ({ projectId, mode, active: true, busy: false, objects: [], candidates: [], parent: null, parentId: null, rectangle: null, rejected: [], pending: [], excluded: [], overlapping: [], selectionOrder: [], capturePhase: 'idle', captureStart: null, captureEnd: null, captureFrame: null, error: null, generation: state.generation + 1 })),
  reset: () => set(state => ({ projectId: null, active: false, mode: 'link', busy: false, objects: [], candidates: [], parent: null, parentId: null, rectangle: null, rejected: [], pending: [], excluded: [], overlapping: [], selectionOrder: [], capturePhase: 'idle', captureStart: null, captureEnd: null, captureFrame: null, error: null, generation: state.generation + 1 })),
  captureBoundary: frame => {
    const state = get();
    if (!state.active || state.busy || state.capturePhase !== 'capturing' || !Number.isInteger(frame) || frame < 0) return;
    state.finishCapture(frame);
  },
  armCapture: rectangle => {
    const state = get();
    if (!state.active || state.busy) return;
    set({ capturePhase: 'armed', captureStart: null, captureEnd: null, captureFrame: null,
      objects: [], candidates: [], parent: null, parentId: null, rectangle: rectangle ?? null, rejected: [], pending: [], overlapping: [], selectionOrder: [], error: null, generation: state.generation + 1 });
  },
  beginCapture: frame => {
    const state = get();
    if (!state.active || (state.capturePhase !== 'armed' && state.capturePhase !== 'idle') || state.busy || !Number.isInteger(frame) || frame < 0) return;
    set({ capturePhase: 'capturing', captureStart: frame, captureEnd: null, captureFrame: state.mode === 'link' ? frame : null });
  },
  updateCaptureFrame: frame => {
    const state = get();
    if (!state.active || state.busy || state.capturePhase !== 'capturing' || state.captureStart === null ||
        !Number.isInteger(frame) || frame < 0 || state.captureFrame === frame) return;
    const start = Math.min(state.captureStart, frame);
    const end = Math.max(state.captureStart, frame);
    if (state.mode === 'link') {
      reconcileLinkSelection({ captureFrame: frame });
      return;
    }
    const objects = state.objects.filter(object => object.start_frame <= end && object.end_frame >= start);
    set({ captureFrame: frame, objects,
      selectionOrder: state.selectionOrder.filter(id => state.pending.includes(id) || objects.some(object => object.object_id === id)) });
  },
  finishCapture: frame => {
    const state = get();
    if (!state.active || state.capturePhase !== 'capturing' || state.captureStart === null || !Number.isInteger(frame) || frame < 0) return;
    const start = Math.min(state.captureStart, frame);
    const end = Math.max(state.captureStart, frame);
    if (state.mode === 'link') {
      reconcileLinkSelection({ capturePhase: 'ready', captureStart: start, captureEnd: end, captureFrame: frame });
      return;
    }
    // The full trajectory must be inside the final range.
    const objects = state.objects.filter(object => object.start_frame >= start && object.end_frame <= end);
    set({ capturePhase: 'ready', captureStart: start, captureEnd: end, objects,
      selectionOrder: state.selectionOrder.filter(id => state.pending.includes(id) || objects.some(object => object.object_id === id)) });
  },
  remove: id => { if (!get().busy) { set(state => ({ excluded: [...new Set([...state.excluded, id])], objects: state.objects.filter(obj => obj.object_id !== id), selectionOrder: state.selectionOrder.filter(value => value !== id) })); reconcileLinkSelection(); } },
  select: async (projectId, id, frame, source = 'manual') => {
    const state = get();
    if (!state.active || state.projectId !== projectId || state.busy) return;
    if (state.mode === 'link' && source === 'manual' && state.parentId === null) {
      set({ parentId: id, parent: state.candidates.find(object => object.object_id === id) ?? null });
    }
    if (state.pending.includes(id)) return;
    if (state.capturePhase === 'idle' && source === 'manual') get().beginCapture(frame);
    if (get().capturePhase !== 'armed' && get().capturePhase !== 'capturing' && !(state.mode === 'link' && get().capturePhase === 'ready')) return;
    // Explicit selection may restore a manually removed candidate.
    if (source === 'rectangle' && (state.excluded.includes(id) || state.rejected.includes(id))) return;
    if (source === 'manual' && state.excluded.includes(id)) {
      set(current => ({ excluded: current.excluded.filter(value => value !== id) }));
    }
    if (state.mode === 'link' && get().candidates.some(object => object.object_id === id)) {
      reconcileLinkSelection();
      return;
    }
    if (state.objects.some(obj => obj.object_id === id)) {
      set(current => ({ selectionOrder: [...current.selectionOrder.filter(value => value !== id), id] }));
      return;
    }
    const generation = state.generation;
    set(current => ({ pending: [...current.pending, id], selectionOrder: current.mode === 'link' ? current.selectionOrder : [...current.selectionOrder, id], error: null }));
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
      if (current.mode === 'link') {
        const candidate = { object_id, start_frame, end_frame };
        if (current.parentId === id) set({ parent: candidate });
        // Cache spatially valid candidates; only completed, contained ranges enter objects.
        if (!current.rectangle) return;
        if (!await isBulkTrajectoryInside(projectId, candidate, current.rectangle)) {
          if (get().generation === generation) set(current => ({ rejected: [...new Set([...current.rejected, id])] }));
          return;
        }
        if (get().generation !== generation || get().excluded.includes(id)) return;
        set(current => ({ candidates: [...current.candidates.filter(object => object.object_id !== id), candidate] }));
        reconcileLinkSelection();
        return;
      }
      if (current.capturePhase === 'ready' &&
          (current.captureStart === null || current.captureEnd === null || start_frame < current.captureStart || end_frame > current.captureEnd)) {
        set(current => ({ selectionOrder: current.selectionOrder.filter(value => value !== id) }));
        return;
      }
      if (current.capturePhase === 'capturing' && current.captureStart !== null && current.captureFrame !== null &&
          (start_frame > Math.max(current.captureStart, current.captureFrame) ||
            end_frame < Math.min(current.captureStart, current.captureFrame))) {
        set(current => ({ selectionOrder: current.selectionOrder.filter(value => value !== id) }));
        return;
      }
      set(current => ({ objects: [...current.objects, { object_id, start_frame, end_frame }]
        .sort((a, b) => a.start_frame - b.start_frame || a.object_id - b.object_id) }));
    } catch (error) {
      if (get().generation === generation) set(current => ({ selectionOrder: current.selectionOrder.filter(value => value !== id), rejected: current.mode === 'link' ? [...new Set([...current.rejected, id])] : current.rejected, error: error instanceof Error ? error.message : 'Could not load object range.' }));
    } finally {
      release();
      if (get().generation === generation) set(current => ({ pending: current.pending.filter(value => value !== id) }));
    }
  },
}));


function reconcileLinkSelection(update: Partial<BulkLinkState> = {}) {
  const state = { ...useBulkLinkStore.getState(), ...update };
  if (state.mode !== 'link' || state.captureStart === null) return;
  const boundary = state.captureEnd ?? state.captureFrame ?? state.captureStart;
  const start = Math.min(state.captureStart, boundary);
  const end = Math.max(state.captureStart, boundary);
  const objects: BulkLinkObject[] = [];
  const overlapping: number[] = [];
  for (const candidate of [...state.candidates].sort((a, b) => a.start_frame - b.start_frame || a.object_id - b.object_id)) {
    if (state.excluded.includes(candidate.object_id) || candidate.start_frame < start || candidate.end_frame > end) continue;
    if (objects.some(object => candidate.start_frame <= object.end_frame && candidate.end_frame >= object.start_frame)) {
      overlapping.push(candidate.object_id);
      continue;
    }
    objects.push(candidate);
  }
  if (Object.keys(update).length === 0 && objects.length === state.objects.length && objects.every((object, index) => object.object_id === state.objects[index].object_id) &&
      overlapping.length === state.overlapping.length && overlapping.every((id, index) => id === state.overlapping[index])) return;
  useBulkLinkStore.setState({ ...update, objects, overlapping, selectionOrder: objects.map(object => object.object_id) });
}
