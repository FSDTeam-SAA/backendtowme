import User from "../model/user.model.js";

/**
 * Fixes legacy email_1 index that blocked multiple users without email.
 */
export async function syncUserIndexes() {
  const collection = User.collection;

  await collection.updateMany(
    { $or: [{ email: null }, { email: "" }] },
    { $unset: { email: "" } }
  );

  try {
    await collection.dropIndex("email_1");
    console.log("Dropped legacy email_1 index");
  } catch (err) {
    if (err.code !== 27 && err.codeName !== "IndexNotFound") {
      throw err;
    }
  }

  await User.syncIndexes();
  console.log("User email index synced (unique + sparse)");
}
