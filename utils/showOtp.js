import "dotenv/config";
import mongoose from "mongoose";
import User from "../model/user.model.js";
import { findUserByPhone } from "./phoneNumber.js";

/**
 * Print the current OTP for a phone number, for testing without SMS delivery.
 *
 *   node utils/showOtp.js 0526319744
 */
const phone = process.argv[2];

async function run() {
  if (!phone) throw new Error("Usage: node utils/showOtp.js <phoneNumber>");
  await mongoose.connect(process.env.MONGO_DB_URL);

  const user = await findUserByPhone(User, phone);
  if (!user) throw new Error(`No account found for ${phone}`);

  const code = user.otp?.code;
  const expiresAt = user.otp?.expiresAt;

  console.log(`account : ${user.name} (${user.role})`);
  console.log(`phone   : ${user.phoneNumber}`);

  if (!code) {
    console.log("otp     : none — request a code in the app first");
    return;
  }

  const secondsLeft = Math.round((new Date(expiresAt) - Date.now()) / 1000);
  console.log(`otp     : ${code}`);
  console.log(
    secondsLeft > 0
      ? `expires : in ${secondsLeft}s`
      : "expires : EXPIRED — request a new code",
  );
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
