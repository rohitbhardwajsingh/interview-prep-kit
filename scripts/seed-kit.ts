import { randomUUID } from "node:crypto";
import { loadDotEnv } from "../src/cli/env";
import { buildKit, buildQuestion, buildRequirement } from "../src/core/testing/builders";
import { civilDateOf, addDays } from "../src/core/schedule/calendar";
import { connectStore } from "../src/server/db";
import type { KitRecord } from "../src/server/kits/types";

/**
 * Puts a ready kit in front of a named user without calling a model.
 *
 * Exists for manual and browser testing. Generating a kit properly costs a
 * few minutes and a handful of paid API calls, which is a poor trade when
 * what is being checked is whether a button works.
 */

const OUTLINES = {
  slowQuery: [
    "- How the slow query was measured",
    "- The index chosen and why that one",
    "- The latency figure afterwards",
  ].join("\n"),
  feedback: [
    "- The situation and what was at stake",
    "- What you actually said to them",
    "- How they took it and what changed",
  ].join("\n"),
  sharding: [
    "- How you would pick a shard key",
    "- What breaks at the boundary",
    "- How you would migrate without downtime",
  ].join("\n"),
  ownership: [
    "- A decision you made without cover",
    "- The trade-off you accepted",
    "- What you would do differently",
  ].join("\n"),
};

async function main(): Promise<void> {
  loadDotEnv();

  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx scripts/seed-kit.ts <email>");
    process.exit(64); // EX_USAGE
  }

  // Defaults match scripts/dev-stack.sh, so this needs no arguments when run
  // against a stack started the usual way.
  const store = await connectStore(
    process.env["MONGO_URL"] ?? "mongodb://127.0.0.1:27018",
    process.env["MONGO_DB"] ?? "prepkit_dev",
  );

  const user = await store.users.findOne({ email });
  if (!user) {
    console.error(`No user with email ${email}. Register in the UI first.`);
    await store.close();
    process.exit(1);
  }

  const requirements = [
    buildRequirement("r1", { text: "Postgres at scale, including query tuning" }),
    buildRequirement("r2", { text: "Distributed system design" }),
    buildRequirement("r3", {
      text: "Mentoring and giving difficult feedback",
      kind: "behavioural",
      priority: "nice",
    }),
    buildRequirement("r4", {
      text: "Ownership of production systems",
      kind: "behavioural",
    }),
  ];

  const questions = [
    buildQuestion("q1", ["r1"], {
      prompt: "Tell me about a slow query you tracked down and fixed.",
      answer_outline: OUTLINES.slowQuery,
      category: "behavioural",
      difficulty: 2,
    }),
    buildQuestion("q2", ["r2"], {
      prompt: "How would you shard a table that has outgrown one machine?",
      answer_outline: OUTLINES.sharding,
      category: "system-design",
      difficulty: 3,
    }),
    buildQuestion("q3", ["r3"], {
      prompt: "Tell me about a time you had to give someone difficult feedback.",
      answer_outline: OUTLINES.feedback,
      category: "behavioural",
      difficulty: 1,
    }),
    buildQuestion("q4", ["r4"], {
      prompt: "Describe a production decision you made that you had to own.",
      answer_outline: OUTLINES.ownership,
      category: "behavioural",
      difficulty: 2,
    }),
  ];

  const now = new Date();
  const startDate = civilDateOf(now, "UTC");
  const days = 5;

  const record: KitRecord = {
    _id: randomUUID(),
    userId: user._id,
    status: "ready",
    version: 1,
    title: "Senior Backend Engineer at Acme",
    request: {
      jd: "Senior Backend Engineer. Postgres at scale, distributed systems, mentoring.",
      companyUrl: "https://acme.example.com/",
      days,
    },
    interviewDate: addDays(startDate, days),
    startDate,
    timeZone: "UTC",
    kit: {
      ...buildKit({ requirements, questions, daysAvailable: days }),
      // Provenance is added by the pipeline, so it is applied here too.
    } as KitRecord["kit"],
    evidenceLinks: [],
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  await store.kits.insertOne(record);
  console.log(`Seeded kit ${record._id} for ${email}`);
  console.log(`  http://localhost:3400/kits/${record._id}`);

  await store.close();
}

main().catch((cause: unknown) => {
  console.error(cause);
  process.exit(1);
});
