import path from "path";
import routes from "@routes/routes";
import express, { Application } from "express";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";

const app: Application = express();

// Configurar cookie-parser
app.use(cookieParser());

app.use(express.json());
app.use(morgan("dev"));

app.use(cors());

app.use("/", express.static("distFront", { redirect: false }));
app.use("/api/v1", routes());

app.get("*", (req, res, next) => {
  return res.sendFile(path.resolve("distFront", "index.html"));
});

export default app;
