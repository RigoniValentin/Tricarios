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
      view = "flat", // 'flat' | 'hierarchy'
      page = "1",
      limit = "10",
      sortBy = "name",
      sortOrder = "asc",
      updateCounts = "false",
      parentId, // Filtrar por categoría padre específica
    } = req.query;

    logOperation("OBTENER_CATEGORIAS_INICIO", {
      view,
      search,
      parentId,
      page,
      limit,
    });

    // Actualizar contadores si se solicita
    if (updateCounts === "true") {
      logOperation("ACTUALIZANDO_CONTADORES", { requested: true });
      await Category.updateAllProductCounts();
    }

    if (view === "hierarchy") {
      // Vista jerárquica - construir árbol de categorías
      let filter: any = {};

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      if (parentId) {
        filter.parentCategoryId = parentId === "null" ? null : parentId;
      }

      const categories = await Category.find(filter)
        .populate("parentCategoryId", "name")
        .sort({ name: 1 });

      const hierarchy = await Category.buildHierarchy(categories);

      logOperation("JERARQUIA_CONSTRUIDA", {
        total: categories.length,
        raíces: hierarchy.length,
        filtros: filter,
      });

      res.json({
        success: true,
        data: hierarchy,
        view: "hierarchy",
        total: categories.length,
      });
      return;
    }

    // Vista plana tradicional (COMPATIBILIDAD)
    let filter: any = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (parentId) {
      filter.parentCategoryId = parentId === "null" ? null : parentId;
    }

    // Configurar paginación
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    // Configurar ordenamiento
    const sortObj: any = {};
    sortObj[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    // Ejecutar consulta
    const [categories, total] = await Promise.all([
      Category.find(filter)
        .populate("parentCategoryId", "name")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum),
      Category.countDocuments(filter),
    ]);

    logOperation("CATEGORIAS_OBTENIDAS", {
      total,
      pagina: pageNum,
      limite: limitNum,
      filtros: filter,
      resultados: categories.length,
      view: "flat",
    });

    res.json({
      success: true,
      data: categories,
      view: "flat",
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
    const { name, description, icon, color, parentCategoryId } = req.body;

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

    // Validar categoría padre si se proporciona
    if (parentCategoryId) {
      const parent = await Category.findById(parentCategoryId);
      if (!parent) {
        res.status(400).json({
          success: false,
          message: "Categoría padre no encontrada",
        });
        return;
      }

      // Verificar límite de profundidad
      if (parent.level >= 3) {
        res.status(400).json({
          success: false,
          message:
            "Se ha alcanzado el límite máximo de profundidad (3 niveles)",
        });
        return;
      }
    }

    // Crear la categoría
    const categoryData: any = {
      name: name.trim(),
      description: description.trim(),
      icon: icon?.trim() || "📦",
      color: color?.trim() || "from-gray-400 to-gray-600",
      productCount: 0,
    };

    if (parentCategoryId) {
      categoryData.parentCategoryId = parentCategoryId;
    }

    const category = new Category(categoryData);
    const savedCategory = await category.save();

    // Populate la categoría padre para la respuesta
    await savedCategory.populate("parentCategoryId", "name");

    logOperation("CATEGORIA_CREADA", {
      id: savedCategory._id,
      name: savedCategory.name,
      parentId: savedCategory.parentCategoryId,
      level: savedCategory.level,
      isParent: savedCategory.isParent,
    });

    res.status(201).json({
      success: true,
      message: "Categoría creada exitosamente",
      data: savedCategory,
    });
  } catch (error) {
    logOperation("ERROR_CREAR_CATEGORIA", {
      body: req.body,
      error: error instanceof Error ? error.message : error,
    });

    res.status(400).json({
      success: false,
      message: "Error al crear la categoría",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// PUT /api/v1/categories/:id - Actualizar categoría
export const updateCategory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, icon, color, parentCategoryId } = req.body;

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

    // Validar cambio de categoría padre si se proporciona
    if (parentCategoryId !== undefined) {
      if (parentCategoryId) {
        // Verificar que la categoría padre existe
        const parent = await Category.findById(parentCategoryId);
        if (!parent) {
          res.status(400).json({
            success: false,
            message: "Categoría padre no encontrada",
          });
          return;
        }

        // Verificar que no sea la misma categoría
        if (parentCategoryId === id) {
          res.status(400).json({
            success: false,
            message: "Una categoría no puede ser padre de sí misma",
          });
          return;
        }

        // Verificar límite de profundidad
        if (parent.level >= 3) {
          res.status(400).json({
            success: false,
            message:
              "Se ha alcanzado el límite máximo de profundidad (3 niveles)",
          });
          return;
        }

        // Verificar que no se cree una referencia circular
        let current: ICategory | null = parent;
        const visitedIds = new Set<string>();

        while (current && current.parentCategoryId) {
          const currentId = current._id?.toString();
          if (!currentId) break;

          if (visitedIds.has(currentId) || currentId === id) {
            res.status(400).json({
              success: false,
              message:
                "Esta operación crearía una referencia circular en la jerarquía",
            });
            return;
          }

          visitedIds.add(currentId);
          current = await Category.findById(current.parentCategoryId);
          if (!current) break;
        }

        category.parentCategoryId = parentCategoryId;
      } else {
        // Eliminar categoría padre (convertir a raíz)
        category.parentCategoryId = null;
      }
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

    // Populate la categoría padre para la respuesta
    await updatedCategory.populate("parentCategoryId", "name");

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
      parentId: updatedCategory.parentCategoryId,
      level: updatedCategory.level,
      isParent: updatedCategory.isParent,
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

    // Verificar si tiene subcategorías
    const subcategoriesCount = await Category.countDocuments({
      parentCategoryId: id,
    });

    if (subcategoriesCount > 0) {
      res.status(400).json({
        success: false,
        message: `No se puede eliminar una categoría que tiene ${subcategoriesCount} subcategoría(s). Elimine primero las subcategorías.`,
        data: {
          categoryId: id,
          categoryName: category.name,
          subcategoriesCount,
        },
      });
      return;
    }

    // Verificar productos asociados
    const productsCount = await Product.countDocuments({ categoryId: id });

    logOperation("CATEGORIA_ENCONTRADA", {
      id: category._id,
      name: category.name,
      productosAsociados: productsCount,
      subcategorias: subcategoriesCount,
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

// GET /api/v1/categories/:id/subcategories - Obtener subcategorías de una categoría
export const getSubcategories = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { page = "1", limit = "10", includeProducts = "false" } = req.query;

    logOperation("OBTENER_SUBCATEGORIAS", { parentId: id });

    // Verificar que la categoría padre existe
    const parentCategory = await Category.findById(id);
    if (!parentCategory) {
      res.status(404).json({
        success: false,
        message: "Categoría padre no encontrada",
      });
      return;
    }

    // Configurar paginación
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    // Obtener subcategorías
    const [subcategories, total] = await Promise.all([
      Category.find({ parentCategoryId: id })
        .populate("parentCategoryId", "name")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum),
      Category.countDocuments({ parentCategoryId: id }),
    ]);

    // Incluir productos si se solicita
    let responseData: any = subcategories;
    if (includeProducts === "true") {
      responseData = await Promise.all(
        subcategories.map(async (category) => {
          const products = await Product.find({ categoryId: category._id })
            .select("name price image stockCount featured")
            .limit(5);
          return {
            ...category.toObject(),
            products,
          };
        })
      );
    }

    logOperation("SUBCATEGORIAS_OBTENIDAS", {
      parentId: id,
      total,
      resultados: subcategories.length,
    });

    res.json({
      success: true,
      data: responseData,
      parentCategory: {
        id: parentCategory._id,
        name: parentCategory.name,
        level: parentCategory.level,
      },
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
    logOperation("ERROR_OBTENER_SUBCATEGORIAS", {
      parentId: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener las subcategorías",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// GET /api/v1/categories/:id/path - Obtener ruta completa de una categoría
export const getCategoryPath = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    logOperation("OBTENER_RUTA_CATEGORIA", { categoryId: id });

    // Construir ruta desde la categoría hasta la raíz
    const path: ICategory[] = [];
    let current = await Category.findById(id).populate("parentCategoryId");

    if (!current) {
      res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
      return;
    }

    // Construir ruta hacia arriba
    while (current) {
      path.unshift(current);
      if (
        current.parentCategoryId &&
        typeof current.parentCategoryId === "object"
      ) {
        current = current.parentCategoryId as any;
      } else {
        current = null;
      }
    }

    logOperation("RUTA_CATEGORIA_OBTENIDA", {
      categoryId: id,
      pathLength: path.length,
      path: path.map((cat) => ({
        id: cat._id,
        name: cat.name,
        level: cat.level,
      })),
    });

    res.json({
      success: true,
      data: {
        path,
        depth: path.length,
        rootCategory: path[0],
        targetCategory: path[path.length - 1],
      },
    });
  } catch (error) {
    logOperation("ERROR_OBTENER_RUTA_CATEGORIA", {
      categoryId: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener la ruta de la categoría",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// POST /api/v1/categories/migrate - Migrar categorías existentes
export const migrateCategories = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    logOperation("INICIANDO_MIGRACION_CATEGORIAS", {});

    const result = await Category.migrateExistingCategories();

    logOperation("MIGRACION_COMPLETADA", {
      categoriasActualizadas: result.modifiedCount,
    });

    res.json({
      success: true,
      message: "Migración de categorías completada exitosamente",
      data: {
        modifiedCount: result.modifiedCount,
        message: `${result.modifiedCount} categorías fueron actualizadas con los nuevos campos jerárquicos`,
      },
    });
  } catch (error) {
    logOperation("ERROR_MIGRACION_CATEGORIAS", {
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al migrar las categorías",
      error: error instanceof Error ? error.message : error,
    });
  }
};
