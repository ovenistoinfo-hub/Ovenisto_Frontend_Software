import { io, type Socket } from "socket.io-client";

/**
 * Socket.IO client for the anonymous `/self-order` namespace — completely
 * separate from `lib/socket.ts`'s JWT-authenticated staff socket. A customer
 * scanning a QR code has no login, so this connects with no auth payload at
 * all; the server-side namespace (self-order.socket.ts) accepts it without a
 * token by design.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const SOCKET_URL = API_BASE.replace(/\/api\/?$/, "");

let socket: Socket | null = null;

export function getSelfOrderSocket(): Socket {
  if (!socket) {
    socket = io(`${SOCKET_URL}/self-order`, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
  } else if (socket.disconnected) {
    socket.connect();
  }
  return socket;
}
