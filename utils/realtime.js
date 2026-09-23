import { Server } from "socket.io";
import jwt from "jsonwebtoken";

/**
 * Live feed for the admin dashboard.
 *
 * Admins join a single "admin" room and receive every booking and driver
 * action as it happens. Emitting is fire-and-forget: if the socket layer is
 * down the REST flow must still complete, so nothing here ever throws.
 */

let io = null;

export const ADMIN_ROOM = "admin";

export function initRealtime(server) {
  io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io",
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

    if (!token) return next(new Error("Authentication required"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      if (decoded.role !== "admin") return next(new Error("Admin access required"));
      socket.user = decoded;
      return next();
    } catch {
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(ADMIN_ROOM);
    socket.emit("connected", { role: socket.user.role });
  });

  console.log("🔌 Realtime (socket.io) ready");
  return io;
}

/**
 * Push an event to every connected admin dashboard.
 */
export function emitToAdmins(event, payload) {
  if (!io) return;
  try {
    io.to(ADMIN_ROOM).emit(event, payload);
  } catch (error) {
    console.error(`Realtime emit failed for "${event}":`, error.message);
  }
}

/** Events the dashboard listens for. */
export const EVENTS = Object.freeze({
  TRIP_CREATED: "trip:created",
  TRIP_UPDATED: "trip:updated",
  DRIVER_UPDATED: "driver:updated",
});
