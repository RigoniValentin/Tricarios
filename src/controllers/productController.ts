import { Request, Response } from "express";
import Product, { IProduct } from "@models/Product";
import Category from "@models/Category";
import path from "path";
import fs from "fs/promises";
import {
  uploadProductImages,
  deleteImageFile,
  cleanupTempFiles,
  validateImageUrl,
  generateImageUrls,
  handleUploadError,
} from "@middlewares/upload";
import uploadMiddleware from "@middlewares/upload";
import {
  IProductSpecifications,
  parseSpecificationsFromString,
  sanitizeSpecifications,
} from "../types/ProductSpecifications";

const MAX_FILES = uploadMiddleware.MAX_FILES;

// Función auxiliar para logging detallado
const logOperation = (operation: string, details: any) => {
  console.log(
    `🔄 [${new Date().toISOString()}] ${operation}:`,
    JSON.stringify(details, null, 2)
  );
};

// Función auxiliar para procesar imágenes
const processImages = (
  files: Express.Multer.File[],
  existingImages: string[] = []
): string[] => {
  logOperation("PROCESANDO_IMAGENES", {
    archivosNuevos: files?.length || 0,
    imagenesExistentes: existingImages.length,
  });

  if (!files || files.length === 0) {
    return existingImages;
  }

  // Generar URLs para los nuevos archivos
  const newImageUrls = files.map(
    (file) => `/uploads/products/${file.filename}`
  );

  // Limitar a máximo 4 imágenes
  const finalImages = newImageUrls.slice(0, MAX_FILES);

  if (newImageUrls.length > MAX_FILES) {
    logOperation("LIMITE_IMAGENES_EXCEDIDO", {
      intentadas: newImageUrls.length,
      maximo: MAX_FILES,
      eliminadas: newImageUrls.length - MAX_FILES,
    });
  }

  return finalImages;
};

// Función para eliminar imágenes anteriores
const cleanupOldImages = async (imagesToDelete: string[]): Promise<void> => {
  if (!imagesToDelete || imagesToDelete.length === 0) return;

  logOperation("ELIMINANDO_IMAGENES_ANTERIORES", {
    cantidad: imagesToDelete.length,
  });

  const deletePromises = imagesToDelete.map(async (imageUrl) => {
    const success = await deleteImageFile(imageUrl);
    return { imageUrl, success };
  });

  const results = await Promise.all(deletePromises);

  logOperation("RESULTADO_ELIMINACION", {
    exitosas: results.filter((r) => r.success).length,
    fallidas: results.filter((r) => !r.success).length,
    detalles: results,
  });
};

// Función auxiliar para formatear producto para el frontend
const formatProductForFrontend = (product: IProduct) => {
  const productObj = product.toObject();
  return {
    id: productObj._id.toString(),
    name: productObj.name,
    description: productObj.description,
    price: productObj.price,
    originalPrice: productObj.originalPrice,
    category: productObj.category,
    categoryId: productObj.categoryId,
    image: productObj.image,
    gallery: productObj.gallery || [],
    inStock: productObj.inStock,
    stockCount: productObj.stockCount,
    rating: productObj.rating,
    reviews: productObj.reviews,
    featured: productObj.featured,
    tags: productObj.tags || [],
    specifications:
      typeof productObj.specifications === "object" &&
      productObj.specifications !== null &&
      !Array.isArray(productObj.specifications)
        ? productObj.specifications
        : {},
    discount:
      productObj.originalPrice && productObj.originalPrice > productObj.price
        ? Math.round(
            ((productObj.originalPrice - productObj.price) /
              productObj.originalPrice) *
              100
          )
        : 0,
    createdAt: productObj.createdAt,
    updatedAt: productObj.updatedAt,
  };
};

