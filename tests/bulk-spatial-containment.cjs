const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const vm = require('vm');
let calls = [];
let outsideFrame = null;
let omitEnd = false;
const context = { exports: {}, require: () => ({
  getFrameRangeData: async (_, start, end) => {
    calls.push([start, end]);
    return { objects: [{ object_id: 1, frames: Array.from({ length: end - start + 1 }, (_, index) => ({
      frame_id: start + index,
      coordinates: start + index === outsideFrame ? [[101, 50]] : [[0, 0], [100, 100]],
    })).filter(frame => !omitEnd || frame.frame_id !== 1000) }] };
  },
}) };
vm.runInNewContext(ts.transpile(fs.readFileSync('src/lib/bulkSelection.ts', 'utf8'), {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
}), context);
const { coordinatesInsideRectangle, isBulkTrajectoryInside } = context.exports;
const rectangle = { left: 0, right: 100, top: 0, bottom: 100 };
const trajectory = { object_id: 1, start_frame: 0, end_frame: 1000 };
(async () => {
  assert(coordinatesInsideRectangle([[0, 0], [100, 100]], rectangle));
  assert(!coordinatesInsideRectangle([[-1, 50], [50, 50]], rectangle)); // Intersecting is insufficient.
  assert(!coordinatesInsideRectangle([], rectangle));
  assert(!coordinatesInsideRectangle([[NaN, 50]], rectangle));
  assert(await isBulkTrajectoryInside(1, trajectory, rectangle));
  assert.deepStrictEqual(calls, [[0, 499], [500, 999], [1000, 1000]]);
  calls = [];
  outsideFrame = 501; // Interior point at a frame playback could skip.
  assert(!await isBulkTrajectoryInside(1, trajectory, rectangle));
  assert.strictEqual(calls.length, 2);
  outsideFrame = null;
  omitEnd = true;
  assert(!await isBulkTrajectoryInside(1, trajectory, rectangle)); // Missing end cannot pass.
  console.log('Bulk spatial checks passed: inclusive box, intersection rejection, skipped interior frame, bounded requests, and missing endpoint.');
})().catch(error => { console.error(error); process.exitCode = 1; });
