import { Request, Response } from "express";
import Product, { IProduct } from "@models/Product";
import Category from "@models/Category";
import path from "path";
import fs from "fs/promises";
import {
  uploadProductImages,
  uploadSingleProductImage,
  deleteImageFile,
  cleanupTempFiles,
  validateImageUrl,
  generateImageUrls,
  handleUploadError,
} from "@middlewares/upload";
import uploadMiddleware from "@middlewares/upload";
import { pullCatalogProductByManagementId } from "@services/rgIntegration.service";

const MAX_FILES = uploadMiddleware.MAX_FILES;

type ProductRGSyncField = "name" | "price" | "stockCount";

interface ProductRGSyncInfo {
  attempted: boolean;
  synchronized: boolean;
  managementId: number;
  message: string;
  updatedFields: ProductRGSyncField[];
  currentValues?: {
    name: string;
    price: number;
    stockCount: number;
  };
}

const syncSavedProductWithRG = async (
  productId: string,
  managementId: number,
  snapshotBeforeSync: {
    name: string;
    price: number;
    stockCount: number;
  },
): Promise<{ product: any; rgSync: ProductRGSyncInfo }> => {
  try {
    const syncResult = await pullCatalogProductByManagementId(managementId);
    const finalProduct = await Product.findById(productId);
    const updatedFields: ProductRGSyncField[] = [];

    if (finalProduct) {
      if (finalProduct.name !== snapshotBeforeSync.name) {
        updatedFields.push("name");
      }
      if (Number(finalProduct.price) !== Number(snapshotBeforeSync.price)) {
        updatedFields.push("price");
      }
      if (Number(finalProduct.stockCount) !== Number(snapshotBeforeSync.stockCount)) {
        updatedFields.push("stockCount");
      }
    }

    return {
      product: finalProduct,
      rgSync: {
        attempted: true,
        synchronized: syncResult.ok,
        managementId,
        message: syncResult.ok
          ? updatedFields.length > 0
            ? "Río Gestión actualizó el producto vinculado"
            : "El producto ya estaba sincronizado con Río Gestión"
          : syncResult.message,
        updatedFields,
        currentValues: finalProduct
          ? {
              name: finalProduct.name,
              price: Number(finalProduct.price),
              stockCount: Number(finalProduct.stockCount),
            }
          : undefined,
      },
    };
  } catch (error) {
    return {
      product: await Product.findById(productId),
      rgSync: {
        attempted: true,
        synchronized: false,
        managementId,
        message:
          error instanceof Error
            ? error.message
            : "No se pudo sincronizar con Río Gestión",
        updatedFields: [],
      },
    };
  }
};

// Función auxiliar para logging detallado
const logOperation = (_operation: string, _details: any) => undefined;

// Función auxiliar para procesar imágenes
const processImages = (
  files: Express.Multer.File[],
  existingImages: string[] = [],
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
    (file) => `/uploads/products/${file.filename}`,
  );

  // Combinar imágenes existentes con nuevas
  const allImages = [...existingImages, ...newImageUrls];

  // Limitar a máximo 6 imágenes (tomar las primeras 6)
  const finalImages = allImages.slice(0, MAX_FILES);

  if (allImages.length > MAX_FILES) {
    logOperation("LIMITE_IMAGENES_EXCEDIDO", {
      imagenesExistentes: existingImages.length,
      imagenesNuevas: newImageUrls.length,
      totalIntentas: allImages.length,
      maximo: MAX_FILES,
      eliminadas: allImages.length - MAX_FILES,
    });
  }

  logOperation("IMAGENES_PROCESADAS", {
    existentes: existingImages.length,
    nuevas: newImageUrls.length,
    final: finalImages.length,
    urls: finalImages,
  });

  return finalImages;
};

// Función auxiliar para procesar imágenes en modo reemplazo
const processImagesReplace = (files: Express.Multer.File[]): string[] => {
  logOperation("PROCESANDO_IMAGENES_REEMPLAZO", {
    archivosNuevos: files?.length || 0,
  });

  if (!files || files.length === 0) {
    return [];
  }

  // Generar URLs para los nuevos archivos
  const newImageUrls = files.map(
    (file) => `/uploads/products/${file.filename}`,
  );

  // Limitar a máximo 6 imágenes
  const finalImages = newImageUrls.slice(0, MAX_FILES);

  if (newImageUrls.length > MAX_FILES) {
    logOperation("LIMITE_IMAGENES_EXCEDIDO_REEMPLAZO", {
      intentadas: newImageUrls.length,
      maximo: MAX_FILES,
      eliminadas: newImageUrls.length - MAX_FILES,
    });
  }

  logOperation("IMAGENES_PROCESADAS_REEMPLAZO", {
    nuevas: newImageUrls.length,
    final: finalImages.length,
    urls: finalImages,
  });

  return finalImages;
};

const normalizeImagePath = (imagePath: string): string => {
  const trimmed = imagePath.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("/uploads/")) return trimmed;
  if (trimmed.startsWith("uploads/")) return `/${trimmed}`;

  try {
    const url = new URL(trimmed);
    if (url.pathname.startsWith("/uploads/products/")) {
      return url.pathname;
    }
  } catch {
    // Mantener URLs externas o rutas no parseables tal como llegan.
  }

  return trimmed;
};

