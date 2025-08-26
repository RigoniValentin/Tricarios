import { Request, Response } from "express";
import Category, { ICategory } from "@models/Category";
import Product from "@models/Product";

// Función auxiliar para logging
const logOperation = (operation: string, details: any) => {
  console.log(
    `🏷️  [${new Date().toISOString()}] ${operation}:`,
    JSON.stringify(details, null, 2)
  );
};

// GET /api/v1/categories - Obtener todas las categorías
export const getCategories = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search,
      page = "1",
      limit = "10",
      sortBy = "name",
      sortOrder = "asc",
      updateCounts = "false",
    } = req.query;

    // Construir filtros
    let filter: any = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Configurar paginación
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    // Configurar ordenamiento
    const sortObj: any = {};
    sortObj[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    // Actualizar contadores si se solicita
    if (updateCounts === "true") {
      logOperation("ACTUALIZANDO_CONTADORES", { requested: true });
      await Category.updateAllProductCounts();
    }

    // Ejecutar consulta
    const [categories, total] = await Promise.all([
      Category.find(filter).sort(sortObj).skip(skip).limit(limitNum),
      Category.countDocuments(filter),
    ]);

    logOperation("CATEGORIAS_OBTENIDAS", {
      total,
      pagina: pageNum,
      limite: limitNum,
      filtros: filter,
      resultados: categories.length,
    });

    res.json({
      success: true,
      data: categories,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    logOperation("ERROR_OBTENER_CATEGORIAS", {
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener las categorías",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// GET /api/v1/categories/:id - Obtener categoría por ID
export const getCategoryById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { includeProducts = "false" } = req.query;

    const category = await Category.findById(id);

    if (!category) {
      res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
      return;
    }

    let responseData: any = category.toObject();

    // Incluir productos si se solicita
    if (includeProducts === "true") {
      const products = await Product.find({ categoryId: id }).select(
        "name price image stockCount featured"
      );
      responseData.products = products;
    }

    logOperation("CATEGORIA_OBTENIDA", {
      id: category._id,
      name: category.name,
      productCount: category.productCount,
      includeProducts: includeProducts === "true",
    });

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    logOperation("ERROR_OBTENER_CATEGORIA", {
      id: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener la categoría",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// POST /api/v1/categories - Crear nueva categoría
export const createCategory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, description, icon, color } = req.body;

    logOperation("CREAR_CATEGORIA_INICIO", { body: req.body });

    // Validación de campos obligatorios
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: "El nombre de la categoría es requerido",
      });
      return;
    }

    if (
      !description ||
      typeof description !== "string" ||
      description.trim().length === 0
    ) {
      res.status(400).json({
        success: false,
        message: "La descripción de la categoría es requerida",
      });
      return;
    }

    // Verificar que el nombre sea único
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });

    if (existingCategory) {
      res.status(400).json({
        success: false,
        message: "Ya existe una categoría con ese nombre",
      });
      return;
    }

    // Crear la categoría
    const categoryData = {
      name: name.trim(),
      description: description.trim(),
      icon: icon?.trim() || "📦",
      color: color?.trim() || "from-gray-400 to-gray-600",
      productCount: 0,
    };

    const category = new Category(categoryData);
    const savedCategory = await category.save();

    logOperation("CATEGORIA_CREADA", {
      id: savedCategory._id,
      name: savedCategory.name,
      icon: savedCategory.icon,
      color: savedCategory.color,
    });

    res.status(201).json({
      success: true,
      message: "Categoría creada exitosamente",
      data: savedCategory,
    });
  } catch (error) {
    logOperation("ERROR_CREAR_CATEGORIA", {
      error: error instanceof Error ? error.message : error,
    });

    if (error instanceof Error && error.name === "ValidationError") {
      res.status(400).json({
        success: false,
        message: "Error de validación de la categoría",
        error: error.message,
      });
    } else if (error instanceof Error && (error as any).code === 11000) {
      res.status(400).json({
        success: false,
        message: "Ya existe una categoría con ese nombre",
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Error interno al crear la categoría",
        error: error instanceof Error ? error.message : error,
      });
    }
  }
};

