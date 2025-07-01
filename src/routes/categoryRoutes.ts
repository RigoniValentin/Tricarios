import { Router } from "express";
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@controllers/categoryController";

const router = Router();

// GET /api/categories - Obtener todas las categorías
router.get("/", getCategories);

// GET /api/categories/:id - Obtener categoría por ID
router.get("/:id", getCategoryById);

// POST /api/categories - Crear nueva categoría
router.post("/", createCategory);

// PUT /api/categories/:id - Actualizar categoría
router.put("/:id", updateCategory);

// DELETE /api/categories/:id - Eliminar categoría
router.delete("/:id", deleteCategory);

export default router;