const normalizeGalleryInput = (galleryInput: any): string[] => {
  let values: any[] = [];

  if (Array.isArray(galleryInput)) {
    values = galleryInput;
  } else if (typeof galleryInput === "string") {
    const trimmed = galleryInput.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      values = Array.isArray(parsed) ? parsed : [trimmed];
    } catch {
      values = [trimmed];
    }
  }

  return values
    .filter((value) => typeof value === "string")
    .map((value) => normalizeImagePath(value))
    .filter(Boolean)
    .slice(0, MAX_FILES);
};

const getRemovedLocalImages = (
  previousImages: string[] = [],
  nextImages: string[] = [],
): string[] => {
  const nextSet = new Set(nextImages.map((image) => normalizeImagePath(image)));
  return previousImages
    .map((image) => normalizeImagePath(image))
    .filter((image) => image.startsWith("/uploads/") && !nextSet.has(image));
};

const getEntityId = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return value._id.toString();
  if (value.id) return value.id.toString();
  return value.toString ? value.toString() : "";
};

// Función para eliminar imágenes anteriores
const cleanupOldImages = async (imagesToDelete: string[]): Promise<void> => {
  if (!imagesToDelete || imagesToDelete.length === 0) return;

  logOperation("ELIMINANDO_IMAGENES_ANTERIORES", {
    cantidad: imagesToDelete.length,
  });

  const deletePromises = imagesToDelete.map(async (imageUrl) => {
    const normalizedImageUrl = normalizeImagePath(imageUrl);
    const success = await deleteImageFile(normalizedImageUrl);
    return { imageUrl: normalizedImageUrl, success };
  });

  const results = await Promise.all(deletePromises);

  logOperation("RESULTADO_ELIMINACION", {
    exitosas: results.filter((r) => r.success).length,
    fallidas: results.filter((r) => !r.success).length,
    detalles: results,
  });
};

