import path from "path";
import routes from "@routes/routes";
import express, { Application } from "express";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";

const app: Application = express();
const projectRoot = process.cwd();

app.use(cookieParser());
app.use(express.json());
app.use(morgan("dev"));
app.use(cors());

// En producción se sirven los archivos estáticos del front
if (process.env.NODE_ENV === "production") {
  app.use(
    "/",
    express.static(path.join(projectRoot, "distFront"), { index: "index.html" })
  );

  // Catch-all: sirve el index.html para las demás rutas
  app.get("*", (req, res) => {
    return res.sendFile(path.join(projectRoot, "distFront", "index.html"));
  });
} else {
  // Modo desarrollo: se sirven los archivos estáticos desde el backend
  app.use(
    "/",
    express.static(path.join(projectRoot, "distFront"), { index: "index.html" })
  );
  // Catch-all: sirve el index.html para las demás rutas
  app.get("*", (req, res) => {
    return res.sendFile(path.join(projectRoot, "distFront", "index.html"));
  });
}

// Rutas de la API (disponibles en todos los entornos)
app.use("/api/v1", routes());

export default app;
