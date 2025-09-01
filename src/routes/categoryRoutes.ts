import { Router } from "express";
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  updateProductCounts,
  getSubcategories,
  getCategoryPath,
  migrateCategories,
} from "@controllers/categoryController";
import { verifyToken, getPermissions } from "@middlewares/auth";

const router = Router();

// GET /api/v1/categories - Obtener todas las categorías (soporta vista jerárquica)
router.get("/", getCategories);

// GET /api/v1/categories/:id - Obtener categoría por ID
router.get("/:id", getCategoryById);

// GET /api/v1/categories/:id/subcategories - Obtener subcategorías
router.get("/:id/subcategories", getSubcategories);

// GET /api/v1/categories/:id/path - Obtener ruta completa de una categoría
router.get("/:id/path", getCategoryPath);

// POST /api/v1/categories - Crear nueva categoría (soporta jerarquías)
router.post("/", verifyToken, getPermissions, createCategory);

// POST /api/v1/categories/migrate - Migrar categorías existentes (solo admin)
router.post("/migrate", verifyToken, getPermissions, migrateCategories);

// PUT /api/v1/categories/update-counts - Actualizar contadores (solo admin)
router.put("/update-counts", verifyToken, getPermissions, updateProductCounts);

// PUT /api/v1/categories/:id - Actualizar categoría (soporta cambios jerárquicos)
router.put("/:id", verifyToken, getPermissions, updateCategory);

// DELETE /api/v1/categories/:id - Eliminar categoría (valida subcategorías)
router.delete("/:id", verifyToken, getPermissions, deleteCategory);

export default router;
