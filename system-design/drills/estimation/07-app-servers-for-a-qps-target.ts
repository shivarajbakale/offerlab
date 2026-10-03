/**
 * 07. App Servers for a QPS Target
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "App servers for a peak QPS target",
  prompt:
    "An API must serve **50,000 requests a second** at the peak. Profiling shows each request burns **20 ms of CPU**. How many 16-core servers do you need, and still survive losing one of three availability zones?",
  assumptions: [
    { name: "peakQps", value: 50_000, unit: "requests/s", note: "Peak load to serve" },
    { name: "cpuSeconds", value: 0.02, unit: "s", note: "CPU time per request, from a profile (not wall-clock latency: waiting on the database uses no CPU)" },
    { name: "cores", value: 16, unit: "cores", note: "Cores per server" },
    { name: "targetUtil", value: 0.6, unit: "share", note: "Run CPUs at 60% at peak: queueing delay climbs steeply near 100%" },
    { name: "zones", value: 3, unit: "zones", note: "Servers spread evenly over three zones; any one can fail" },
  ],
  steps: [
    { label: "Busy cores", value: 50_000 * 0.02, unit: "cores", how: "50,000 a second × 0.02 CPU-seconds = 1,000 cores fully busy." },
    { label: "Cores at 60%", value: (50_000 * 0.02) / 0.6, unit: "cores", how: "1,000 / 0.6 ≈ 1,667 cores." },
    { label: "Servers", value: 105, unit: "servers", how: "1,667 / 16 = 104.2, round up to 105." },
    { label: "Servers to lose a zone", value: 158, unit: "servers", how: "Two zones must carry the load: 105 × 3/2 = 157.5, round up to **158**." },
  ],
  answer: { value: 158, unit: "servers" },
  tolerance: 2,
  takeaways: [
    "**Cores = QPS × CPU-seconds per request.** It is the utilization law: work arriving a second times work per item.",
    "CPU time, not latency, sizes the CPU. A 200 ms request that spends 180 ms waiting on a database uses 20 ms of CPU. Waiting costs memory and connections instead.",
    "Waiting is what sizes concurrency: by Little's law, 50,000 a second at 200 ms means **10,000 requests in flight**, which bounds thread pools and connection pools.",
    "Surviving one of N zones costs N/(N-1): 1.5x for three zones, 2x for two. More zones make redundancy cheaper.",
    "This assumes load balances evenly and CPU is the bottleneck. Check memory, connections to the database, and the slowest dependency before trusting the number.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const busy = a.peakQps * a.cpuSeconds;
  const cores = busy / a.targetUtil;
  const servers = Math.ceil(cores / a.cores);
  const survive = Math.ceil((servers * a.zones) / (a.zones - 1));
  assert.deepEqual(
    checkSteps(drill, { "Busy cores": busy, "Cores at 60%": cores, Servers: servers, "Servers to lose a zone": survive }),
    [],
  );
});

test("the takeaways' numbers hold", () => {
  const a = given(drill);
  assert.ok(Math.abs(a.peakQps * 0.2 - 10_000) < 1e-6, "Little's law: 10,000 in flight");
  assert.equal(3 / 2, 1.5);
  assert.equal(2 / 1, 2);
});
