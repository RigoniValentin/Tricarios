import express, { Application } from "express";
import path from "path";
import routes from "@routes/routes";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ChatMessage } from "@models/ChatMessage"; // Importar el modelo de mensajes

const app: Application = express();
const projectRoot = process.cwd();

app.use(cookieParser());
// Capturamos el raw body en req.rawBody para poder verificar HMAC en webhooks
// entrantes (p.ej. integración con Río Gestión). Se preserva el comportamiento
// estándar de express.json para el resto de la app.
app.use(
  express.json({
    limit: "50mb",
    verify: (req: any, _res, buf: Buffer) => {
      if (buf && buf.length) req.rawBody = Buffer.from(buf);
    },
  })
);
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(morgan("dev"));
app.use(cors());

// Servir archivos de imágenes de productos
app.use("/uploads", express.static(path.join(projectRoot, "uploads")));

// Registrar rutas de la API
app.use("/api/v1", routes());

// Servir archivos estáticos
if (process.env.NODE_ENV === "production") {
  app.use(
    "/",
    express.static(path.join(projectRoot, "distFront"), { index: "index.html" })
  );
  app.get("*", (req, res) => {
    return res.sendFile(path.join(projectRoot, "distFront", "index.html"));
  });
} else {
  app.use(
    "/",
    express.static(path.join(projectRoot, "distFront"), { index: "index.html" })
  );
  app.get("*", (req, res) => {
    return res.sendFile(path.join(projectRoot, "distFront", "index.html"));
  });
}

// ── Servidor HTTP + Socket.IO ──
import { createServer } from "http";
import { initSocketServer } from "../realtime/socketServer";

// Crear servidor HTTP usando la app de Express
const httpServer = createServer(app);

// Inicializa Socket.IO (namespace /realtime + bridges del domainBus).
const io = initSocketServer(httpServer);

// ── Chat legacy: queda en el namespace default ("/") ──
io.on("connection", (socket) => {
  socket.on("chat message", async (msg: string) => {
    io.emit("chat message", msg);
    // Guardar el mensaje en la base de datos
    try {
      // Se asume que el mensaje viene en el formato "username: mensaje"
      const [sender] = msg.split(":");
      await ChatMessage.create({ sender: sender.trim(), message: msg });
    } catch (error) {
      console.error("Error al guardar mensaje:", error);
    }
  });

  // Listener para el evento "chat toggled"
  socket.on("chat toggled", (payload: any) => {
    // Retransmitir el evento a todos los demás clientes conectados
    socket.broadcast.emit("chat toggled", payload);
  });
});

// Lógica de cierre gracioso en server.ts
const shutdown = () => {
  httpServer.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { httpServer };
