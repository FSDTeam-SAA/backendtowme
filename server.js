import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import router from "./mainroute/index.js";
import { createServer } from "http";
import globalErrorHandler from "./middleware/globalErrorHandler.js";
import notFound from "./middleware/notFound.js";

const app = express();

app.set("trust proxy", true);

const server = createServer(app);

app.use(
  cors({
    credentials: true,
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/public", express.static("public"));

// Mount the main router
app.use("/api/v1", router);

// Health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "TOW ME Backend is running!",
    version: "1.0.0",
    routes: {
      auth: "/api/v1/auth",
      drivers: "/api/v1/drivers",
      trips: "/api/v1/trips",
      customers: "/api/v1/customers",
      support: "/api/v1/support",
      analytics: "/api/v1/analytics",
      notifications: "/api/v1/notifications",
    },
  });
});

app.use(notFound);
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🚗 TOW ME Server is running on port ${PORT}`);

  try {
    await mongoose.connect(process.env.MONGO_DB_URL);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
});
