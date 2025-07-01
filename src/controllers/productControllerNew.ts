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

// GET /api/v1/products - Obtener todos los productos
export const getProducts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      category,
      isActive,
      minPrice,
      maxPrice,
      inStock,
      page = "1",
      limit = "10",
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
    } = req.query;

    // Construir filtros
    let filter: any = {};

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    if (category) {
      filter.category = category;
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    if (inStock === "true") {
      filter.stock = { $gt: 0 };
    }

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
      totalImagenes: product.images?.length || 0,
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

// POST /api/v1/products - Crear nuevo producto con sistema de 4 slots
export const createProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    logOperation("CREAR_PRODUCTO_INICIO", { body: req.body });

    const { name, price, description, category, stock } = req.body;
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

    if (!price || isNaN(Number(price)) || Number(price) < 0) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: "El precio debe ser un número válido mayor o igual a 0",
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

    if (!category) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: "La categoría es requerida",
      });
      return;
    }

    // Verificar que la categoría existe y está activa
    const categoryExists = await Category.findOne({
      _id: category,
      isActive: true,
    });
    if (!categoryExists) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: "La categoría especificada no existe o no está activa",
      });
      return;
    }

    // Validar que se proporcionen imágenes (obligatorias)
    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        message:
          "Debe proporcionar al menos una imagen del producto (máximo 4)",
      });
      return;
    }

    if (files.length > MAX_FILES) {
      await cleanupTempFiles(files);
      res.status(400).json({
        success: false,
        message: `Solo se permiten máximo ${MAX_FILES} imágenes por producto`,
      });
      return;
    }

    // Procesar las imágenes
    const imageUrls = processImages(files);

    logOperation("IMAGENES_PROCESADAS", { urls: imageUrls });

    // Crear el producto
    const productData = {
      name: name.trim(),
      price: Number(price),
      description: description.trim(),
      category,
      stock: stock ? Number(stock) : 0,
      images: imageUrls,
      // image será establecida automáticamente por el middleware del modelo
    };

    const product = new Product(productData);
    const savedProduct = await product.save();

    logOperation("PRODUCTO_CREADO", {
      id: savedProduct._id,
      name: savedProduct.name,
      imagePrincipal: savedProduct.image,
      totalImagenes: savedProduct.images.length,
    });

    res.status(201).json({
      success: true,
      message: "Producto creado exitosamente",
      data: {
        ...savedProduct.toObject(),
        imageUrls: savedProduct.images, // URLs completas para el frontend
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

// PUT /api/v1/products/:id - Actualizar producto con sistema de 4 slots
export const updateProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      price,
      description,
      category,
      stock,
      isActive,
      replaceImages,
    } = req.body;
    const files = req.files as Express.Multer.File[];

    logOperation("ACTUALIZAR_PRODUCTO_INICIO", {
      id,
      body: req.body,
      archivosNuevos: files?.length || 0,
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
    if (category && category !== product.category.toString()) {
      const categoryExists = await Category.findOne({
        _id: category,
        isActive: true,
      });
      if (!categoryExists) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message: "La categoría especificada no existe o no está activa",
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
    if (category !== undefined) product.category = category;
    if (stock !== undefined) {
      if (isNaN(Number(stock)) || Number(stock) < 0) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message: "El stock debe ser un número válido mayor o igual a 0",
        });
        return;
      }
      product.stock = Number(stock);
    }

    // Manejar imágenes según el parámetro replaceImages del cliente
    if (files && files.length > 0) {
      if (files.length > MAX_FILES) {
        await cleanupTempFiles(files);
        res.status(400).json({
          success: false,
          message: `Solo se permiten máximo ${MAX_FILES} imágenes por producto`,
        });
        return;
      }

      if (replaceImages === true || replaceImages === "true") {
        // MODO REEMPLAZO: Eliminar todas las imágenes anteriores y reemplazar con las nuevas
        logOperation("MODO_REEMPLAZO_IMAGENES", {
          imagenesAnteriores: product.images.length,
          imagenesNuevas: files.length,
        });

        // Eliminar todas las imágenes anteriores del sistema de archivos
        await cleanupOldImages(product.images);

        // Reemplazar con las nuevas imágenes
        const newImages = processImages(files);
        product.images = newImages;

        logOperation("IMAGENES_REEMPLAZADAS", {
          total: product.images.length,
          urls: product.images,
        });
      } else {
        // MODO AGREGAR: Agregar nuevas imágenes a las existentes (comportamiento por defecto)
        logOperation("MODO_AGREGAR_IMAGENES", {
          imagenesExistentes: product.images.length,
          imagenesNuevas: files.length,
        });

        const newImages = files.map(
          (file) => `/uploads/products/${file.filename}`
        );

        // Agregar las nuevas imágenes a las existentes
        const allImages = [...product.images, ...newImages];

        // Limitar a máximo 4 imágenes total
        if (allImages.length > MAX_FILES) {
          const excessImages = allImages.slice(MAX_FILES);
          // Eliminar archivos en exceso (solo los nuevos que exceden)
          await cleanupOldImages(excessImages);
          product.images = allImages.slice(0, MAX_FILES);

          logOperation("LIMITE_IMAGENES_APLICADO", {
            totalOriginal: allImages.length,
            totalFinal: product.images.length,
            eliminadas: excessImages.length,
          });
        } else {
          product.images = allImages;
        }

        logOperation("IMAGENES_AGREGADAS", {
          total: product.images.length,
          urls: product.images,
        });
      }
    } else {
      // Si no se envían nuevas imágenes, validar que el producto tenga al menos una imagen existente
      if (product.images.length === 0) {
        res.status(400).json({
          success: false,
          message: "El producto debe tener al menos una imagen",
        });
        return;
      }
      logOperation("SIN_NUEVAS_IMAGENES", {
        imagenesExistentes: product.images.length,
      });
    }

    const updatedProduct = await product.save();

    logOperation("PRODUCTO_ACTUALIZADO", {
      id: updatedProduct._id,
      name: updatedProduct.name,
      imagePrincipal: updatedProduct.image,
      totalImagenes: updatedProduct.images.length,
    });

    res.json({
      success: true,
      message: "Producto actualizado exitosamente",
      data: {
        ...updatedProduct.toObject(),
        imageUrls: updatedProduct.images,
      },
    });
  } catch (error) {
    // Limpiar archivos subidos si hay error
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

    const product = await Product.findById(id);

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    if (permanent === "true") {
      // Eliminación permanente - eliminar también las imágenes
      logOperation("ELIMINACION_PERMANENTE", {
        id: product._id,
        imagenes: product.images.length,
      });

      await cleanupOldImages(product.images);
      await Product.findByIdAndDelete(id);

      res.json({
        success: true,
        message: "Producto eliminado permanentemente",
      });
    } else {
      // Eliminación lógica - desactivar
      logOperation("ELIMINACION_LOGICA", { id: product._id });

      await product.save();

      res.json({
        success: true,
        message: "Producto desactivado exitosamente",
        data: product,
      });
    }
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

// PUT /api/v1/products/:id/activate - Reactivar producto
export const activateProduct = async (
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

    const updatedProduct = await product.save();

    logOperation("PRODUCTO_REACTIVADO", {
      id: updatedProduct._id,
      name: updatedProduct.name,
    });

    res.json({
      success: true,
      message: "Producto reactivado exitosamente",
      data: updatedProduct,
    });
  } catch (error) {
    logOperation("ERROR_REACTIVAR_PRODUCTO", {
      id: req.params.id,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      message: "Error al reactivar el producto",
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

    const previousStock = product.stock;

    switch (operation) {
      case "set":
        product.stock = stock;
        break;
      case "add":
        product.stock += stock;
        break;
      case "subtract":
        product.stock = Math.max(0, product.stock - stock);
        break;
      default:
        product.stock = stock; // Por defecto, establecer el valor
    }

    const updatedProduct = await product.save();

    logOperation("STOCK_ACTUALIZADO", {
      id: updatedProduct._id,
      operacion: operation || "set",
      stockAnterior: previousStock,
      stockNuevo: updatedProduct.stock,
      cambio: stock,
    });

    res.json({
      success: true,
      message: "Stock actualizado exitosamente",
      data: {
        id: updatedProduct._id,
        name: updatedProduct.name,
        previousStock,
        newStock: updatedProduct.stock,
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

// Exportar el middleware de upload para las rutas
export { uploadProductImages as upload };