// GET /api/v1/products - Obtener todos los productos
export const getProducts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      category,
      categoryId,
      minPrice,
      maxPrice,
      inStock,
      featured,
      tags,
      page = "1",
      limit = "10",
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
    } = req.query;

    // Construir filtros
    let filter: any = {};

    if (category) {
      filter.category = category;
    }

    if (categoryId) {
      filter.categoryId = categoryId;
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    if (inStock === "true") {
      filter.inStock = true;
    } else if (inStock === "false") {
      filter.inStock = false;
    }

    if (featured === "true") {
      filter.featured = true;
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagArray };
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search as string, "i")] } },
      ];
    }

    // Configurar paginación
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    // Configurar ordenamiento
    const sortObj: any = {};
    sortObj[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    // Ejecutar consulta
    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortObj).skip(skip).limit(limitNum),
      Product.countDocuments(filter),
    ]);

    logOperation("PRODUCTOS_OBTENIDOS", {
      total,
      pagina: pageNum,
      limite: limitNum,
      filtros: filter,
      resultados: products.length,
    });

    res.json({
      success: true,
      data: products.map((product) => formatProductForFrontend(product)),
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
    logOperation("ERROR_OBTENER_PRODUCTOS", {
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener los productos",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// GET /api/v1/products/:id - Obtener producto por ID
export const getProductById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    logOperation("PRODUCTO_OBTENIDO", {
      id: product._id,
      name: product.name,
      totalImagenes: product.gallery?.length || 0,
    });

    res.json({
      success: true,
      data: formatProductForFrontend(product),
    });
  } catch (error) {
    logOperation("ERROR_OBTENER_PRODUCTO", {
      id: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener el producto",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// POST /api/v1/products - Crear nuevo producto con sistema de 4 slots
export const createProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    logOperation("CREAR_PRODUCTO_INICIO", { body: req.body });

    const {
      name,
      description,
      price,
      originalPrice,
      category,
      categoryId,
      stockCount,
      rating = 0,
      reviews = 0,
      featured = false,
      tags = [],
      specifications = {},
    } = req.body;
    const files = req.files as Express.Multer.File[];

    // Validación de campos obligatorios
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: "El nombre del producto es requerido",
      });
      return;
    }

    if (
      !description ||
      typeof description !== "string" ||
      description.trim().length === 0
    ) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: "La descripción del producto es requerida",
      });
      return;
    }

    if (!price || isNaN(Number(price)) || Number(price) < 0) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: "El precio debe ser un número válido mayor o igual a 0",
      });
      return;
    }

    if (
      !category ||
      typeof category !== "string" ||
      category.trim().length === 0
    ) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: "El nombre de la categoría es requerido",
      });
      return;
    }

    if (!categoryId) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: "El ID de la categoría es requerido",
      });
      return;
    }

    // Verificar que la categoría existe
    const categoryExists = await Category.findById(categoryId);
    if (!categoryExists) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: "La categoría especificada no existe",
      });
      return;
    }

    // Validar número máximo de imágenes si se proporcionan
    if (files && files.length > MAX_FILES) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: `Solo se permiten máximo ${MAX_FILES} imágenes por producto`,
      });
      return;
    }

    // LOG: Mostrar el contenido de req.body.gallery antes de procesar imágenes
    console.log("[CREATE_PRODUCT] req.body.gallery:", req.body.gallery);

    // Procesar imágenes: si no hay archivos subidos, usar gallery del body
    let imageUrls: string[] = [];
    if (files && files.length > 0) {
      imageUrls = processImages(files || []);
    } else if (Array.isArray(req.body.gallery) && req.body.gallery.length > 0) {
      imageUrls = req.body.gallery.slice(0, MAX_FILES);
    }
    // LOG: Mostrar el array final de imágenes
    console.log("[CREATE_PRODUCT] imageUrls:", imageUrls);
    // Si no hay imágenes, imageUrls será vacío y el modelo pondrá la default

    logOperation("IMAGENES_PROCESADAS", { urls: imageUrls });

    // Parsear tags y specifications si vienen como string
    let parsedTags = tags;
    let parsedSpecs = specifications;

    try {
      if (typeof tags === "string") {
        parsedTags = JSON.parse(tags);
      }
    } catch (error) {
      console.log(
        "Error parsing tags, using as array with single element:",
        error
      );
      parsedTags = [tags];
    }

    try {
      if (typeof specifications === "string") {
        parsedSpecs = parseSpecificationsFromString(specifications);
      } else {
        parsedSpecs = sanitizeSpecifications(specifications);
      }
    } catch (error) {
      console.log(
        "Error processing specifications, using as empty object:",
        error
      );
      parsedSpecs = {};
    }

    // Crear el producto
    const productData = {
      name: name.trim(),
      description: description.trim(),
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      category: category.trim(),
      categoryId,
      gallery: imageUrls,
      stockCount: stockCount ? Number(stockCount) : 0,
      rating: Number(rating),
      reviews: Number(reviews),
      featured: Boolean(featured),
      tags: Array.isArray(parsedTags)
        ? parsedTags
        : parsedTags
        ? [parsedTags]
        : [],
      specifications: parsedSpecs || {},
      // image e inStock serán establecidos automáticamente por los middlewares del modelo
    };

    // LOG: Mostrar datos del producto antes de crear
    console.log(
      "[CREATE_PRODUCT] productData antes de crear:",
      JSON.stringify(productData, null, 2)
    );

    const product = new Product(productData);
    const savedProduct = await product.save();

    logOperation("PRODUCTO_CREADO", {
      id: savedProduct._id,
      name: savedProduct.name,
      imagePrincipal: savedProduct.image,
      totalImagenes: savedProduct.gallery?.length || 0,
    });

    res.status(201).json({
      success: true,
      message: "Producto creado exitosamente",
      data: formatProductForFrontend(savedProduct),
    });
  } catch (error) {
    // Limpiar archivos subidos en caso de error
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      await cleanupTempFiles(files);
    }

    logOperation("ERROR_CREAR_PRODUCTO", {
      error: error instanceof Error ? error.message : error,
      errorName: error instanceof Error ? error.name : "Unknown",
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Log adicional para debugging
    console.log("❌ [CREATE_PRODUCT] Error completo:", error);
    console.log(
      "❌ [CREATE_PRODUCT] Error name:",
      error instanceof Error ? error.name : "Unknown"
    );
    console.log(
      "❌ [CREATE_PRODUCT] Error message:",
      error instanceof Error ? error.message : error
    );

    if (error instanceof Error && error.name === "ValidationError") {
      res.status(400).json({
        success: false,
        message: "Error de validación del producto",
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Error interno al crear el producto",
        error: error instanceof Error ? error.message : error,
      });
    }
  }
};