// PUT /api/v1/categories/:id - Actualizar categoría
export const updateCategory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, icon, color } = req.body;

    logOperation("ACTUALIZAR_CATEGORIA_INICIO", {
      id,
      body: req.body,
    });

    const category = await Category.findById(id);

    if (!category) {
      res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
      return;
    }

    // Validar nombre único si se está cambiando
    if (name && name.trim() !== category.name) {
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
        _id: { $ne: id },
      });

      if (existingCategory) {
        res.status(400).json({
          success: false,
          message: "Ya existe una categoría con ese nombre",
        });
        return;
      }
    }

    // Actualizar campos
    if (name !== undefined) {
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: "El nombre de la categoría es requerido",
        });
        return;
      }
      category.name = name.trim();
    }

    if (description !== undefined) {
      if (
        !description ||
        typeof description !== "string" ||
        description.trim().length === 0
      ) {
        res.status(400).json({
          success: false,
          message: "La descripción de la categoría es requerida",
        });
        return;
      }
      category.description = description.trim();
    }

    if (icon !== undefined) category.icon = icon?.trim() || "📦";
    if (color !== undefined)
      category.color = color?.trim() || "from-gray-400 to-gray-600";

    const updatedCategory = await category.save();

    // Si se cambió el nombre, actualizar los productos asociados
    if (name && name.trim() !== category.name) {
      await Product.updateMany(
        { categoryId: id },
        { category: updatedCategory.name }
      );
      logOperation("PRODUCTOS_ACTUALIZADOS_CATEGORIA", {
        categoriaId: id,
        nuevoNombre: updatedCategory.name,
      });
    }

    logOperation("CATEGORIA_ACTUALIZADA", {
      id: updatedCategory._id,
      name: updatedCategory.name,
      cambios: req.body,
    });

    res.json({
      success: true,
      message: "Categoría actualizada exitosamente",
      data: updatedCategory,
    });
  } catch (error) {
    logOperation("ERROR_ACTUALIZAR_CATEGORIA", {
      id: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    if (error instanceof Error && error.name === "ValidationError") {
      res.status(400).json({
        success: false,
        message: "Error de validación",
        error: error.message,
      });
    } else if (error instanceof Error && (error as any).code === 11000) {
      res.status(400).json({
        success: false,
        message: "Ya existe una categoría con ese nombre",
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

// DELETE /api/v1/categories/:id - Eliminar categoría
export const deleteCategory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { deleteProducts = "false" } = req.query;

    logOperation("INICIO_ELIMINACION_CATEGORIA", {
      id,
      deleteProducts: deleteProducts === "true",
    });

    const category = await Category.findById(id);

    if (!category) {
      res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
      return;
    }

    // Verificar productos asociados
    const productsCount = await Product.countDocuments({ categoryId: id });

    logOperation("CATEGORIA_ENCONTRADA", {
      id: category._id,
      name: category.name,
      productosAsociados: productsCount,
    });

    if (productsCount > 0) {
      if (deleteProducts === "true") {
        // Eliminar todos los productos de la categoría
        const deletedProducts = await Product.deleteMany({ categoryId: id });
        logOperation("PRODUCTOS_ELIMINADOS", {
          cantidad: deletedProducts.deletedCount,
        });
      } else {
        // No permitir eliminar categoría con productos
        res.status(400).json({
          success: false,
          message: `No se puede eliminar la categoría porque tiene ${productsCount} producto(s) asociado(s). Use deleteProducts=true para eliminar también los productos.`,
          data: {
            categoryId: id,
            categoryName: category.name,
            productsCount,
          },
        });
        return;
      }
    }

    // Eliminar la categoría
    await Category.findByIdAndDelete(id);

    logOperation("CATEGORIA_ELIMINADA", {
      id,
      name: category.name,
      productosEliminados: deleteProducts === "true" ? productsCount : 0,
    });

    res.json({
      success: true,
      message: "Categoría eliminada exitosamente",
      data: {
        deletedCategory: {
          id: category._id,
          name: category.name,
        },
        deletedProductsCount: deleteProducts === "true" ? productsCount : 0,
      },
    });
  } catch (error) {
    logOperation("ERROR_ELIMINAR_CATEGORIA", {
      id: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al eliminar la categoría",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// PUT /api/v1/categories/update-counts - Actualizar contadores de productos
export const updateProductCounts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    logOperation("ACTUALIZANDO_CONTADORES_MANUALES", {});

    const categories = await Category.updateAllProductCounts();

    logOperation("CONTADORES_ACTUALIZADOS", {
      totalCategorias: categories.length,
      contadores: categories.map((cat) => ({
        id: cat._id,
        name: cat.name,
        productCount: cat.productCount,
      })),
    });

    res.json({
      success: true,
      message: "Contadores de productos actualizados exitosamente",
      data: {
        updatedCategories: categories.length,
        categories: categories.map((cat) => ({
          id: cat._id,
          name: cat.name,
          productCount: cat.productCount,
        })),
      },
    });
  } catch (error) {
    logOperation("ERROR_ACTUALIZAR_CONTADORES", {
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al actualizar los contadores",
      error: error instanceof Error ? error.message : error,
    });
  }
};
