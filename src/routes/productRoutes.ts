import { Router } from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStock,
} from "@controllers/productControllerNew";
import { uploadProductImages, handleUploadError } from "@middlewares/upload";

const router = Router();

// GET /api/v1/products - Obtener todos los productos (con filtros y paginación)
router.get("/", getProducts);

// GET /api/v1/products/:id - Obtener producto por ID
router.get("/:id", getProductById);

// POST /api/v1/products - Crear nuevo producto (máximo 4 imágenes)
router.post("/", uploadProductImages, handleUploadError, createProduct);

// PUT /api/v1/products/:id - Actualizar producto (máximo 4 imágenes)
router.put("/:id", uploadProductImages, handleUploadError, updateProduct);

// DELETE /api/v1/products/:id - Eliminar producto
router.delete("/:id", deleteProduct);

// PUT /api/v1/products/:id/stock - Actualizar stock específicamente
router.put("/:id/stock", updateProductStock);

export default router;
