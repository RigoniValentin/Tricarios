import { Router } from "express";
import { uploadProductImages, handleUploadError } from "@middlewares/upload";
import { Request, Response } from "express";

const router = Router();

// Función auxiliar para logging (copiada del controlador)
const logOperation = (_operation: string, _details: any) => undefined;

// POST /upload/products - Subir imágenes de productos y devolver URLs
router.post(
  "/products",
  uploadProductImages,
  handleUploadError,
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          message: "No se proporcionaron archivos para subir",
        });
        return;
      }

      // Generar URLs de las imágenes subidas
      const imageUrls = files.map(
        (file) => `/uploads/products/${file.filename}`
      );

      logOperation?.("IMAGENES_SUBIDAS", {
        cantidad: files.length,
        urls: imageUrls,
      });

      res.json({
        success: true,
        message: `${files.length} imagen(es) subida(s) exitosamente`,
        data: {
          imageUrls,
          count: files.length,
        },
      });
    } catch (error) {
      console.error("Error subiendo imágenes:", error);
      res.status(500).json({
        success: false,
        message: "Error interno al subir las imágenes",
        error: error instanceof Error ? error.message : error,
      });
    }
  }
);

export default router;
