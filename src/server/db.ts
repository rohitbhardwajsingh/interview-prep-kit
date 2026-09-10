import { MongoClient, type Collection, type Db } from "mongodb";
import type { AttemptRecord } from "./attempts/types";
import type { JobRecord } from "./jobs/types";
import type { KitRecord } from "./kits/types";
import type { ReviewRecord } from "./practice/types";
import type { StoryRecord } from "./stories/types";
import type { UserRecord } from "./auth/types";

export interface Store {
  db: Db;
  users: Collection<UserRecord>;
  kits: Collection<KitRecord>;
  jobs: Collection<JobRecord>;
  stories: Collection<StoryRecord>;
  reviews: Collection<ReviewRecord>;
  attempts: Collection<AttemptRecord>;
  close(): Promise<void>;
}

/**
 * Indexes are created at connect time rather than by a migration step, because
 * two of them are correctness rather than performance: the unique index on
 * email is what makes concurrent registration of the same address impossible,
 * and the one on a kit's active job is what stops a double-click generating
 * the same kit twice.
 */
async function ensureIndexes(store: Omit<Store, "close">): Promise<void> {
  await store.users.createIndex({ email: 1 }, { unique: true });
  await store.kits.createIndex({ userId: 1, createdAt: -1 });
  await store.jobs.createIndex({ kitId: 1 });
  await store.jobs.createIndex({ userId: 1, createdAt: -1 });
  await store.stories.createIndex({ userId: 1, createdAt: -1 });
  await store.reviews.createIndex({ userId: 1, kitId: 1 });
  // Calibration reads every attempt for a kit in order; the scorecard reads
  // one question's history. Both are served by this.
  await store.attempts.createIndex({ userId: 1, kitId: 1, createdAt: 1 });
  await store.attempts.createIndex({ userId: 1, kitId: 1, questionId: 1 });
}

export async function connectStore(
  url: string,
  dbName: string,
): Promise<Store> {
  const client = new MongoClient(url, {
    serverSelectionTimeoutMS: 10_000,
  });
  await client.connect();

  const db = client.db(dbName);
  const store = {
    db,
    users: db.collection<UserRecord>("users"),
    kits: db.collection<KitRecord>("kits"),
    jobs: db.collection<JobRecord>("jobs"),
    stories: db.collection<StoryRecord>("stories"),
    reviews: db.collection<ReviewRecord>("reviews"),
    attempts: db.collection<AttemptRecord>("attempts"),
  };

  await ensureIndexes(store);

  return {
    ...store,
    async close() {
      await client.close();
    },
  };
}
