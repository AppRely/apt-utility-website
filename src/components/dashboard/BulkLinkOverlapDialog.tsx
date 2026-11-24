'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Trajectory = { id: number; start: number; end: number };

function parseConflict(message: string | null): [Trajectory, Trajectory] | null {
  const match = message?.match(/Trajectory #(\d+) \((-?\d+)–(-?\d+)\) overlaps with Trajectory #(\d+) \((-?\d+)–(-?\d+)\)/);
  if (!match) return null;
  return [
    { id: Number(match[1]), start: Number(match[2]), end: Number(match[3]) },
    { id: Number(match[4]), start: Number(match[5]), end: Number(match[6]) },
  ];
}

function TrajectoryDetails({ trajectory, status }: { trajectory: Trajectory; status: 'Rejected' | 'Selected' }) {
  return <div className="px-2.5 py-2.5">
    <div className="flex items-center justify-between gap-3">
      <p className="text-base font-semibold text-slate-900">Trajectory #{trajectory.id}</p>
      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{status}</span>
    </div>
    <dl className="mt-2 grid grid-cols-3 gap-3 text-xs">
      <div><dt className="text-slate-500">Start</dt><dd className="font-medium text-slate-800">{trajectory.start}</dd></div>
      <div><dt className="text-slate-500">End</dt><dd className="font-medium text-slate-800">{trajectory.end}</dd></div>
      <div><dt className="text-slate-500">Length</dt><dd className="font-medium text-slate-800">{trajectory.end - trajectory.start + 1}</dd></div>
    </dl>
  </div>;
}

export function BulkLinkOverlapDialog({ open, message, onOpenChange }: { open: boolean; message: string | null; onOpenChange: (open: boolean) => void }) {
  const conflict = parseConflict(message);
  const rejected = conflict?.[0];
  const selected = conflict?.[1];
  const intersectionStart = rejected && selected ? Math.max(rejected.start, selected.start) : null;
  const intersectionEnd = rejected && selected ? Math.min(rejected.end, selected.end) : null;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[min(86vh,680px)] max-w-xl overflow-hidden border-slate-200 bg-white p-0">
      <div className="flex max-h-[min(86vh,680px)] flex-col">
        <DialogHeader className="border-b border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-left">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber-100 p-2 text-amber-700"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></div>
            <div><DialogTitle className="text-base text-slate-900">Overlapping trajectories detected</DialogTitle><DialogDescription className="mt-1 text-xs text-slate-600">1 conflict found. The rejected trajectory overlaps with a selected trajectory.</DialogDescription></div>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-4 py-3">
          {rejected && selected ? <>
            <p className="mb-2 text-xs text-slate-700">The rejected trajectory overlaps with a selected trajectory.</p>
            <TrajectoryDetails trajectory={rejected} status="Rejected" />
            <p className="flex items-center justify-center gap-1 py-1 text-xs font-medium text-amber-800"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Overlaps with selected trajectory</p>
            <TrajectoryDetails trajectory={selected} status="Selected" />
            {intersectionStart !== null && intersectionEnd !== null && intersectionStart <= intersectionEnd && <p className="mt-1 px-2.5 text-xs text-slate-700"><span className="font-semibold">Frame-range intersection:</span> {intersectionStart}–{intersectionEnd}</p>}
          </> : <p className="px-2.5 py-2 text-sm text-slate-600">{message ?? 'Two or more trajectories overlap and cannot be bulk linked.'}</p>}
        </div>
        <DialogFooter className="border-t border-slate-200 px-4 py-3"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </div>
    </DialogContent>
  </Dialog>;
}