// GET /api/v1/products - Obtener todos los productos
export const getProducts = async (
  req: Request,
  res: Response,
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
      rgLink,
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

    const rgLinkCondition =
      rgLink === "linked"
        ? { managementId: { $exists: true, $nin: [null, 0] } }
        : rgLink === "unlinked"
          ? {
              $or: [
                { managementId: { $exists: false } },
                { managementId: null },
                { managementId: 0 },
              ],
            }
          : null;

    if (search) {
      // Importar utilidades de búsqueda
      const { createSearchQueries, normalizeSearchTerm, extractSearchWords } =
        await import("@utils/searchUtils");

      const searchTerm = search as string;
      const normalizedSearch = normalizeSearchTerm(searchTerm);

      // Si la búsqueda está vacía después de normalizar, no aplicar filtro de búsqueda
      if (!normalizedSearch) {
        logOperation("BUSQUEDA_VACIA", { searchTerm, normalizedSearch });
      } else {
        const {
          exactMatchQuery,
          partialTermQuery,
          allWordsQuery,
          anyWordQuery,
        } = createSearchQueries(searchTerm);

        logOperation("EJECUTANDO_BUSQUEDA_INTELIGENTE", {
          searchTerm,
          normalizedSearch,
          words: extractSearchWords(searchTerm),
        });

        // Crear query de búsqueda flexible - combinando todas las opciones
        const searchConditions: any[] = [];

        // Agregar condiciones de coincidencia exacta
        if (exactMatchQuery.$or) {
          searchConditions.push(...exactMatchQuery.$or);
        }

        // Agregar condiciones de coincidencia parcial
        if (partialTermQuery.$or) {
          searchConditions.push(...partialTermQuery.$or);
        }

        // Agregar query de todas las palabras (si hay múltiples palabras)
        if (allWordsQuery) {
          searchConditions.push(allWordsQuery);
        }

        // Agregar query de cualquier palabra (si hay múltiples palabras)
        if (anyWordQuery) {
          searchConditions.push(anyWordQuery);
        }

        // Asignar todas las condiciones al filtro
        if (rgLinkCondition) {
          filter = {
            ...filter,
            $and: [{ $or: searchConditions }, rgLinkCondition],
          };
        } else {
          filter.$or = searchConditions;
        }

        logOperation("FILTRO_BUSQUEDA_GENERADO", {
          totalConditions: searchConditions.length,
          sample: searchConditions.slice(0, 3),
        });
      }
    } else if (rgLinkCondition) {
      filter = { ...filter, ...rgLinkCondition };
    }

    // Configurar paginación
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    // Configurar ordenamiento
    const sortObj: any = {};
    sortObj[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    // Ejecutar consulta
    let products: any[];
    let total: number;

    if (search) {
      // Si hay búsqueda, aplicar ordenamiento por relevancia
      const { sortByRelevance } = await import("@utils/searchUtils");

      // Obtener todos los productos que coinciden con la búsqueda (sin paginación inicial)
      const allMatchingProducts = await Product.find(filter);

      // Ordenar por relevancia
      const sortedProducts = sortByRelevance(
        allMatchingProducts,
        search as string,
      );

      // Aplicar paginación después del ordenamiento por relevancia
      products = sortedProducts.slice(skip, skip + limitNum);
      total = sortedProducts.length;

      logOperation("PRODUCTOS_ORDENADOS_POR_RELEVANCIA", {
        total: sortedProducts.length,
        muestra: sortedProducts.slice(0, 3).map((p) => ({
          name: p.name,
          relevanceScore: p.relevanceScore,
        })),
      });
    } else {
      // Si no hay búsqueda, usar ordenamiento normal con paginación eficiente
      [products, total] = await Promise.all([
        Product.find(filter).sort(sortObj).skip(skip).limit(limitNum),
        Product.countDocuments(filter),
      ]);
    }

    logOperation("PRODUCTOS_OBTENIDOS", {
      total,
      pagina: pageNum,
      limite: limitNum,
      filtros: filter,
      resultados: products.length,
      conBusqueda: !!search,
    });

    res.json({
      success: true,
      data: products,
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

// GET /api/v1/products/search - Búsqueda avanzada con scoring de relevancia
export const searchProducts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      q: search,
      category,
      categoryId,
      minPrice,
      maxPrice,
      inStock,
      featured,
      tags,
      rgLink,
      page = "1",
      limit = "10",
      includeScore = "false",
    } = req.query;

    if (!search) {
      res.status(400).json({
        success: false,
        message: "Parámetro de búsqueda 'q' es requerido",
      });
      return;
    }

    try {
      const {
        createSearchQueries,
        normalizeSearchTerm,
        extractSearchWords,
        sortByRelevance,
      } = await import("@utils/searchUtils");

      const searchTerm = search as string;
      const normalizedSearch = normalizeSearchTerm(searchTerm);
      logOperation("BUSQUEDA_AVANZADA_INICIADA", {
        searchTerm,
        normalizedSearch,
        words: extractSearchWords(searchTerm),
        includeScore: includeScore === "true",
      });

      // Construir filtros adicionales
      let additionalFilters: any = {};

      if (category) {
        additionalFilters.category = category;
      }

      if (categoryId) {
        additionalFilters.categoryId = categoryId;
      }

      if (minPrice || maxPrice) {
        additionalFilters.price = {};
        if (minPrice) additionalFilters.price.$gte = Number(minPrice);
        if (maxPrice) additionalFilters.price.$lte = Number(maxPrice);
      }

      if (inStock === "true") {
        additionalFilters.inStock = true;
      } else if (inStock === "false") {
        additionalFilters.inStock = false;
      }

      if (featured === "true") {
        additionalFilters.featured = true;
      }

      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        additionalFilters.tags = { $in: tagArray };
      }

      const rgLinkCondition =
        rgLink === "linked"
          ? { managementId: { $exists: true, $nin: [null, 0] } }
          : rgLink === "unlinked"
            ? {
                $or: [
                  { managementId: { $exists: false } },
                  { managementId: null },
                  { managementId: 0 },
                ],
              }
            : null;

      // Crear queries de búsqueda
      const { exactMatchQuery, partialTermQuery, allWordsQuery, anyWordQuery } =
        createSearchQueries(searchTerm);

      // Combinar queries de búsqueda
      const searchConditions: any[] = [];

      if (exactMatchQuery.$or) {
        searchConditions.push(...exactMatchQuery.$or);
      }

      if (partialTermQuery.$or) {
        searchConditions.push(...partialTermQuery.$or);
      }

      if (allWordsQuery) {
        searchConditions.push(allWordsQuery);
      }

      if (anyWordQuery) {
        searchConditions.push(anyWordQuery);
      }

      // Combinar filtros de búsqueda y adicionales
      const finalFilter = rgLinkCondition
        ? {
            ...additionalFilters,
            $and: [{ $or: searchConditions }, rgLinkCondition],
          }
        : {
            ...additionalFilters,
            $or: searchConditions,
          };

      // Configurar paginación
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
      const skip = (pageNum - 1) * limitNum;

      // Obtener todos los productos que coinciden
      const allMatchingProducts = await Product.find(finalFilter);

      // Ordenar por relevancia
      const sortedProducts = sortByRelevance(allMatchingProducts, searchTerm);

      // Aplicar paginación
      const paginatedProducts = sortedProducts.slice(skip, skip + limitNum);
      const total = sortedProducts.length;

      logOperation("BUSQUEDA_AVANZADA_COMPLETADA", {
        total,
        pagina: pageNum,
        limite: limitNum,
        resultados: paginatedProducts.length,
        mejorScore: paginatedProducts[0]?.relevanceScore || 0,
      });

      res.json({
        success: true,
        data: paginatedProducts,
        searchInfo: {
          query: searchTerm,
          normalizedQuery: normalizedSearch,
          words: extractSearchWords(searchTerm),
          includeScore: includeScore === "true",
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
    } catch (importError) {
      throw importError;
    }
  } catch (error) {
    logOperation("ERROR_BUSQUEDA_AVANZADA", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      message: "Error en la búsqueda avanzada",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// GET /api/v1/products/:id - Obtener producto por ID
export const getProductById = async (
  req: Request,
  res: Response,
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
      data: product,
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

// POST /api/v1/products - Crear nuevo producto
export const createProduct = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    logOperation("CREAR_PRODUCTO_INICIO", { body: req.body });

    const {
      name,
      description,
      price,
      originalPrice,
      managementId,
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
    const bodyGallery = normalizeGalleryInput(req.body.gallery);

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

    // Validar managementId si se proporciona
    if (managementId !== undefined && managementId !== null) {
      const managementIdNum = Number(managementId);
      if (
        isNaN(managementIdNum) ||
        !Number.isInteger(managementIdNum) ||
        managementIdNum <= 0
      ) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message:
            "El ID de gestión debe ser un número entero positivo mayor a 0",
        });
        return;
      }

      // Verificar que el managementId no esté ya en uso
      const existingProduct = await Product.findOne({
        managementId: managementIdNum,
      });
      if (existingProduct) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message: `El ID de gestión ${managementIdNum} ya está siendo utilizado por otro producto`,
        });
        return;
      }
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

    // Validar que se proporcionen imágenes (desde archivos o gallery)
    if ((!files || files.length === 0) && bodyGallery.length === 0) {
      res.status(400).json({
        success: false,
        message:
          "Debe proporcionar al menos una imagen del producto (máximo 6)",
      });
      return;
    }

    // Validar número máximo de imágenes
    if (files && files.length > MAX_FILES) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: `Solo se permiten máximo ${MAX_FILES} imágenes por producto`,
      });
      return;
    }

    // Procesar las imágenes (desde archivos subidos o gallery del body)
    let imageUrls: string[] = [];
    if (files && files.length > 0) {
      imageUrls = processImages(files);
    } else if (bodyGallery.length > 0) {
      imageUrls = bodyGallery;
    }

    logOperation("IMAGENES_PROCESADAS", { urls: imageUrls });

    // Crear el producto
    const productData = {
      name: name.trim(),
      description: description.trim(),
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      managementId: managementId ? Number(managementId) : undefined,
      category: category.trim(),
      categoryId,
      gallery: imageUrls,
      stockCount: stockCount ? Number(stockCount) : 0,
      rating: Number(rating),
      reviews: Number(reviews),
      featured: Boolean(featured),
      tags: Array.isArray(tags) ? tags : [],
      specifications: specifications || {},
      // image e inStock serán establecidos automáticamente por los middlewares del modelo
    };

    // LOG: Mostrar datos completos antes de crear el producto
    const product = new Product(productData);
    const savedProduct = await product.save();
    let responseProduct: any = savedProduct;
    let rgSync: ProductRGSyncInfo | undefined;

    if (
      typeof savedProduct.managementId === "number" &&
      savedProduct.managementId > 0
    ) {
      const syncOutcome = await syncSavedProductWithRG(
        String(savedProduct._id),
        savedProduct.managementId,
        {
          name: savedProduct.name,
          price: Number(savedProduct.price),
          stockCount: Number(savedProduct.stockCount),
        },
      );
      responseProduct = syncOutcome.product ?? savedProduct;
      rgSync = syncOutcome.rgSync;
    }

    logOperation("PRODUCTO_CREADO", {
      id: responseProduct._id,
      name: responseProduct.name,
      imagePrincipal: responseProduct.image,
      totalImagenes: responseProduct.gallery?.length || 0,
      rgSync,
    });

    res.status(201).json({
      success: true,
      message: "Producto creado exitosamente",
      data: {
        ...responseProduct.toObject(),
        imageUrls: responseProduct.gallery, // URLs completas para el frontend
      },
      rgSync,
    });
  } catch (error) {
    // Limpiar archivos subidos en caso de error
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      await cleanupTempFiles(files);
    }

    logOperation("ERROR_CREAR_PRODUCTO", {
      error: error instanceof Error ? error.message : error,
    });

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

