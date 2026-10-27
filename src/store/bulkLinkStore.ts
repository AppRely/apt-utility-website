import { create } from 'zustand';
import { getActiveObjectRange } from '@/lib/api/getObjectData';
import { getBulkTrajectoryRejectionReason, type BulkRectangle } from '@/lib/bulkSelection';
import type { BulkLinkObject } from '@/lib/api/bulkLinkObjects';

type BulkLinkState = {
  projectId: number | null;
  active: boolean;
  mode: 'link' | 'delete';
  busy: boolean;
  generation: number;
  objects: BulkLinkObject[];
  candidates: BulkLinkObject[];
  queuedCandidates: BulkLinkObject[];
  parent: BulkLinkObject | null;
  parentId: number | null;
  rectangle: BulkRectangle | null;
  rejected: number[];
  rejectedReasons: Record<number, string>;
  resolvedRanges: Record<number, BulkLinkObject>;
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
  abort: (reason: string, rejectedId?: number) => void;
  reset: () => void;
  retryRejected: () => void;
  remove: (id: number) => void;
  select: (projectId: number, id: number, frame: number, source?: 'manual' | 'rectangle', knownObject?: BulkLinkObject) => Promise<void>;
  queueCandidates: (objects: BulkLinkObject[]) => void;
};

let linkQueue = Promise.resolve();
let linkGeneration = -1;
let linkRetryInFlight = false;

