import { connectStore } from "../src/server/db";

/** Reads the dev database so manual testing can find an account and a kit. */
async function main(): Promise<void> {
  const store = await connectStore(
    process.env["MONGO_URL"] ?? "mongodb://127.0.0.1:27018",
    process.env["MONGO_DB"] ?? "prepkit_dev",
  );

  const users = await store.users.find({}).toArray();
  console.log("users:");
  for (const user of users) console.log(`  ${user._id}  ${user.email}`);

  const kits = await store.kits.find({}).toArray();
  console.log("kits:");
  for (const kit of kits) {
    console.log(`  ${kit._id}  ${kit.status.padEnd(10)} ${kit.userId}  ${kit.title}`);
  }

  await store.close();
}

main().catch((cause: unknown) => {
  console.error(cause);
  process.exit(1);
});
