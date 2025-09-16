import { Router } from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStock,
  searchProducts,
  getProductImageSlots,
  updateProductImageSlot,
  deleteProductImageSlot,
  reorderProductImageSlot,
} from "@controllers/productControllerNew";
import {
  uploadProductImages,
  uploadSingleProductImage,
  handleUploadError,
} from "@middlewares/upload";

const router = Router();

// GET /api/v1/products/search - Búsqueda avanzada (debe ir antes que /:id)
router.get("/search", searchProducts);

// GET /api/v1/products - Obtener todos los productos (con filtros y paginación)
router.get("/", getProducts);

// GET /api/v1/products/:id - Obtener producto por ID
router.get("/:id", getProductById);

// POST /api/v1/products - Crear nuevo producto (máximo 6 imágenes)
router.post("/", uploadProductImages, handleUploadError, createProduct);

// PUT /api/v1/products/:id - Actualizar producto (máximo 6 imágenes)
router.put("/:id", uploadProductImages, handleUploadError, updateProduct);

// PATCH /api/v1/products/:id/stock - Actualizar solo el stock
router.patch("/:id/stock", updateProductStock);

///////////////////////////////////////////////////////////////////////////////
// 🎯 NUEVAS RUTAS DE SLOTS INDIVIDUALES DE IMÁGENES
///////////////////////////////////////////////////////////////////////////////

// GET /api/v1/products/:id/slots - Obtener información de slots de imágenes
router.get("/:id/slots", getProductImageSlots);

// PUT /api/v1/products/:id/slots/:slot - Actualizar imagen en slot específico (0-5)
router.put(
  "/:id/slots/:slot",
  uploadSingleProductImage,
  handleUploadError,
  updateProductImageSlot
);

// DELETE /api/v1/products/:id/slots/:slot - Eliminar imagen de slot específico (0-5)
router.delete("/:id/slots/:slot", deleteProductImageSlot);

// POST /api/v1/products/:id/slots/reorder - Reordenar imagen entre slots
router.post("/:id/slots/reorder", reorderProductImageSlot);

// DELETE /api/v1/products/:id - Eliminar producto
router.delete("/:id", deleteProduct);

// PUT /api/v1/products/:id/stock - Actualizar stock específicamente
router.put("/:id/stock", updateProductStock);

export default router;
