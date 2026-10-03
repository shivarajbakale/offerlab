/**
 * 04. Chat Messages and Storage
 * Level: Senior
 * Group: Estimation drills
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSteps, estimation, given } from "../index.ts";

export const drill = estimation({
  title: "Chat messages a second at peak, and storage a day",
  prompt:
    "A chat app has **500 million daily active users** and keeps message history on its servers. How many messages a second arrive **at the peak**, and how much new storage does text history need **each day**, counting replicas? Ignore photos and video.",
  assumptions: [
    { name: "users", value: 500e6, unit: "people", note: "Daily active users" },
    { name: "messagesPerUser", value: 40, unit: "messages", note: "Sent per user per day (an assumption; heavy chat users send far more, many send a few)" },
    { name: "secondsPerDay", value: 86_400, unit: "s" },
    { name: "peakToMean", value: 2, unit: "x", note: "Peak against average. Users span many time zones, which flattens the curve" },
    { name: "messageBytes", value: 200, unit: "bytes", note: "Text (~100 bytes) plus ids, timestamps and status" },
    { name: "copies", value: 3, unit: "x", note: "Replicas kept" },
  ],
  steps: [
    { label: "Messages a day", value: 20e9, unit: "messages", how: "500M users × 40 messages = 20 billion." },
    { label: "Average", value: 20e9 / 86_400, unit: "messages/s", how: "20B / 86,400 s ≈ 230k a second." },
    { label: "Peak", value: (20e9 / 86_400) * 2, unit: "messages/s", how: "230k × 2 ≈ **460k a second**." },
    { label: "One copy a day", value: 20e9 * 200, unit: "bytes", how: "20B messages × 200 bytes = 4 TB." },
    { label: "Stored a day, with replicas", value: 20e9 * 200 * 3, unit: "bytes", how: "4 TB × 3 = **12 TB a day**." },
  ],
  answer: { value: 20e9 * 200 * 3, unit: "bytes" },
  tolerance: 3,
  takeaways: [
    "12 TB a day is about **4.4 PB a year** of text alone. Media is far bigger and goes to an object store; the message row keeps only a pointer.",
    "Messages arrive, but deliveries leave: a message to a 50-person group is one write and 49 pushes. Size the delivery path (open connections and pushes a second) separately from the write path.",
    "History is read by conversation, newest first, so store it partitioned by conversation id and sorted by time (a wide-column store fits this shape).",
    "Not every app keeps history. Some hold a message only until it is delivered and then delete it from the server, which turns a petabyte problem into a queue.",
    "At 460k writes a second, each to a few replicas, you need a horizontally scalable store; a single relational primary will not keep up.",
  ],
});

test("every step follows from the assumptions", () => {
  const a = given(drill);
  const perDay = a.users * a.messagesPerUser;
  const mean = perDay / a.secondsPerDay;
  const one = perDay * a.messageBytes;
  assert.deepEqual(
    checkSteps(drill, {
      "Messages a day": perDay,
      Average: mean,
      Peak: mean * a.peakToMean,
      "One copy a day": one,
      "Stored a day, with replicas": one * a.copies,
    }),
    [],
  );
});

test("the takeaways' numbers hold", () => {
  const perYear = drill.answer.value * 365;
  assert.ok(perYear > 4.3e15 && perYear < 4.5e15, `${perYear / 1e15} PB a year`);
  const peak = drill.steps.find((s) => s.label === "Peak")!.value;
  assert.ok(Math.abs(peak - 460e3) < 10e3, `peak ${peak}`);
});
