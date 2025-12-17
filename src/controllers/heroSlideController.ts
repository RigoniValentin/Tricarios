import { Request, Response } from "express";
import HeroSlide, { IHeroSlide } from "@models/HeroSlide";
import path from "path";
import fs from "fs/promises";

// Función auxiliar para eliminar archivo de imagen
const deleteImageFile = async (imagePath: string): Promise<boolean> => {
  try {
    if (!imagePath || imagePath.startsWith("http")) return false;

    let filePath = imagePath;
    if (imagePath.startsWith("/uploads/")) {
      filePath = path.join(process.cwd(), imagePath);
    }

    await fs.unlink(filePath);
    console.log(`🗑️ Imagen de slide eliminada: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error eliminando imagen de slide ${imagePath}:`, error);
    return false;
  }
};

// Obtener todos los slides activos (para el frontend público)
export const getActiveSlides = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const slides = await HeroSlide.find({ isActive: true })
      .sort({ order: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: slides,
      count: slides.length,
    });
  } catch (error) {
    console.error("Error al obtener slides activos:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener los slides",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

// Obtener todos los slides (para el admin)
export const getAllSlides = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const slides = await HeroSlide.find().sort({ order: 1 }).lean();

    res.status(200).json({
      success: true,
      data: slides,
      count: slides.length,
    });
  } catch (error) {
    console.error("Error al obtener todos los slides:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener los slides",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

// Obtener un slide por ID
export const getSlideById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const slide = await HeroSlide.findById(id).lean();

    if (!slide) {
      res.status(404).json({
        success: false,
        message: "Slide no encontrado",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: slide,
    });
  } catch (error) {
    console.error("Error al obtener slide:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener el slide",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

// Crear un nuevo slide
export const createSlide = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { title, subtitle, image, order, isActive } = req.body;

    // Obtener imagen del archivo subido o de la URL proporcionada
    let slideImage = image;
    if (req.file) {
      slideImage = `/uploads/slides/${req.file.filename}`;
    }

    // Validar que al menos hay imagen
    if (!slideImage) {
      res.status(400).json({
        success: false,
        message: "La imagen es requerida",
      });
      return;
    }

    // Si no se proporciona orden, asignar el siguiente disponible
    let slideOrder = order;
    if (slideOrder === undefined || slideOrder === null) {
      const lastSlide = await HeroSlide.findOne().sort({ order: -1 }).lean();
      slideOrder = lastSlide ? lastSlide.order + 1 : 0;
    }

    const newSlide = new HeroSlide({
      title: title || undefined,
      subtitle: subtitle || undefined,
      image: slideImage,
      order: slideOrder,
      isActive: isActive !== undefined ? isActive : true,
    });

    const savedSlide = await newSlide.save();

    res.status(201).json({
      success: true,
      message: "Slide creado exitosamente",
      data: savedSlide,
    });
  } catch (error) {
    console.error("Error al crear slide:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear el slide",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

// Actualizar un slide
export const updateSlide = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, subtitle, image, order, isActive } = req.body;

    const slide = await HeroSlide.findById(id);

    if (!slide) {
      res.status(404).json({
        success: false,
        message: "Slide no encontrado",
      });
      return;
    }

    // Si hay una nueva imagen subida
    if (req.file) {
      // Eliminar imagen anterior si es local
      if (slide.image && slide.image.startsWith("/uploads/")) {
        await deleteImageFile(slide.image);
      }
      slide.image = `/uploads/slides/${req.file.filename}`;
    } else if (image !== undefined) {
      // Si se proporciona una URL de imagen
      if (
        slide.image &&
        slide.image.startsWith("/uploads/") &&
        image !== slide.image
      ) {
        await deleteImageFile(slide.image);
      }
      slide.image = image;
    }

    // Actualizar solo los campos proporcionados
    if (title !== undefined) slide.title = title || undefined;
    if (subtitle !== undefined) slide.subtitle = subtitle || undefined;
    if (order !== undefined) slide.order = order;
    if (isActive !== undefined) slide.isActive = isActive;

    const updatedSlide = await slide.save();

    res.status(200).json({
      success: true,
      message: "Slide actualizado exitosamente",
      data: updatedSlide,
    });
  } catch (error) {
    console.error("Error al actualizar slide:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar el slide",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

// Actualizar múltiples slides (para cambiar orden masivamente)
export const updateMultipleSlides = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slides } = req.body;

    if (!Array.isArray(slides)) {
      res.status(400).json({
        success: false,
        message: "Se requiere un array de slides",
      });
      return;
    }

    const updatePromises = slides.map(async (slideData: any) => {
      const { _id, id, title, subtitle, image, order, isActive } = slideData;
      const slideId = _id || id;

      if (!slideId) return null;

      return HeroSlide.findByIdAndUpdate(
        slideId,
        {
          ...(title !== undefined && { title }),
          ...(subtitle !== undefined && { subtitle }),
          ...(image !== undefined && { image }),
          ...(order !== undefined && { order }),
          ...(isActive !== undefined && { isActive }),
        },
        { new: true }
      );
    });

    const results = await Promise.all(updatePromises);
    const updatedSlides = results.filter((s) => s !== null);

    res.status(200).json({
      success: true,
      message: `${updatedSlides.length} slides actualizados exitosamente`,
      data: updatedSlides,
    });
  } catch (error) {
    console.error("Error al actualizar múltiples slides:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar los slides",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

// Eliminar un slide
export const deleteSlide = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const slide = await HeroSlide.findById(id);

    if (!slide) {
      res.status(404).json({
        success: false,
        message: "Slide no encontrado",
      });
      return;
    }

    // Eliminar imagen si es local
    if (slide.image && slide.image.startsWith("/uploads/")) {
      await deleteImageFile(slide.image);
    }

    await HeroSlide.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Slide eliminado exitosamente",
    });
  } catch (error) {
    console.error("Error al eliminar slide:", error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar el slide",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

// Inicializar slides por defecto si no existen
export const initializeDefaultSlides = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const existingSlides = await HeroSlide.countDocuments();

    if (existingSlides > 0) {
      res.status(200).json({
        success: true,
        message: "Ya existen slides configurados",
        count: existingSlides,
      });
      return;
    }

    const defaultSlides = [
      {
        title: "Bienvenido a Tricarios",
        subtitle: "Tu growshop de confianza",
        image:
          "https://images.unsplash.com/photo-1589244159943-460088ed5c92?w=1600&h=900&fit=crop",
        order: 0,
        isActive: true,
      },
      {
        title: "Fertilizantes Premium",
        subtitle: "Las mejores marcas del mercado",
        image:
          "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=1600&h=900&fit=crop",
        order: 1,
        isActive: true,
      },
      {
        title: "Envíos a todo el país",
        subtitle: "Recibí tu pedido en tu puerta",
        image:
          "https://images.unsplash.com/photo-1495908333425-29a1e0918c5f?w=1600&h=900&fit=crop",
        order: 2,
        isActive: true,
      },
    ];

    const createdSlides = await HeroSlide.insertMany(defaultSlides);

    res.status(201).json({
      success: true,
      message: "Slides por defecto creados exitosamente",
      data: createdSlides,
    });
  } catch (error) {
    console.error("Error al inicializar slides por defecto:", error);
    res.status(500).json({
      success: false,
      message: "Error al inicializar slides por defecto",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};
