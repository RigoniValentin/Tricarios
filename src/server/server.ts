import express, { Application } from "express";
import path from "path";
import fs from "fs";
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

// ── Inyección server-side del botón flotante de WhatsApp ──────────────
// Se inserta en cada respuesta de index.html para garantizar que aparezca
// sin depender del bundle de React ni de caché del navegador.
const WHATSAPP_FLOAT_HTML = `
<style id="wa-float-style">
  .wa-float {
    position: fixed; right: 20px; bottom: 20px;
    width: 60px; height: 60px; border-radius: 50%;
    background: #25d366; color: #fff;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 18px rgba(37,211,102,.45);
    z-index: 2147483647; cursor: pointer; text-decoration: none;
    transition: transform .25s ease, box-shadow .25s ease, bottom .3s ease;
    animation: waPulse 2.2s infinite;
  }
  .wa-float:hover { transform: scale(1.08); box-shadow: 0 10px 24px rgba(37,211,102,.6); animation: none; }
  .wa-float:active { transform: scale(.96); }
  .wa-float svg { width: 32px; height: 32px; display: block; }
  .wa-float__tooltip {
    position: absolute; right: 72px; top: 50%; transform: translateY(-50%);
    background: #fff; color: #075e54;
    font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    font-size: 14px; font-weight: 600; padding: 8px 14px; border-radius: 22px;
    box-shadow: 0 4px 12px rgba(0,0,0,.12);
    white-space: nowrap; opacity: 0; pointer-events: none;
    transition: opacity .25s ease, transform .25s ease;
  }
  .wa-float__tooltip::after {
    content: ""; position: absolute; right: -6px; top: 50%; transform: translateY(-50%);
    border-width: 6px 0 6px 6px; border-style: solid;
    border-color: transparent transparent transparent #fff;
  }
  .wa-float:hover .wa-float__tooltip { opacity: 1; transform: translateY(-50%) translateX(-4px); }
  .wa-float--shifted { bottom: 96px; }
  @keyframes waPulse {
    0%   { box-shadow: 0 6px 18px rgba(37,211,102,.45), 0 0 0 0 rgba(37,211,102,.55); }
    70%  { box-shadow: 0 6px 18px rgba(37,211,102,.45), 0 0 0 18px rgba(37,211,102,0); }
    100% { box-shadow: 0 6px 18px rgba(37,211,102,.45), 0 0 0 0 rgba(37,211,102,0); }
  }
  @media (max-width: 640px) {
    .wa-float { width: 56px; height: 56px; }
    .wa-float svg { width: 28px; height: 28px; }
    .wa-float--shifted { bottom: 88px; }
  }
  @media (prefers-reduced-motion: reduce) { .wa-float { animation: none; } }
</style>
<a id="wa-float-btn" class="wa-float"
   href="https://wa.me/5493584192268?text=Hola%21%20Quiero%20m%C3%A1s%20informaci%C3%B3n%20sobre%20los%20productos%20de%20Tricarios%20GrowShop."
   target="_blank" rel="noopener noreferrer"
   aria-label="Contactanos por WhatsApp" title="Contactanos por WhatsApp">
  <span class="wa-float__tooltip">Contactanos por WhatsApp</span>
  <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M16.001 3C9.373 3 4 8.373 4 15c0 2.413.713 4.66 1.937 6.552L4 29l7.668-1.876A11.94 11.94 0 0 0 16.001 27C22.629 27 28 21.627 28 15S22.629 3 16.001 3zm0 21.6a9.563 9.563 0 0 1-4.873-1.333l-.35-.208-3.834.94.94-3.74-.228-.363A9.581 9.581 0 0 1 6.4 15c0-5.302 4.299-9.6 9.6-9.6 5.302 0 9.6 4.298 9.6 9.6s-4.298 9.6-9.6 9.6zm5.302-7.05c-.292-.146-1.726-.852-1.993-.95-.267-.097-.462-.146-.656.146-.195.292-.755.95-.926 1.146-.17.195-.34.22-.633.073-.292-.146-1.234-.455-2.35-1.45-.868-.775-1.455-1.732-1.626-2.024-.17-.292-.018-.45.128-.595.132-.131.292-.34.438-.51.146-.17.195-.292.292-.487.097-.195.049-.365-.024-.51-.073-.146-.656-1.582-.9-2.166-.236-.568-.476-.49-.656-.5l-.56-.01c-.195 0-.51.073-.778.365-.267.292-1.022.998-1.022 2.435s1.047 2.825 1.193 3.02c.146.195 2.06 3.144 4.99 4.41.697.301 1.241.481 1.665.616.7.222 1.337.191 1.842.116.562-.084 1.726-.705 1.97-1.387.243-.682.243-1.267.17-1.387-.073-.121-.267-.195-.56-.341z"/>
  </svg>
</a>
<script>
(function(){
  function syncWa(){
    var b=document.getElementById('wa-float-btn');
    if(!b) return;
    var adminBtn=document.querySelector('[class*="_adminFloatingButton_"]');
    var isAdmin=false;
    try{var u=JSON.parse(localStorage.getItem('userData')||'null');isAdmin=!!(u&&u.isAdmin&&u.token);}catch(e){}
    if(adminBtn||isAdmin) b.classList.add('wa-float--shifted');
    else b.classList.remove('wa-float--shifted');
  }
  try{
    var obs=new MutationObserver(syncWa);
    obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }catch(e){}
  document.addEventListener('DOMContentLoaded',syncWa);
  window.addEventListener('load',syncWa);
  setInterval(syncWa,2000);
})();
</script>
`;

const injectWhatsappFloat = (html: string): string => {
  // Idempotente: si ya está inyectado, no duplicar.
  if (html.includes('id="wa-float-btn"')) return html;
  // Insertar antes de </body>; si no existe, al final del documento.
  if (html.includes("</body>")) {
    return html.replace("</body>", `${WHATSAPP_FLOAT_HTML}</body>`);
  }
  return html + WHATSAPP_FLOAT_HTML;
};

// ── Frontend estático + inyección server-side del botón WhatsApp ───────
// 1) Assets (JS/CSS/imgs dentro de distFront/assets y distFront/slider)
//    se sirven tal cual desde express.static.
// 2) Cualquier ruta que no sea asset → se sirve distFront/index.html con
//    el botón flotante de WhatsApp inyectado antes de </body>, evitando
//    caché para que cada deploy se vea sin hard-refresh.

const indexHtmlPath = path.join(projectRoot, "distFront", "index.html");

app.use(
  express.static(path.join(projectRoot, "distFront"), { index: false, fallthrough: true })
);

app.get("*", (req, res, next) => {
  fs.readFile(indexHtmlPath, "utf8", (err, html) => {
    if (err) return next();
    const injected = injectWhatsappFloat(html);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.send(injected);
  });
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