// PUT /api/v1/products/:id - Actualizar producto
export const updateProduct = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      originalPrice,
      managementId,
      category,
      categoryId,
      stockCount,
      rating,
      reviews,
      featured,
      tags,
      specifications,
      replaceImages,
      gallery,
    } = req.body;
    const files = req.files as Express.Multer.File[];
    const normalizedGallery =
      gallery !== undefined ? normalizeGalleryInput(gallery) : undefined;

    logOperation("ACTUALIZAR_PRODUCTO_INICIO", {
      id,
      body: req.body,
      archivosNuevos: files?.length || 0,
      replaceImages,
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

    const previousSnapshot = {
      name: product.name,
      price: Number(product.price),
      stockCount: Number(product.stockCount),
    };

    const previousCategoryId = getEntityId(product.categoryId);
    const previousManagementId =
      typeof product.managementId === "number" ? product.managementId : undefined;

    // Validar categoría si se proporciona
    if (categoryId && categoryId !== previousCategoryId) {
      const categoryExists = await Category.findById(categoryId);
      if (!categoryExists) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message: "La categoría especificada no existe",
        });
        return;
      }
    }

    // Validar managementId si se proporciona
    if (managementId !== undefined && managementId !== null) {
      const managementIdNum = Number(managementId);
      if (
        isNaN(managementIdNum) ||
        !Number.isInteger(managementIdNum) ||
        managementIdNum <= 0
      ) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message:
            "El ID de gestión debe ser un número entero positivo mayor a 0",
        });
        return;
      }

      // Verificar que el managementId no esté ya en uso por otro producto
      const existingProduct = await Product.findOne({
        managementId: managementIdNum,
        _id: { $ne: id }, // Excluir el producto actual
      });
      if (existingProduct) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message: `El ID de gestión ${managementIdNum} ya está siendo utilizado por otro producto`,
        });
        return;
      }
    }

    // Actualizar campos básicos
    if (name !== undefined) product.name = name.trim();
    if (description !== undefined) product.description = description.trim();
    if (price !== undefined) product.price = Number(price);
    if (originalPrice !== undefined)
      product.originalPrice = Number(originalPrice);
    if (managementId !== undefined) {
      product.managementId = managementId ? Number(managementId) : undefined;
    }
    if (category !== undefined) product.category = category.trim();
    if (categoryId !== undefined) product.categoryId = categoryId;
    if (stockCount !== undefined) product.stockCount = Number(stockCount);
    if (rating !== undefined) product.rating = Number(rating);
    if (reviews !== undefined) product.reviews = Number(reviews);
    if (featured !== undefined) product.featured = Boolean(featured);

    // Parsear tags si vienen como string
    if (tags !== undefined) {
      try {
        const parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags;
        product.tags = Array.isArray(parsedTags) ? parsedTags : [];
      } catch (error) {
        product.tags = typeof tags === "string" ? [tags] : [];
      }
    }

    // Parsear specifications si vienen como string
    if (specifications !== undefined) {
      try {
        const parsedSpecs =
          typeof specifications === "string"
            ? JSON.parse(specifications)
            : specifications;
        product.specifications = parsedSpecs || {};
      } catch (error) {
        product.specifications = {};
      }
    }

    // Gestión de imágenes
    // COMPORTAMIENTO CAMBIADO: Por defecto reemplaza imágenes, solo combina si explícitamente se indica
    const shouldReplaceImages =
      replaceImages !== "false" && replaceImages !== false;

    // Determinar si hay imágenes nuevas (ya sea por archivos o gallery)
    const hasNewFiles = files && files.length > 0;
    const hasNewGallery = normalizedGallery !== undefined;
    const hasNewImages = hasNewFiles || hasNewGallery;

    logOperation("GESTION_IMAGENES_UPDATE", {
      hasNewFiles,
      hasNewGallery,
      hasNewImages,
      shouldReplaceImages,
      currentImages: product.gallery.length,
      galleryPayloadImages: normalizedGallery?.length ?? 0,
      replaceImagesParam: replaceImages,
      comportamiento: shouldReplaceImages
        ? "REEMPLAZAR (por defecto)"
        : "AGREGAR (explícito)",
    });

    if (hasNewImages) {
      if (shouldReplaceImages) {
        logOperation("REEMPLAZANDO_IMAGENES_POR_DEFECTO", {
          imagenesAnteriores: product.gallery.length,
          imagenesNuevas: hasNewFiles
            ? files.length
            : (normalizedGallery?.length ?? 0),
          tipoActualizacion: hasNewFiles ? "archivos" : "gallery",
          razon:
            "Comportamiento por defecto: nuevas imágenes reemplazan anteriores",
        });

        // Procesar nuevas imágenes según el tipo
        let newImages: string[];
        if (hasNewFiles) {
          // Con archivos nuevos se reemplaza toda la galería anterior.
          await cleanupOldImages(product.gallery);
          // Procesar archivos subidos
          newImages = processImagesReplace(files);
        } else {
          // Con gallery JSON, conservar archivos que siguen presentes y borrar solo los removidos.
          newImages = normalizedGallery ?? [];
          await cleanupOldImages(
            getRemovedLocalImages(product.gallery, newImages),
          );
          // Usar gallery del body (URLs ya procesadas)
        }

        product.gallery = newImages;

        logOperation("IMAGENES_REEMPLAZADAS", {
          total: product.gallery.length,
          urls: product.gallery,
        });
      } else {
        // Solo agregar imágenes cuando explícitamente se indique replaceImages=false
        logOperation("AGREGANDO_IMAGENES_EXPLICITO", {
          imagenesExistentes: product.gallery.length,
          imagenesNuevas: hasNewFiles
            ? files.length
            : (normalizedGallery?.length ?? 0),
          tipoActualizacion: hasNewFiles ? "archivos" : "gallery",
          razon: "Explícitamente indicado replaceImages=false",
        });

        // Procesar nuevas imágenes y combinar con existentes
        let newImages: string[];
        const currentGallery = normalizeGalleryInput(product.gallery);
        if (hasNewFiles) {
          // Combinar archivos con existentes
          newImages = processImages(files, currentGallery);
        } else {
          // Combinar gallery URLs con existentes
          const allImages = [...currentGallery, ...(normalizedGallery ?? [])];
          newImages = allImages.slice(0, MAX_FILES);
        }

        product.gallery = newImages;

        logOperation("IMAGENES_AGREGADAS", {
          total: product.gallery.length,
          urls: product.gallery,
        });
      }
    }

    const updatedProduct = await product.save();
    let responseProduct: any = updatedProduct;
    let rgSync: ProductRGSyncInfo | undefined;
    const updatedCategoryId = getEntityId(updatedProduct.categoryId);
    const nextManagementId =
      typeof updatedProduct.managementId === "number"
        ? updatedProduct.managementId
        : undefined;

    if (
      typeof nextManagementId === "number" &&
      nextManagementId > 0 &&
      (nextManagementId !== previousManagementId ||
        updatedProduct.name !== previousSnapshot.name ||
        Number(updatedProduct.price) !== previousSnapshot.price ||
        Number(updatedProduct.stockCount) !== previousSnapshot.stockCount)
    ) {
      const syncOutcome = await syncSavedProductWithRG(
        String(updatedProduct._id),
        nextManagementId,
        {
          name: updatedProduct.name,
          price: Number(updatedProduct.price),
          stockCount: Number(updatedProduct.stockCount),
        },
      );
      responseProduct = syncOutcome.product ?? updatedProduct;
      rgSync = syncOutcome.rgSync;
    }

    if (
      previousCategoryId &&
      updatedCategoryId &&
      previousCategoryId !== updatedCategoryId
    ) {
      const previousCategoryCount = await Product.countDocuments({
        categoryId: previousCategoryId,
      });
      await Category.findByIdAndUpdate(previousCategoryId, {
        productCount: previousCategoryCount,
      });
      logOperation("CONTADOR_CATEGORIA_ANTERIOR_ACTUALIZADO", {
        categoryId: previousCategoryId,
        productCount: previousCategoryCount,
      });
    }

    logOperation("PRODUCTO_ACTUALIZADO", {
      id: responseProduct._id,
      totalImagenes: responseProduct.gallery.length,
      imagenesUrls: responseProduct.gallery,
      rgSync,
    });

    res.json({
      success: true,
      message: "Producto actualizado exitosamente",
      data: {
        ...responseProduct.toObject(),
        imageUrls: responseProduct.gallery,
      },
      rgSync,
    });
  } catch (error) {
    // Limpiar archivos subidos en caso de error
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      await cleanupTempFiles(files);
    }

    logOperation("ERROR_ACTUALIZAR_PRODUCTO", {
      id: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    if (error instanceof Error && error.name === "ValidationError") {
      res.status(400).json({
        success: false,
        message: "Error de validación del producto",
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Error interno al actualizar el producto",
        error: error instanceof Error ? error.message : error,
      });
    }
  }
};

