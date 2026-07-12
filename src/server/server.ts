import express, { Application, Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import routes from "@routes/routes";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ChatMessage } from "@models/ChatMessage"; // Importar el modelo de mensajes

const app: Application = express();
const projectRoot = process.cwd();

// ── Sanitización de URL (defensa contra percent-encoding malformado) ─────
// Algunos scanners y clientes maliciosos envían URLs con secuencias
// percent-encoded inválidas (p.ej. /%c0). Esto hace que el router de
// Express lance un URIError no atrapado, abortando el envío del archivo
// estático y dejando la página en blanco. Cortamos el problema de raíz
// respondiendo 400 antes de que la request llegue al router.
app.use((req: Request, res: Response, next: NextFunction): void => {
  try {
    decodeURIComponent(req.url);
    decodeURIComponent(req.path);
    return next();
  } catch (err) {
    if (err instanceof URIError) {
      res.status(400).type("text/plain").send("Bad Request");
      return;
    }
    next(err);
  }
});

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

// ── Frontend estático + SPA fallback ───────────────────────────────────
// 1) Assets (JS/CSS/imgs dentro de distFront/assets y distFront/slider)
//    se sirven tal cual desde express.static.
// 2) Cualquier ruta que no sea asset → se sirve distFront/index.html,
//    cache-busting en cada response para forzar recarga de bundle.
// 3) El botón flotante de WhatsApp lo renderiza SOLO el componente React
//    <WhatsappFloatingButton /> (ver src/components/common/.../WhatsappFloatingButton.tsx).
//    Antes había un server-side injection que duplicaba el botón con un
//    número distinto — eliminado para tener una única fuente de verdad.

const indexHtmlPath = path.join(projectRoot, "distFront", "index.html");

app.use(
  express.static(path.join(projectRoot, "distFront"), { index: false, fallthrough: true })
);

app.get("*", (req, res, next) => {
  fs.readFile(indexHtmlPath, "utf8", (err, html) => {
    if (err) return next();
    // Cache-busting agresivo: cambiamos los hashes de los assets por un
    // query param único. Esto fuerza al browser a descargar el JS/CSS nuevo
    // incluso si tiene el HTML cacheado.
    const cacheBust = Date.now();
    const busted = html
      .replace(/(\/assets\/index-[A-Za-z0-9_-]+\.js)/g, `$1?v=${cacheBust}`)
      .replace(/(\/assets\/index-[A-Za-z0-9_-]+\.css)/g, `$1?v=${cacheBust}`);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
    res.set("Vary", "*");
    res.send(busted);
  });
});

// ── Error handler final ─────────────────────────────────────────────────
// Captura URIError residuales (URLs con percent-encoding malformado que
// llegaron a pasar la sanitización inicial) y cualquier error de send/
// serve-static, devolviendo una respuesta HTTP válida en lugar de cortar
// la conexión a mitad de stream.
app.use((err: any, _req: Request, res: Response, _next: NextFunction): void => {
  if (err && err instanceof URIError) {
    res.status(400).type("text/plain").send("Bad Request");
    return;
  }
  if (err && err.status === 400) {
    res.status(400).type("text/plain").send("Bad Request");
    return;
  }
  console.error("[server] Unhandled error:", err);
  if (!res.headersSent) {
    res.status(500).type("text/plain").send("Internal Server Error");
  }
});

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
