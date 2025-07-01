import { Request, Response } from "express";
import Category, { ICategory } from "@models/Category";

// GET /api/categories - Obtener todas las categorías
export const getCategories = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const categories = await Category.find().sort({ name: 1 });

    res.json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error al obtener las categorías",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// GET /api/categories/:id - Obtener categoría por ID
export const getCategoryById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);

    if (!category) {
      res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
      return;
    }

    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error al obtener la categoría",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// POST /api/categories - Crear nueva categoría
export const createCategory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, description } = req.body;

    // Validaciones básicas
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: "El nombre de la categoría es requerido",
      });
      return;
    }

    // Verificar si ya existe una categoría con el mismo nombre
    const existingCategory = await Category.findOne({
      name: name.trim(),
    });

    if (existingCategory) {
      res.status(400).json({
        success: false,
        message: "Ya existe una categoría con ese nombre",
      });
      return;
    }

    const categoryData = {
      name: name.trim(),
      description: description?.trim(),
    };

    const category = new Category(categoryData);
    const savedCategory = await category.save();

    res.status(201).json({
      success: true,
      message: "Categoría creada exitosamente",
      data: savedCategory,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ValidationError") {
      res.status(400).json({
        success: false,
        message: "Error de validación",
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Error al crear la categoría",
        error: error instanceof Error ? error.message : error,
      });
    }
  }
};

// PUT /api/categories/:id - Actualizar categoría
export const updateCategory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const category = await Category.findById(id);

    if (!category) {
      res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
      return;
    }

    // Si se está actualizando el nombre, verificar que no exista otra categoría con el mismo nombre
    if (name && name.trim() !== category.name) {
      const existingCategory = await Category.findOne({
        name: name.trim(),
        _id: { $ne: id }, // Excluir la categoría actual
      });

      if (existingCategory) {
        res.status(400).json({
          success: false,
          message: "Ya existe otra categoría con ese nombre",
        });
        return;
      }
    }

    // Actualizar campos
    if (name !== undefined) category.name = name.trim();
    if (description !== undefined) category.description = description?.trim();

    const updatedCategory = await category.save();

    res.json({
      success: true,
      message: "Categoría actualizada exitosamente",
      data: updatedCategory,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ValidationError") {
      res.status(400).json({
        success: false,
        message: "Error de validación",
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Error al actualizar la categoría",
        error: error instanceof Error ? error.message : error,
      });
    }
  }
};

// DELETE /api/categories/:id - Eliminar categoría
export const deleteCategory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);

    if (!category) {
      res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
      return;
    }

    // Eliminación directa de la base de datos
    await Category.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Categoría eliminada exitosamente",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error al eliminar la categoría",
      error: error instanceof Error ? error.message : error,
    });
  }
};
