import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { Request, Response, NextFunction } from "express";
import { compressUploadedFiles } from "@utils/imageCompressor";

// Tipos permitidos de imágenes
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

// Tamaño máximo por archivo (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Máximo número de archivos
const MAX_FILES = 6;

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: async (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    const uploadDir = path.join(process.cwd(), "uploads", "products");
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      console.error("❌ Error creando directorio de uploads:", error);
      cb(error as Error, "");
    }
  },
  filename: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
    // Generar nombre único para evitar conflictos
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = `product-${uniqueSuffix}${fileExtension}`;

    cb(null, fileName);
  },
});

// Filtro de archivos para validar tipo y tamaño
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Validar tipo de archivo
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    const error = new Error(
      `Tipo de archivo no permitido: ${
        file.mimetype
      }. Solo se permiten: ${ALLOWED_MIME_TYPES.join(", ")}`
    );
    console.error(`❌ ${error.message}`);
    return cb(error);
  }

  // Validar extensión del archivo
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  if (!allowedExtensions.includes(fileExtension)) {
    const error = new Error(
      `Extensión de archivo no permitida: ${fileExtension}. Solo se permiten: ${allowedExtensions.join(
        ", "
      )}`
    );
    console.error(`❌ ${error.message}`);
    return cb(error);
  }
  cb(null, true);
};

// Configuración principal de multer para múltiples archivos
const multerUploadProductImages = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
    fieldSize: 10 * 1024 * 1024, // 10MB para campos de texto
  },
}).array("images", MAX_FILES);

// Wrapper that compresses images after multer upload
export const uploadProductImages = (req: Request, res: Response, next: NextFunction) => {
  multerUploadProductImages(req, res, async (err: any) => {
    if (err) return next(err);
    if (req.files && (req.files as Express.Multer.File[]).length > 0) {
      await compressUploadedFiles(req.files as Express.Multer.File[]);
    }
    next();
  });
};

// Configuración de multer para imagen individual (slots)
const multerUploadSingleProductImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Solo un archivo por vez
    fieldSize: 10 * 1024 * 1024,
  },
}).single("image");

// Wrapper that compresses single image after multer upload
export const uploadSingleProductImage = (req: Request, res: Response, next: NextFunction) => {
  multerUploadSingleProductImage(req, res, async (err: any) => {
    if (err) return next(err);
    if (req.file) {
      await compressUploadedFiles([req.file]);
    }
    next();
  });
};

// Configuración de almacenamiento para blog
const blogStorage = multer.diskStorage({
  destination: async (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    const uploadDir = path.join(process.cwd(), "uploads", "blog");
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, "");
    }
  },
  filename: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = `blog-${uniqueSuffix}${fileExtension}`;
    cb(null, fileName);
  },
});

// Configuración de multer para imagen de blog (portada)
const multerUploadBlogImage = multer({
  storage: blogStorage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fieldSize: 10 * 1024 * 1024,
  },
}).single("coverImage");

// Wrapper that compresses blog image after upload
export const uploadBlogImage = (req: Request, res: Response, next: NextFunction) => {
  multerUploadBlogImage(req, res, async (err: any) => {
    if (err) return next(err);
    if (req.file) {
      await compressUploadedFiles([req.file]);
    }
    next();
  });
};

// Alias para compatibilidad con el controller
export const upload = uploadProductImages;

// Configuración de almacenamiento para avatars
const avatarStorage = multer.diskStorage({
  destination: async (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    const uploadDir = path.join(process.cwd(), "uploads", "avatars");
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, "");
    }
  },
  filename: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = `avatar-${uniqueSuffix}${fileExtension}`;
    cb(null, fileName);
  },
});

// Configuración de multer para avatar de usuario
const multerUploadAvatar = multer({
  storage: avatarStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB para avatars
    files: 1,
  },
}).single("avatar");

// Wrapper that compresses avatar after upload
export const uploadAvatar = (req: Request, res: Response, next: NextFunction) => {
  multerUploadAvatar(req, res, async (err: any) => {
    if (err) return next(err);
    if (req.file) {
      await compressUploadedFiles([req.file]);
    }
    next();
  });
};

// Función auxiliar para eliminar archivos de forma segura
export const deleteImageFile = async (imagePath: string): Promise<boolean> => {
  try {
    if (!imagePath) return false;

    // Si es una URL completa, extraer solo la ruta del archivo
    let filePath = imagePath;
    if (imagePath.startsWith("/uploads/")) {
      filePath = path.join(process.cwd(), imagePath);
    } else if (imagePath.startsWith("http")) {
      // No eliminar URLs externas
      return false;
    }

    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error(`❌ Error eliminando archivo ${imagePath}:`, error);
    return false;
  }
};

// Función para limpiar archivos temporales en caso de error
export const cleanupTempFiles = async (
  files: Express.Multer.File[]
): Promise<void> => {
  if (!files || files.length === 0) return;

  const cleanupPromises = files.map(async (file) => {
    try {
      await fs.unlink(file.path);
    } catch (error) {
      console.error(
        `❌ Error eliminando archivo temporal ${file.filename}:`,
        error
      );
    }
  });

  await Promise.all(cleanupPromises);
};

// Función para validar URLs de imágenes externas
export const validateImageUrl = (url: string): boolean => {
  try {
    const urlObject = new URL(url);
    const validProtocols = ["http:", "https:"];
    const validExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

    const isValidProtocol = validProtocols.includes(urlObject.protocol);
    const hasValidExtension = validExtensions.some((ext) =>
      urlObject.pathname.toLowerCase().endsWith(ext)
    );

    return isValidProtocol && hasValidExtension;
  } catch {
    return false;
  }
};

// Función para generar URLs completas de imágenes
export const generateImageUrls = (
  filenames: string[],
  baseUrl: string = ""
): string[] => {
  return filenames.map((filename) => {
    if (filename.startsWith("http")) {
      return filename; // URL externa
    }
    return `${baseUrl}/uploads/products/${filename}`;
  });
};

// Middleware de manejo de errores para multer
export const handleUploadError = (
  error: any,
  req: Request,
  res: any,
  next: any
) => {
  console.error("❌ Error en upload de imágenes:", error);

  // Limpiar archivos temporales si los hay
  if (req.files) {
    cleanupTempFiles(req.files as Express.Multer.File[]);
  }

  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({
          success: false,
          message: `Archivo demasiado grande. Tamaño máximo permitido: ${
            MAX_FILE_SIZE / (1024 * 1024)
          }MB`,
          error: error.message,
        });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          success: false,
          message: `Demasiados archivos. Máximo permitido: ${MAX_FILES}`,
          error: error.message,
        });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          success: false,
          message: 'Campo de archivo inesperado. Use el campo "images"',
          error: error.message,
        });
      default:
        return res.status(400).json({
          success: false,
          message: "Error en la subida de archivos",
          error: error.message,
        });
    }
  }

  // Error personalizado (tipo de archivo, etc.)
  return res.status(400).json({
    success: false,
    message: error.message || "Error en la validación de archivos",
    error: error.message,
  });
};

// Exportación por defecto con todas las funciones
export default {
  uploadProductImages,
  uploadSingleProductImage, // Nueva función para slots individuales
  upload, // Alias para compatibilidad
  deleteImageFile,
  cleanupTempFiles,
  validateImageUrl,
  generateImageUrls,
  handleUploadError,
  MAX_FILES,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
};