export const useBulkLinkStore = create<BulkLinkState>((set, get) => ({
  projectId: null, active: false, mode: 'link', busy: false, generation: 0, objects: [], candidates: [], queuedCandidates: [], parent: null, parentId: null, rectangle: null, rejected: [], rejectedReasons: {}, resolvedRanges: {}, pending: [], excluded: [], overlapping: [], selectionOrder: [], capturePhase: 'idle', captureStart: null, captureEnd: null, captureFrame: null, error: null,
  start: (projectId, mode = 'link') => set(state => ({ projectId, mode, active: true, busy: false, objects: [], candidates: [], queuedCandidates: [], parent: null, parentId: null, rectangle: null, rejected: [], rejectedReasons: {}, resolvedRanges: {}, pending: [], excluded: [], overlapping: [], selectionOrder: [], capturePhase: 'idle', captureStart: null, captureEnd: null, captureFrame: null, error: null, generation: state.generation + 1 })),
  abort: (reason, rejectedId) => set(state => ({
    active: true,
    busy: false,
    candidates: [],
    queuedCandidates: [],
    pending: [],
    rejected: rejectedId === undefined ? state.rejected : [...new Set([...state.rejected, rejectedId])],
    rejectedReasons: rejectedId === undefined ? state.rejectedReasons : { ...state.rejectedReasons, [rejectedId]: reason },
    capturePhase: 'ready',
    captureEnd: state.captureEnd ?? state.captureFrame ?? state.captureStart,
    error: reason,
    generation: state.generation + 1,
  })),
  reset: () => set(state => ({ projectId: null, active: false, mode: 'link', busy: false, objects: [], candidates: [], queuedCandidates: [], parent: null, parentId: null, rectangle: null, rejected: [], rejectedReasons: {}, resolvedRanges: {}, pending: [], excluded: [], overlapping: [], selectionOrder: [], capturePhase: 'idle', captureStart: null, captureEnd: null, captureFrame: null, error: null, generation: state.generation + 1 })),
  retryRejected: async () => {
    const state = get();
    const retryIds = new Set(state.rejected);
    if (!retryIds.size) return;
    if (state.mode === 'link') {
      const boundary = state.captureEnd ?? state.captureFrame ?? state.captureStart;
      const start = state.captureStart !== null && boundary !== null ? Math.min(state.captureStart, boundary) : null;
      const end = state.captureStart !== null && boundary !== null ? Math.max(state.captureStart, boundary) : null;
      const intervalObjects = start !== null && end !== null
        ? [...retryIds]
            .map(id => state.resolvedRanges[id])
            .filter((object): object is BulkLinkObject => Boolean(object) && object.start_frame >= start && object.end_frame <= end)
            .filter(object => !state.objects.some(existing => object.start_frame <= existing.end_frame && object.end_frame >= existing.start_frame))
        : [];
      if (intervalObjects.length === 0) return;
      if (linkRetryInFlight) return;
      linkRetryInFlight = true;
      let validation: { object: BulkLinkObject; rejectionReason: string | null }[];
      try {
        validation = await Promise.all(intervalObjects.map(async object => ({
          object,
          rejectionReason: state.rectangle
            ? await getBulkTrajectoryRejectionReason(state.projectId!, object, state.rectangle)
            : null,
        })));
      } finally {
        linkRetryInFlight = false;
      }
      if (get().generation !== state.generation) return;
      const retriedObjects = validation.filter(item => !item.rejectionReason).map(item => item.object);
      set(current => ({
        objects: [...current.objects, ...retriedObjects]
          .sort((a, b) => a.start_frame - b.start_frame || a.object_id - b.object_id),
        selectionOrder: [...current.selectionOrder, ...retriedObjects.map(object => object.object_id)],
        rejected: current.rejected.filter(id => !retriedObjects.some(object => object.object_id === id)),
        rejectedReasons: Object.fromEntries(Object.entries(current.rejectedReasons).filter(([id]) => !retriedObjects.some(object => object.object_id === Number(id)))
          .map(([id, reason]) => {
            const result = validation.find(item => item.object.object_id === Number(id));
            return [id, result?.rejectionReason ?? reason];
          })),
        generation: current.generation + 1,
      }));
      return;
    }
    set(current => ({
      rejected: current.rejected.filter(id => !retryIds.has(id)),
      rejectedReasons: Object.fromEntries(Object.entries(current.rejectedReasons).filter(([id]) => !retryIds.has(Number(id)))),
      generation: current.generation + 1,
    }));
  },
  queueCandidates: objects => set(state => {
    const additions = objects.filter(object => object.object_id !== state.parentId && !state.candidates.some(item => item.object_id === object.object_id) && !state.objects.some(item => item.object_id === object.object_id) && !state.queuedCandidates.some(item => item.object_id === object.object_id));
    return { queuedCandidates: [...state.queuedCandidates, ...additions] };
  }),
  captureBoundary: frame => {
    const state = get();
    if (!state.active || state.busy || state.capturePhase !== 'capturing' || !Number.isInteger(frame) || frame < 0) return;
    state.finishCapture(frame);
  },
  armCapture: rectangle => {
    const state = get();
    if (!state.active || state.busy) return;
    set({ capturePhase: 'armed', captureStart: null, captureEnd: null, captureFrame: null,
      objects: [], candidates: [], parent: null, parentId: null, rectangle: rectangle ?? null, rejected: [], rejectedReasons: {}, pending: [], overlapping: [], selectionOrder: [], error: null, generation: state.generation + 1 });
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
      const objects = state.objects.filter(object => object.start_frame >= start && object.end_frame <= end);
      const rejected = state.rejected.filter(id => {
        const range = state.resolvedRanges[id];
        return !range || range.end_frame <= end;
      });
      set({ captureFrame: frame, objects,
        rejected,
        rejectedReasons: Object.fromEntries(Object.entries(state.rejectedReasons).filter(([id]) => rejected.includes(Number(id)))),
        selectionOrder: state.selectionOrder.filter(id => objects.some(object => object.object_id === id)) });
      return;
    }
    const objects = state.mode === 'delete'
      ? state.objects.filter(object => object.start_frame >= start && object.end_frame <= end)
      : state.objects.filter(object => object.start_frame <= end && object.end_frame >= start);
    set({ captureFrame: frame, objects,
      selectionOrder: state.selectionOrder.filter(id => state.pending.includes(id) || objects.some(object => object.object_id === id)) });
  },
  finishCapture: frame => {
    const state = get();
    if (!state.active || state.capturePhase !== 'capturing' || state.captureStart === null || !Number.isInteger(frame) || frame < 0) return;
    const start = Math.min(state.captureStart, frame);
    const end = Math.max(state.captureStart, frame);
    if (state.mode === 'link') {
      set({ capturePhase: 'ready', captureStart: start, captureEnd: end, captureFrame: frame });
      return;
    }
    // The full trajectory must be inside the final range.
    const objects = state.objects.filter(object => object.start_frame >= start && object.end_frame <= end);
    set({ capturePhase: 'ready', captureStart: start, captureEnd: end, objects,
      selectionOrder: state.selectionOrder.filter(id => state.pending.includes(id) || objects.some(object => object.object_id === id)) });
  },
  remove: id => { if (!get().busy) { set(state => ({ excluded: [...new Set([...state.excluded, id])], objects: state.objects.filter(obj => obj.object_id !== id), selectionOrder: state.selectionOrder.filter(value => value !== id) })); if (get().mode !== 'link') reconcileLinkSelection(); } },
  select: async (projectId, id, frame, source = 'manual', knownObject) => {
    const state = get();
    if (!state.active || state.projectId !== projectId || state.busy) return;
    if (state.mode === 'link' && source === 'manual') return;
    if (state.pending.includes(id)) return;
    // Selecting the parent after drawing a rectangle must start the live
    // capture as well. Without this, the store can remain "armed" and the
    // first Ctrl+C is ignored.
    if ((state.capturePhase === 'idle' || state.capturePhase === 'armed') && source === 'manual') get().beginCapture(frame);
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
      const cachedRange = get().resolvedRanges[id];
      let { object_id, start_frame, end_frame } = knownObject ?? cachedRange ?? await getActiveObjectRange(projectId, id, frame);
      if (get().generation !== generation || get().excluded.includes(id)) return;
      const current = get();
      set(currentState => ({ resolvedRanges: { ...currentState.resolvedRanges, [id]: { object_id, start_frame, end_frame } } }));
      if (current.mode === 'link') {
        const candidate = { object_id, start_frame, end_frame };
        const intervalStart = current.captureStart ?? start_frame;
        const intervalEnd = current.captureEnd ?? current.captureFrame ?? intervalStart;
        let rejectionReason: string | null = null;
        const overlapsResolvedTrajectory = Object.values(current.resolvedRanges).some(object =>
          object.object_id !== id && start_frame <= object.end_frame && end_frame >= object.start_frame
        );
        if (current.objects.some(object => start_frame <= object.end_frame && end_frame >= object.start_frame) || overlapsResolvedTrajectory) {
          rejectionReason = `Trajectory ${start_frame}–${end_frame} overlaps another trajectory and cannot be bulk linked.`;
        } else if (start_frame < Math.min(intervalStart, intervalEnd) || end_frame > Math.max(intervalStart, intervalEnd)) {
          rejectionReason = `Trajectory ${start_frame}–${end_frame} is outside selected interval ${Math.min(intervalStart, intervalEnd)}–${Math.max(intervalStart, intervalEnd)}.`;
        } else if (current.rectangle) {
          rejectionReason = await getBulkTrajectoryRejectionReason(projectId, candidate, current.rectangle);
        }
        if (rejectionReason) {
          if (rejectionReason.includes('overlaps')) {
            get().abort(`Bulk link stopped: ${rejectionReason}`, id);
            return;
          }
          if (get().generation === generation) set(currentState => ({
            rejected: [...new Set([...currentState.rejected, id])],
            rejectedReasons: { ...currentState.rejectedReasons, [id]: rejectionReason! },
            error: rejectionReason.includes('overlaps')
              ? 'Some trajectories overlap and cannot be bulk linked.'
              : currentState.error,
          }));
          return;
        }
        set(current => ({
          objects: [...current.objects, candidate].sort((a, b) => a.start_frame - b.start_frame || a.object_id - b.object_id),
          rejected: current.rejected.filter(value => value !== id),
          rejectedReasons: Object.fromEntries(Object.entries(current.rejectedReasons).filter(([key]) => Number(key) !== id)),
        }));
        return;
      }
      if (current.capturePhase === 'ready' &&
          (current.captureStart === null || current.captureEnd === null || start_frame < current.captureStart || end_frame > current.captureEnd)) {
        set(current => ({ selectionOrder: current.selectionOrder.filter(value => value !== id), rejected: [...new Set([...current.rejected, id])], rejectedReasons: { ...current.rejectedReasons, [id]: 'Trajectory is outside the selected frame interval.' } }));
        return;
      }
      if (current.capturePhase === 'capturing' && current.captureStart !== null && current.captureFrame !== null &&
          (start_frame > Math.max(current.captureStart, current.captureFrame) ||
            end_frame < Math.min(current.captureStart, current.captureFrame))) {
        set(current => ({ selectionOrder: current.selectionOrder.filter(value => value !== id), rejected: [...new Set([...current.rejected, id])], rejectedReasons: { ...current.rejectedReasons, [id]: 'Trajectory is outside the selected frame interval.' } }));
        return;
      }
      if (current.mode === 'delete' && current.rectangle) {
        let intervalStart = current.captureStart === null ? start_frame : Math.min(current.captureStart, current.captureFrame ?? current.captureStart);
        let intervalEnd = current.captureEnd === null
          ? Math.max(current.captureStart ?? end_frame, current.captureFrame ?? end_frame)
          : Math.max(current.captureStart ?? current.captureEnd, current.captureEnd);
        // Windowed unique-ID ranges can be clipped. Resolve only candidates
        // that are already outside the interval, keeping the common path fast
        // while ensuring rejection messages use the true trajectory range.
        if (knownObject && (start_frame < intervalStart || end_frame > intervalEnd)) {
          const fullRange = await getActiveObjectRange(projectId, id, frame);
          object_id = fullRange.object_id;
          start_frame = fullRange.start_frame;
          end_frame = fullRange.end_frame;
          intervalStart = current.captureStart === null ? start_frame : Math.min(current.captureStart, current.captureFrame ?? current.captureStart);
          intervalEnd = current.captureEnd === null
            ? Math.max(current.captureStart ?? end_frame, current.captureFrame ?? end_frame)
            : Math.max(current.captureStart ?? current.captureEnd, current.captureEnd);
        }
        let rejectionReason: string | null = null;
        if (start_frame < intervalStart || end_frame > intervalEnd) {
          rejectionReason = `Trajectory ${start_frame}–${end_frame} is outside selected interval ${intervalStart}–${intervalEnd}.`;
        }
        if (rejectionReason) {
          set(currentState => ({ selectionOrder: currentState.selectionOrder.filter(value => value !== id), rejected: [...new Set([...currentState.rejected, id])], rejectedReasons: { ...currentState.rejectedReasons, [id]: rejectionReason! } }));
          return;
        }
      }
      set(current => ({ objects: [...current.objects, { object_id, start_frame, end_frame }]
        .sort((a, b) => a.start_frame - b.start_frame || a.object_id - b.object_id),
        rejected: current.rejected.filter(value => value !== id),
        rejectedReasons: Object.fromEntries(Object.entries(current.rejectedReasons).filter(([key]) => Number(key) !== id)) }));
    } catch (error) {
      if (get().generation === generation) set(current => ({ selectionOrder: current.selectionOrder.filter(value => value !== id), rejected: current.mode === 'link' ? [...new Set([...current.rejected, id])] : current.rejected, error: error instanceof Error ? error.message : 'Could not load object range.' }));
    } finally {
      release();
      // A retry can advance the generation while this request is in flight.
      // The request still owns its pending ID, so always release it; leaving
      // stale IDs here keeps the Link button stuck in Loading state.
      set(current => ({ pending: current.pending.filter(value => value !== id) }));
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