// PUT /api/v1/products/:id - Actualizar producto con sistema de 4 slots
export const updateProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, price, description, category, stock, replaceImages } =
      req.body;
    const files = req.files as Express.Multer.File[];

    logOperation("ACTUALIZAR_PRODUCTO_INICIO", {
      id,
      body: req.body,
      archivosNuevos: files?.length || 0,
      replaceImages,
      replaceImagesType: typeof replaceImages,
    });

    const product = await Product.findById(id);

    if (!product) {
      await cleanupTempFiles(files);
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    // Validar categoría si se proporciona
    if (category && category !== product.categoryId.toString()) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message: "La categoría especificada no existe",
        });
        return;
      }
    }

    // Actualizar campos básicos
    if (name !== undefined) product.name = name.trim();
    if (price !== undefined) {
      if (isNaN(Number(price)) || Number(price) < 0) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message: "El precio debe ser un número válido mayor o igual a 0",
        });
        return;
      }
      product.price = Number(price);
    }
    if (description !== undefined) product.description = description.trim();
    if (category !== undefined) product.categoryId = category;
    if (stock !== undefined) {
      if (isNaN(Number(stock)) || Number(stock) < 0) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message: "El stock debe ser un número válido mayor o igual a 0",
        });
        return;
      }
      product.stockCount = Number(stock);
    }

    // Función auxiliar para convertir valores a boolean de manera robusta
    const toBooleanSafe = (value: any): boolean => {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
      }
      if (typeof value === "number") {
        return value === 1;
      }
      return false;
    };

    // LOG: Mostrar el contenido de req.body.gallery antes de procesar imágenes
    console.log("[UPDATE_PRODUCT] req.body.gallery:", req.body.gallery);

    // Manejar imágenes - con los slots individuales SIEMPRE reemplazamos
    if (files && files.length > 0) {
      if (files.length > MAX_FILES) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message: `Solo se permiten máximo ${MAX_FILES} imágenes por producto`,
        });
        return;
      }
      logOperation("PROCESANDO_SLOTS_INDIVIDUALES", {
        imagenesAnteriores: product.gallery.length,
        imagenesNuevas: files.length,
        replaceImages: toBooleanSafe(replaceImages),
      });
      await cleanupOldImages(product.gallery);
      const newImages = processImages(files);
      product.gallery = newImages;
      logOperation("IMAGENES_SLOTS_PROCESADAS", {
        total: product.gallery.length,
        urls: product.gallery,
      });
    } else if (Array.isArray(req.body.gallery) && req.body.gallery.length > 0) {
      // LOG: Mostrar el array final de imágenes
      console.log("[UPDATE_PRODUCT] imageUrls:", req.body.gallery);
      // Si no hay archivos pero sí gallery en el body, reemplazar imágenes
      await cleanupOldImages(product.gallery);
      product.gallery = req.body.gallery.slice(0, MAX_FILES);
      logOperation("IMAGENES_SLOTS_PROCESADAS_BODY", {
        total: product.gallery.length,
        urls: product.gallery,
      });
    } else {
      // Si no se envían nuevas imágenes, validar que el producto tenga al menos una imagen existente
      if (product.gallery.length === 0) {
        res.status(400).json({
          success: false,
          message: "El producto debe tener al menos una imagen",
        });
        return;
      }
      logOperation("SIN_NUEVAS_IMAGENES_SLOTS", {
        imagenesExistentes: product.gallery.length,
      });
    }

    const updatedProduct = await product.save();

    logOperation("PRODUCTO_ACTUALIZADO_SLOTS", {
      id: updatedProduct._id,
      name: updatedProduct.name,
      imagePrincipal: updatedProduct.image,
      totalImagenes: updatedProduct.gallery.length,
      imagenesUrls: updatedProduct.gallery,
    });

    res.json({
      success: true,
      message: "Producto actualizado exitosamente",
      data: {
        ...updatedProduct.toObject(),
        imageUrls: updatedProduct.gallery,
      },
    });
  } catch (error) {
    // Limpiar archivos subidos si hay error
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      await cleanupTempFiles(files);
    }

    logOperation("ERROR_ACTUALIZAR_PRODUCTO_SLOTS", {
      id: req.params.id,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof Error && error.name === "ValidationError") {
      res.status(400).json({
        success: false,
        message: "Error de validación",
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Error al actualizar el producto",
        error: error instanceof Error ? error.message : error,
      });
    }
  }
};
// DELETE /api/v1/products/:id - Eliminar producto
export const deleteProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { permanent } = req.query;

    logOperation("INICIO_ELIMINACION_PRODUCTO", {
      id,
      permanent: permanent === "true",
    });

    const product = await Product.findById(id);

    if (!product) {
      logOperation("PRODUCTO_NO_ENCONTRADO", { id });
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    logOperation("PRODUCTO_ENCONTRADO", {
      id: product._id,
      name: product.name,
      imagenes: product.gallery?.length || 0,
    });

    if (permanent === "true") {
      // Eliminación permanente - eliminar también las imágenes
      logOperation("ELIMINACION_PERMANENTE", {
        id: product._id,
        imagenes: product.gallery?.length || 0,
      });

      // Eliminar imágenes si existen
      if (product.gallery && product.gallery.length > 0) {
        try {
          await cleanupOldImages(product.gallery);
          logOperation("IMAGENES_ELIMINADAS_EXITOSAMENTE", {
            cantidad: product.gallery.length,
          });
        } catch (imageError) {
          logOperation("ERROR_ELIMINANDO_IMAGENES", {
            error:
              imageError instanceof Error ? imageError.message : imageError,
          });
          // Continuar con la eliminación del producto aunque falle la eliminación de imágenes
        }
      }

      // Eliminar el producto de la base de datos
      await Product.findByIdAndDelete(id);

      logOperation("PRODUCTO_ELIMINADO_PERMANENTEMENTE", { id });

      res.json({
        success: true,
        message: "Producto eliminado permanentemente",
      });
    } else {
      // Eliminación directa por defecto
      logOperation("ELIMINACION_DIRECTA", {
        id: product._id,
        imagenes: product.gallery?.length || 0,
      });

      // Eliminar imágenes si existen
      if (product.gallery && product.gallery.length > 0) {
        try {
          await cleanupOldImages(product.gallery);
          logOperation("IMAGENES_ELIMINADAS_EXITOSAMENTE", {
            cantidad: product.gallery.length,
          });
        } catch (imageError) {
          logOperation("ERROR_ELIMINANDO_IMAGENES", {
            error:
              imageError instanceof Error ? imageError.message : imageError,
          });
          // Continuar con la eliminación aunque falle la limpieza de imágenes
        }
      }

      // Eliminar el producto de la base de datos
      await Product.findByIdAndDelete(id);
      logOperation("PRODUCTO_ELIMINADO_EXITOSAMENTE", { id });

      res.json({
        success: true,
        message: "Producto eliminado exitosamente",
      });
    }
  } catch (error) {
    logOperation("ERROR_ELIMINAR_PRODUCTO", {
      id: req.params.id,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      message: "Error al eliminar el producto",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// PUT /api/v1/products/:id/stock - Actualizar stock específicamente
export const updateStock = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { stock, operation } = req.body; // operation: 'set', 'add', 'subtract'

    const product = await Product.findById(id);

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    if (typeof stock !== "number" || stock < 0) {
      res.status(400).json({
        success: false,
        message: "El stock debe ser un número válido mayor o igual a 0",
      });
      return;
    }

    const previousStock = product.stockCount;

    switch (operation) {
      case "set":
        product.stockCount = stock;
        break;
      case "add":
        product.stockCount += stock;
        break;
      case "subtract":
        product.stockCount = Math.max(0, product.stockCount - stock);
        break;
      default:
        product.stockCount = stock; // Por defecto, establecer el valor
    }

    const updatedProduct = await product.save();

    logOperation("STOCK_ACTUALIZADO", {
      id: updatedProduct._id,
      operacion: operation || "set",
      stockAnterior: previousStock,
      stockNuevo: updatedProduct.stockCount,
      cambio: stock,
    });

    res.json({
      success: true,
      message: "Stock actualizado exitosamente",
      data: {
        id: updatedProduct._id,
        name: updatedProduct.name,
        previousStock,
        newStock: updatedProduct.stockCount,
        operation,
      },
    });
  } catch (error) {
    logOperation("ERROR_ACTUALIZAR_STOCK", {
      id: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al actualizar el stock",
      error: error instanceof Error ? error.message : error,
    });
  }
};
