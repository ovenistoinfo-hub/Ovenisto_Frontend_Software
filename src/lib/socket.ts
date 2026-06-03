import { io, type Socket } from "socket.io-client";

/**
 * Shared Socket.IO client singleton.
 *
 * The backend pushes order changes ("order:created" | "order:updated" |
 * "order:deleted") so screens update in real time instead of polling the DB on a
 * timer. One connection is shared across the whole app (lazy-created on first use).
 *
 * The socket connects to the SERVER ROOT, not the /api path — so we strip a
 * trailing "/api" from VITE_API_URL.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const SOCKET_URL = API_BASE.replace(/\/api\/?$/, "");

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
  }
  return socket;
}
