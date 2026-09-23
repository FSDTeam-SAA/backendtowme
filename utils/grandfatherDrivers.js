import "dotenv/config";
import mongoose from "mongoose";
import Driver from "../model/driver.model.js";

/**
 * One-off migration for the driver approval rollout.
 *
 * Drivers who were already working before approval existed are approved in
 * place, so the new gate does not take them off the road. Drivers who register
 * from now on start unapproved and must be approved in the dashboard.
 *
 * Documents are deliberately left as-is. Writing placeholder insurance records
 * would make an uninsured driver look compliant, which is exactly the risk the
 * document requirement exists to prevent. The dashboard shows who is missing
 * paperwork so it can be collected for real.
 *
 * Usage:
 *   node utils/grandfatherDrivers.js --dry-run
 *   node utils/grandfatherDrivers.js
 */

const isDryRun = process.argv.includes("--dry-run");

async function run() {
  if (!process.env.MONGO_DB_URL) {
    throw new Error("MONGO_DB_URL is not set");
  }

  await mongoose.connect(process.env.MONGO_DB_URL);
  console.log(`Connected${isDryRun ? " (dry run — nothing will be written)" : ""}`);

  // Anyone not yet through the approval flow. Re-running is harmless: drivers
  // approved by this script already have approvedAt set and are skipped.
  const filter = { approvedAt: { $in: [null, undefined] } };

  const candidates = await Driver.find(filter).select(
    "firstName lastName phoneNumber isVerified isBlocked createdAt " +
      "vehicleRegistration insuranceDocument cargoInsuranceDocument thirdPartyInsuranceDocument",
  );

  if (candidates.length === 0) {
    console.log("No drivers need grandfathering.");
    return;
  }

  console.log(`\n${candidates.length} driver(s) to approve:\n`);
  for (const driver of candidates) {
    const missing = driver.missingDocuments();
    const name = `${driver.firstName} ${driver.lastName}`.trim() || driver.phoneNumber;
    console.log(
      `  ${name.padEnd(28)} ${driver.phoneNumber.padEnd(16)} ` +
        `missing docs: ${missing.length ? missing.join(", ") : "none"}`,
    );
  }

  if (isDryRun) {
    console.log("\nDry run complete — no changes written.");
    return;
  }

  const result = await Driver.updateMany(filter, {
    $set: {
      isVerified: true,
      approvedAt: new Date(),
      rejectionReason: "",
    },
  });

  console.log(`\nApproved ${result.modifiedCount} existing driver(s).`);
  console.log("New registrations from here on require dashboard approval.");
}

run()
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
