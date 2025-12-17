import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  getActiveSlides,
  getAllSlides,
  getSlideById,
  createSlide,
  updateSlide,
  updateMultipleSlides,
  deleteSlide,
  initializeDefaultSlides,
} from "@controllers/heroSlideController";
import { verifyToken, getPermissions } from "@middlewares/auth";

const router = Router();

// Configuración de multer para slides
const slidesUploadDir = path.join(process.cwd(), "uploads", "slides");

// Crear directorio si no existe
if (!fs.existsSync(slidesUploadDir)) {
  fs.mkdirSync(slidesUploadDir, { recursive: true });
}

const slideStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, slidesUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `slide-${uniqueSuffix}${ext}`);
  },
});

const slideFileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
  }
};

const uploadSlideImage = multer({
  storage: slideStorage,
  fileFilter: slideFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
  },
}).single("image");

// Rutas públicas (para el frontend)
router.get("/active", getActiveSlides);

// Rutas protegidas (para admin)
router.get("/", verifyToken, getPermissions, getAllSlides);
router.get("/:id", verifyToken, getPermissions, getSlideById);
router.post("/", verifyToken, getPermissions, uploadSlideImage, createSlide);
router.post(
  "/initialize",
  verifyToken,
  getPermissions,
  initializeDefaultSlides
);
router.put("/bulk", verifyToken, getPermissions, updateMultipleSlides);
router.put("/:id", verifyToken, getPermissions, uploadSlideImage, updateSlide);
router.delete("/:id", verifyToken, getPermissions, deleteSlide);

export default router;
