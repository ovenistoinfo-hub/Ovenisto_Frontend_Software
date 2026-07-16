import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "@/services/api";

/**
 * Shared Socket.IO client singleton.
 *
 * The backend pushes changes ("order:*", "challan:*", "demand:*") so screens
 * update in real time instead of polling the DB on a timer. One connection is
 * shared across the whole app (lazy-created on first use).
 *
 * The socket connects to the SERVER ROOT, not the /api path — so we strip a
 * trailing "/api" from VITE_API_URL.
 *
 * Auth: the JWT is supplied via a CALLBACK, not a fixed value. socket.io invokes
 * it before every connect AND reconnect, so a reconnect after a token refresh
 * automatically uses the fresh token. (A fixed value would pin the socket to a
 * token captured at first use, and importing a refresh hook from api.ts would
 * create a circular import, since api.ts is where getAccessToken lives.)
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
      auth: (cb) => cb({ token: getAccessToken() }),
    });
  }
  return socket;
}

/**
 * Tear down the connection and clear the singleton.
 *
 * MUST be called on logout. Logout does not reload the page, so without this the
 * socket survives into the next login — a second user signing in on the same tab
 * would inherit the previous user's authenticated socket and outlet room, and
 * receive another branch's events. The next getSocket() builds a fresh connection
 * that authenticates as whoever is logged in then.
 */
export function resetSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
