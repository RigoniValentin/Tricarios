import path from "path";
import routes from "@routes/routes";
import express, { Application } from "express";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";

const app: Application = express();

// Obtener la ruta raíz del proyecto
const projectRoot = process.cwd();

app.use(cookieParser());
app.use(express.json());
app.use(morgan("dev"));
app.use(cors());

// Servir los archivos estáticos del front.
// Asegúrate de que el directorio "distFront" se encuentre en la raíz del proyecto
app.use(
  "/",
  express.static(path.join(projectRoot, "distFront"), { redirect: false })
);

// Rutas de la API
app.use("/api/v1", routes());

// Catch-all: sirve el index.html para las demás rutas
app.get("*", (req, res) => {
  return res.sendFile(path.join(projectRoot, "distFront", "index.html"));
});

export default app;
