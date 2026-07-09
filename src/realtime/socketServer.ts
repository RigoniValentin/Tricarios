import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Namespace } from "socket.io";
import { domainBus } from "./domainBus";

/**
 * Inicializa el servidor Socket.IO y registra los puentes
 * "domainBus -> socket emit".
 *
 * Namespaces:
 *  - `/`           (default)   → chat legacy (configurado en server.ts)
 *  - `/realtime`               → eventos de dominio para la tienda (catálogo, órdenes)
 *
 * Rooms en `/realtime`:
 *  - `catalog`                → cambios de stock/precio (público, todo cliente)
 *  - `orders:{userId}`        → eventos de órdenes de un usuario específico
 *  - `admin`                  → eventos para el panel admin
 */

let io: SocketIOServer | null = null;
let realtimeNs: Namespace | null = null;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  if (io) return io;

  const corsOriginEnv = (process.env.SOCKET_CORS_ORIGIN || "*").trim();
  const corsOrigin =
    corsOriginEnv === "*"
      ? "*"
      : corsOriginEnv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  realtimeNs = io.of("/realtime");

  realtimeNs.on("connection", (socket) => {
    // Catálogo es público: todo cliente se suscribe automáticamente.
    socket.join("catalog");

    socket.on("join:orders", (userId: unknown) => {
      if (typeof userId === "string" && userId.length > 0 && userId.length <= 64) {
        socket.join(`orders:${userId}`);
      }
    });

    socket.on("join:admin", () => {
      // En producción esto debería validar JWT antes de unir.
      socket.join("admin");
    });
  });

  // ── Bridges: domainBus → emisiones por Socket.IO ────────────────────────
  domainBus.on("catalog.stockChanged", (payload) => {
    realtimeNs?.to("catalog").emit("catalog:stock-changed", payload);
  });

  domainBus.on("orders.created", (payload) => {
    if (payload.userId) {
      realtimeNs?.to(`orders:${payload.userId}`).emit("orders:created", payload);
    }
    realtimeNs?.to("admin").emit("orders:created", payload);
  });

  console.log("[socket] /realtime namespace listo (CORS:", corsOriginEnv, ")");
  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO no inicializado: llamar initSocketServer primero");
  return io;
}

export function getRealtimeNamespace(): Namespace {
  if (!realtimeNs) throw new Error("Namespace /realtime no inicializado");
  return realtimeNs;
}
