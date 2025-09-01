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

  // Combinar imágenes existentes con nuevas
  const allImages = [...existingImages, ...newImageUrls];

  // Limitar a máximo 4 imágenes (tomar las primeras 4)
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
    (file) => `/uploads/products/${file.filename}`
  );

  // Limitar a máximo 4 imágenes
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
        filter.$or = searchConditions;

        logOperation("FILTRO_BUSQUEDA_GENERADO", {
          totalConditions: searchConditions.length,
          sample: searchConditions.slice(0, 3),
        });
      }
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
        search as string
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
  res: Response
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
      const finalFilter = {
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
  res: Response
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
    if (
      (!files || files.length === 0) &&
      (!req.body.gallery ||
        !Array.isArray(req.body.gallery) ||
        req.body.gallery.length === 0)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Debe proporcionar al menos una imagen del producto (máximo 4)",
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
    } else if (Array.isArray(req.body.gallery) && req.body.gallery.length > 0) {
      imageUrls = req.body.gallery.slice(0, MAX_FILES);
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
    console.log(
      "[CREATE_PRODUCT] productData completo:",
      JSON.stringify(productData, null, 2)
    );
    console.log(
      "[CREATE_PRODUCT] productData.gallery específico:",
      productData.gallery
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
      data: {
        ...savedProduct.toObject(),
        imageUrls: savedProduct.gallery, // URLs completas para el frontend
      },
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
  res: Response
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

    // Validar categoría si se proporciona
    if (categoryId && categoryId !== product.categoryId.toString()) {
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
        console.log("Error parsing tags, using as array:", error);
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
        console.log("Error parsing specifications, using empty object:", error);
        product.specifications = {};
      }
    }

    // Gestión de imágenes
    // COMPORTAMIENTO CAMBIADO: Por defecto reemplaza imágenes, solo combina si explícitamente se indica
    const shouldReplaceImages =
      replaceImages !== "false" && replaceImages !== false;

    // Determinar si hay imágenes nuevas (ya sea por archivos o gallery)
    const hasNewFiles = files && files.length > 0;
    const hasNewGallery = Array.isArray(gallery) && gallery.length > 0;
    const hasNewImages = hasNewFiles || hasNewGallery;

    logOperation("GESTION_IMAGENES_UPDATE", {
      hasNewFiles,
      hasNewGallery,
      hasNewImages,
      shouldReplaceImages,
      currentImages: product.gallery.length,
      replaceImagesParam: replaceImages,
      comportamiento: shouldReplaceImages
        ? "REEMPLAZAR (por defecto)"
        : "AGREGAR (explícito)",
    });

    if (hasNewImages) {
      if (shouldReplaceImages) {
        logOperation("REEMPLAZANDO_IMAGENES_POR_DEFECTO", {
          imagenesAnteriores: product.gallery.length,
          imagenesNuevas: hasNewFiles ? files.length : gallery.length,
          tipoActualizacion: hasNewFiles ? "archivos" : "gallery",
          razon:
            "Comportamiento por defecto: nuevas imágenes reemplazan anteriores",
        });

        // Eliminar imágenes anteriores y reemplazar completamente
        await cleanupOldImages(product.gallery);

        // Procesar nuevas imágenes según el tipo
        let newImages: string[];
        if (hasNewFiles) {
          // Procesar archivos subidos
          newImages = processImagesReplace(files);
        } else {
          // Usar gallery del body (URLs ya procesadas)
          newImages = gallery.slice(0, MAX_FILES);
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
          imagenesNuevas: hasNewFiles ? files.length : gallery.length,
          tipoActualizacion: hasNewFiles ? "archivos" : "gallery",
          razon: "Explícitamente indicado replaceImages=false",
        });

        // Procesar nuevas imágenes y combinar con existentes
        let newImages: string[];
        if (hasNewFiles) {
          // Combinar archivos con existentes
          newImages = processImages(files, product.gallery);
        } else {
          // Combinar gallery URLs con existentes
          const allImages = [...product.gallery, ...gallery];
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

    logOperation("PRODUCTO_ACTUALIZADO", {
      id: updatedProduct._id,
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
  res: Response
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

// Exportar el middleware de upload para las rutas
export { uploadProductImages as upload };
