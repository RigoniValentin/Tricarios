import { Router } from "express";
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  updateProductCounts,
} from "@controllers/categoryController";
import { verifyToken, getPermissions } from "@middlewares/auth";

const router = Router();

// GET /api/v1/categories - Obtener todas las categorías
router.get("/", getCategories);

// GET /api/v1/categories/:id - Obtener categoría por ID
router.get("/:id", getCategoryById);

// POST /api/v1/categories - Crear nueva categoría (solo admin)
router.post("/", verifyToken, getPermissions, createCategory);

// PUT /api/v1/categories/update-counts - Actualizar contadores (solo admin)
router.put("/update-counts", verifyToken, getPermissions, updateProductCounts);

// PUT /api/v1/categories/:id - Actualizar categoría (solo admin)
router.put("/:id", verifyToken, getPermissions, updateCategory);

// DELETE /api/v1/categories/:id - Eliminar categoría (solo admin)
router.delete("/:id", verifyToken, getPermissions, deleteCategory);

export default router;