// DELETE /api/v1/products/:id - Eliminar producto
export const deleteProduct = async (
  req: Request,
  res: Response,
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

    logOperation("ELIMINANDO_PRODUCTO", {
      id: product._id,
      nombre: product.name,
      imagenes: product.gallery?.length || 0,
    });

    // Eliminar imágenes asociadas del servidor
    if (product.gallery && product.gallery.length > 0) {
      try {
        await cleanupOldImages(product.gallery);
        logOperation("IMAGENES_ELIMINADAS", {
          cantidad: product.gallery.length,
        });
      } catch (imageError) {
        // Continuar con la eliminación del producto aunque falle la eliminación de imágenes
        logOperation("ERROR_ELIMINAR_IMAGENES", {
          error: imageError instanceof Error ? imageError.message : imageError,
        });
      }
    }

    // Eliminar producto de la base de datos
    await Product.findByIdAndDelete(id);

    logOperation("PRODUCTO_ELIMINADO", {
      id,
      nombre: product.name,
    });

    res.json({
      success: true,
      message: "Producto eliminado exitosamente",
    });
  } catch (error) {
    logOperation("ERROR_ELIMINAR_PRODUCTO", {
      id: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al eliminar el producto",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// PUT /api/v1/products/:id/stock - Actualizar stock de un producto
export const updateProductStock = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { stockCount, inStock } = req.body;

    if (stockCount === undefined && inStock === undefined) {
      res.status(400).json({
        success: false,
        message: "Se requiere stockCount o inStock para actualizar el stock",
      });
      return;
    }

    const product = await Product.findById(id);

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    // Actualizar campos de stock
    if (stockCount !== undefined) {
      product.stockCount = Number(stockCount);
    }
    if (inStock !== undefined) {
      product.inStock = Boolean(inStock);
    }

    const updatedProduct = await product.save();

    logOperation("STOCK_ACTUALIZADO", {
      id: updatedProduct._id,
      stockCount: updatedProduct.stockCount,
      inStock: updatedProduct.inStock,
    });

    res.json({
      success: true,
      message: "Stock actualizado exitosamente",
      data: {
        id: updatedProduct._id,
        stockCount: updatedProduct.stockCount,
        inStock: updatedProduct.inStock,
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

///////////////////////////////////////////////////////////////////////////////
// 🎯 NUEVAS FUNCIONES DE SLOTS INDIVIDUALES DE IMÁGENES
///////////////////////////////////////////////////////////////////////////////

// GET /api/v1/products/:id/images - Obtener información de slots de imágenes
export const getProductImageSlots = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    logOperation("OBTENER_SLOTS_IMAGENES_INICIO", { productId: id });

    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    // Crear array de 6 slots con información detallada
    const slots = Array.from({ length: 6 }, (_, index) => {
      const imageUrl = product.gallery[index] || null;
      return {
        slot: index,
        position: index + 1, // Para frontend (1-6)
        imageUrl,
        isEmpty: !imageUrl,
        isPrimary: index === 0, // El primer slot es siempre la imagen principal
      };
    });

    logOperation("SLOTS_IMAGENES_OBTENIDOS", {
      productId: id,
      totalSlots: slots.length,
      occupiedSlots: slots.filter((s) => !s.isEmpty).length,
      emptySlots: slots.filter((s) => s.isEmpty).length,
    });

    res.json({
      success: true,
      data: {
        productId: id,
        productName: product.name,
        primaryImage: product.image,
        slots,
        summary: {
          total: 6,
          occupied: slots.filter((s) => !s.isEmpty).length,
          empty: slots.filter((s) => s.isEmpty).length,
        },
      },
    });
  } catch (error) {
    logOperation("ERROR_OBTENER_SLOTS_IMAGENES", {
      productId: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener información de slots de imágenes",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// PUT /api/v1/products/:id/images/:slot - Actualizar imagen en slot específico
export const updateProductImageSlot = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id, slot } = req.params;
    const slotIndex = parseInt(slot);
    const file = req.file as Express.Multer.File;

    logOperation("ACTUALIZAR_SLOT_IMAGEN_INICIO", {
      productId: id,
      slot: slotIndex,
      hasFile: !!file,
    });

    // Validar slot
    if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 5) {
      if (file) {
        await cleanupTempFiles([file]);
      }
      res.status(400).json({
        success: false,
        message: "Slot debe estar entre 0 y 5 (posiciones 1-6)",
      });
      return;
    }

    // Validar que se proporcione archivo
    if (!file) {
      res.status(400).json({
        success: false,
        message: "Debe proporcionar una imagen para actualizar el slot",
      });
      return;
    }

    // Buscar producto
    const product = await Product.findById(id);
    if (!product) {
      await cleanupTempFiles([file]);
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    // Guardar referencia de imagen anterior para eliminar
    const oldImageUrl = product.gallery[slotIndex];

    // Actualizar el array de gallery
    const updatedGallery = [...product.gallery];

    // Expandir el array si es necesario (llenar con nulls hasta el slot requerido)
    while (updatedGallery.length <= slotIndex) {
      updatedGallery.push("");
    }

    // Establecer la nueva imagen en el slot específico
    const newImageUrl = `/uploads/products/${file.filename}`;
    updatedGallery[slotIndex] = newImageUrl;

    // Limpiar slots vacíos al final del array (opcional)
    while (
      updatedGallery.length > 0 &&
      !updatedGallery[updatedGallery.length - 1]
    ) {
      updatedGallery.pop();
    }

    product.gallery = updatedGallery;

    // Si actualizamos el slot 0 (imagen principal), actualizar también el campo image
    if (slotIndex === 0) {
      product.image = newImageUrl;
    }

    const updatedProduct = await product.save();

    // Eliminar imagen anterior si existía y no era imagen por defecto
    if (oldImageUrl && !oldImageUrl.includes("default-product")) {
      await deleteImageFile(oldImageUrl);
    }

    // Crear estructura de slot actualizado para respuesta
    const updatedSlot = {
      slot: slotIndex,
      position: slotIndex + 1,
      imageUrl: newImageUrl,
      isEmpty: false,
      isPrimary: slotIndex === 0,
    };

    logOperation("SLOT_IMAGEN_ACTUALIZADO", {
      productId: id,
      slot: slotIndex,
      oldImage: oldImageUrl,
      newImage: newImageUrl,
      totalImages: updatedProduct.gallery.length,
      isPrimary: slotIndex === 0,
    });

    res.json({
      success: true,
      data: {
        slot: updatedSlot,
        gallery: updatedProduct.gallery.filter(Boolean), // Solo URLs no vacías
        primaryImage: updatedProduct.image,
      },
    });
  } catch (error) {
    // Limpiar archivo subido en caso de error
    const file = req.file as Express.Multer.File;
    if (file) {
      await cleanupTempFiles([file]);
    }

    logOperation("ERROR_ACTUALIZAR_SLOT_IMAGEN", {
      productId: req.params.id,
      slot: req.params.slot,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al actualizar imagen del slot",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// DELETE /api/v1/products/:id/images/:slot - Eliminar imagen de slot específico
export const deleteProductImageSlot = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id, slot } = req.params;
    const slotIndex = parseInt(slot);

    logOperation("ELIMINAR_SLOT_IMAGEN_INICIO", {
      productId: id,
      slot: slotIndex,
    });

    // Validar slot
    if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 5) {
      res.status(400).json({
        success: false,
        message: "Slot debe estar entre 0 y 5 (posiciones 1-6)",
      });
      return;
    }

    // Buscar producto
    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    // Verificar que el slot tenga imagen
    if (!product.gallery[slotIndex]) {
      res.status(400).json({
        success: false,
        message: `El slot ${slotIndex + 1} ya está vacío`,
      });
      return;
    }

    // Prevenir eliminar la última imagen (debe tener al menos una)
    const occupiedSlots = product.gallery.filter(
      (img) => img && img.trim(),
    ).length;
    if (occupiedSlots <= 1) {
      res.status(400).json({
        success: false,
        message:
          "No se puede eliminar la última imagen. El producto debe tener al menos una imagen.",
      });
      return;
    }

    // Guardar referencia de imagen a eliminar
    const imageToDelete = product.gallery[slotIndex];

    // Actualizar el array de gallery
    const updatedGallery = [...product.gallery];
    updatedGallery[slotIndex] = ""; // Marcar como vacío

    // Limpiar slots vacíos al final del array
    while (
      updatedGallery.length > 0 &&
      !updatedGallery[updatedGallery.length - 1]
    ) {
      updatedGallery.pop();
    }

    product.gallery = updatedGallery;

    // Si eliminamos la imagen principal (slot 0), establecer la siguiente imagen disponible
    if (slotIndex === 0) {
      const nextImage = updatedGallery.find((img) => img && img.trim());
      product.image = nextImage || "/uploads/products/default-product.png";
    }

    const updatedProduct = await product.save();

    // Eliminar archivo físico si no era imagen por defecto
    if (imageToDelete && !imageToDelete.includes("default-product")) {
      await deleteImageFile(imageToDelete);
    }

    logOperation("SLOT_IMAGEN_ELIMINADO", {
      productId: id,
      slot: slotIndex,
      deletedImage: imageToDelete,
      newPrimaryImage: updatedProduct.image,
      totalImages: updatedProduct.gallery.filter((img) => img && img.trim())
        .length,
    });

    res.json({
      success: true,
      data: {
        deletedSlot: slotIndex,
        gallery: updatedProduct.gallery.filter(Boolean), // Solo URLs no vacías
        primaryImage: updatedProduct.image,
      },
    });
  } catch (error) {
    logOperation("ERROR_ELIMINAR_SLOT_IMAGEN", {
      productId: req.params.id,
      slot: req.params.slot,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al eliminar imagen del slot",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// POST /api/v1/products/:id/images/:slot/reorder - Reordenar imagen a slot específico
export const reorderProductImageSlot = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { fromSlot, toSlot } = req.body;
    const fromSlotIndex = parseInt(fromSlot);
    const toSlotIndex = parseInt(toSlot);

    logOperation("REORDENAR_SLOT_IMAGEN_INICIO", {
      productId: id,
      fromSlot: fromSlotIndex,
      toSlot: toSlotIndex,
    });

    // Validar que ambos slots sean válidos
    if (
      isNaN(fromSlotIndex) ||
      fromSlotIndex < 0 ||
      fromSlotIndex > 5 ||
      isNaN(toSlotIndex) ||
      toSlotIndex < 0 ||
      toSlotIndex > 5
    ) {
      res.status(400).json({
        success: false,
        message: "Los slots deben estar entre 0 y 5 (posiciones 1-6)",
      });
      return;
    }

    if (fromSlotIndex === toSlotIndex) {
      res.status(400).json({
        success: false,
        message: "El slot de origen y destino no pueden ser el mismo",
      });
      return;
    }

    // Buscar producto
    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    // Verificar que el slot origen tenga imagen
    if (!product.gallery[fromSlotIndex]) {
      res.status(400).json({
        success: false,
        message: `El slot ${fromSlotIndex + 1} está vacío`,
      });
      return;
    }

    // Realizar el reordenamiento
    const updatedGallery = [...product.gallery];

    // Expandir array si es necesario
    while (updatedGallery.length <= Math.max(fromSlotIndex, toSlotIndex)) {
      updatedGallery.push("");
    }

    // Intercambiar imágenes
    const imageToMove = updatedGallery[fromSlotIndex];
    const imageAtDestination = updatedGallery[toSlotIndex] || "";

    updatedGallery[toSlotIndex] = imageToMove;
    updatedGallery[fromSlotIndex] = imageAtDestination;

    product.gallery = updatedGallery;

    // Actualizar imagen principal si se movió hacia/desde el slot 0
    if (toSlotIndex === 0 || fromSlotIndex === 0) {
      product.image =
        updatedGallery[0] || "/uploads/products/default-product.png";
    }

    const updatedProduct = await product.save();

    // Crear estructura de slots para respuesta completa
    const slots = Array.from({ length: 6 }, (_, index) => {
      const imageUrl = updatedProduct.gallery[index] || null;
      return {
        slot: index,
        position: index + 1,
        imageUrl,
        isEmpty: !imageUrl,
        isPrimary: index === 0,
      };
    });

    logOperation("SLOT_IMAGEN_REORDENADO", {
      productId: id,
      fromSlot: fromSlotIndex,
      toSlot: toSlotIndex,
      movedImage: imageToMove,
      replacedImage: imageAtDestination,
      newPrimaryImage: updatedProduct.image,
    });

    res.json({
      success: true,
      data: {
        slots,
        gallery: updatedProduct.gallery.filter(Boolean), // Filtrar URLs vacías
        primaryImage: updatedProduct.image,
      },
    });
  } catch (error) {
    logOperation("ERROR_REORDENAR_SLOT_IMAGEN", {
      productId: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al reordenar imagen",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// Exportar el middleware de upload para las rutas
export { uploadProductImages as upload };
