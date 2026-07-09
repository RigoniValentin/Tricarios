import mongoose, { Document, Schema } from "mongoose";
import {
  IProductSpecifications,
  validateSpecifications,
} from "../types/ProductSpecifications";

export interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  managementId?: number; // ID numérico opcional para gestión interna
  category: string; // Nombre de la categoría
  categoryId: mongoose.Types.ObjectId; // ID de la categoría
  image: string; // Imagen principal
  gallery: string[]; // Array de todas las imágenes (máximo 6)
  inStock: boolean;
  stockCount: number;
  rating: number;
  reviews: number;
  featured: boolean;
  tags: string[];
  specifications: IProductSpecifications;
  discount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, "El nombre del producto es requerido"],
      trim: true,
      maxlength: [200, "El nombre no puede exceder 200 caracteres"],
    },
    description: {
      type: String,
      required: [true, "La descripción es requerida"],
      trim: true,
      maxlength: [2000, "La descripción no puede exceder 2000 caracteres"],
    },
    price: {
      type: Number,
      required: [true, "El precio es requerido"],
      min: [0, "El precio no puede ser negativo"],
    },
    originalPrice: {
      type: Number,
      min: [0, "El precio original no puede ser negativo"],
    },
    managementId: {
      type: Number,
      required: false,
      unique: true,
      sparse: true, // Permite múltiples documentos sin managementId
      min: [1, "El ID de gestión debe ser un número positivo mayor a 0"],
      validate: {
        validator: function (v: number) {
          return v == null || (Number.isInteger(v) && v > 0);
        },
        message: "El ID de gestión debe ser un número entero positivo",
      },
    },
    category: {
      type: String,
      required: [true, "El nombre de la categoría es requerido"],
      trim: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "El ID de la categoría es requerido"],
    },
    image: {
      type: String,
      required: false, // Ya no es obligatorio
    },
    gallery: {
      type: [String],
      validate: {
        validator: function (v: string[]) {
          return !v || v.length <= 6; // Validamos solo si existe
        },
        message: "Máximo 6 imágenes permitidas",
      },
      required: false, // Ya no es obligatorio
      default: [], // Array vacío por defecto
    },
    inStock: {
      type: Boolean,
      required: [true, "El estado de stock es requerido"],
      default: true,
    },
    stockCount: {
      type: Number,
      required: [true, "El conteo de stock es requerido"],
      min: [0, "El stock no puede ser negativo"],
      default: 0,
    },
    rating: {
      type: Number,
      required: [true, "La calificación es requerida"],
      min: [0, "La calificación no puede ser menor a 0"],
      max: [5, "La calificación no puede ser mayor a 5"],
      default: 0,
    },
    reviews: {
      type: Number,
      required: [true, "El número de reseñas es requerido"],
      min: [0, "El número de reseñas no puede ser negativo"],
      default: 0,
    },
    featured: {
      type: Boolean,
      required: [true, "El estado destacado es requerido"],
      default: false,
    },
    tags: {
      type: [String],
      default: [],
    },
    specifications: {
      type: Schema.Types.Mixed,
      default: {},
      validate: {
        validator: validateSpecifications,
        message:
          "Las especificaciones deben ser un objeto con claves string y valores string o number",
      },
    },
    discount: {
      type: Number,
      min: [0, "El descuento no puede ser negativo"],
      max: [100, "El descuento no puede ser mayor al 100%"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índices para optimizar búsquedas
ProductSchema.index({ name: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ categoryId: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ stockCount: 1 });
ProductSchema.index({ inStock: 1 });
ProductSchema.index({ featured: 1 });
ProductSchema.index({ rating: 1 });
ProductSchema.index({ tags: 1 });
// managementId ya tiene índice único (sparse) por su definición de campo.

// Virtual para calcular descuento automáticamente
ProductSchema.virtual("discountCalculated").get(function (this: IProduct) {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round(
      ((this.originalPrice - this.price) / this.originalPrice) * 100
    );
  }
  return 0;
});

// Virtual para ID numérico (para compatibilidad con frontend)
ProductSchema.virtual("id").get(function (this: IProduct) {
  return (this._id as any).toString();
});

// Middleware para establecer imagen principal automáticamente
ProductSchema.pre("save", function (this: IProduct, next) {
  try {
    if (this.gallery && this.gallery.length > 0) {
      this.image = this.gallery[0]; // La primera imagen es siempre la principal
    } else {
      // Si no hay imágenes pero ya existe una imagen principal, mantenerla
    }
    next();
  } catch (error) {
    console.error(`❌ Error en middleware pre('save'):`, error);
    next();
  }
});

// Middleware para validar imágenes antes de guardar
ProductSchema.pre("save", function (this: IProduct, next) {
  try {
    if (this.gallery && this.gallery.length > 6) {
      return next(
        new Error("No se pueden tener más de 6 imágenes por producto")
      );
    }

    // Si no hay imágenes, usar imagen por defecto
    if (!this.gallery || this.gallery.length === 0) {
      this.gallery = ["/uploads/products/default-product.png"];
      this.image = "/uploads/products/default-product.png";
    } else {
      // Si hay imágenes, la primera es la principal
      this.image = this.gallery[0];
    }
    next();
  } catch (error) {
    console.error(`❌ Error en validación de imágenes:`, error);
    next(
      error instanceof Error
        ? error
        : new Error("Error en validación de imágenes")
    );
  }
});

// Middleware para calcular inStock basado en stockCount
ProductSchema.pre("save", function (this: IProduct, next) {
  this.inStock = this.stockCount > 0;
  next();
});

// Middleware para populate automático de categoría
ProductSchema.pre(/^find/, function (this: any, next) {
  this.populate({
    path: "categoryId",
    select: "name description",
  });
  next();
});

// Middleware para actualizar contador de productos en la categoría
ProductSchema.post("save", async function (doc: IProduct) {
  try {
    const Category = mongoose.model("Category");
    const count = await mongoose.model("Product").countDocuments({
      categoryId: doc.categoryId,
    });
    await Category.findByIdAndUpdate(doc.categoryId, { productCount: count });
  } catch (error) {
    console.error("Error actualizando contador de productos:", error);
  }
});

ProductSchema.post("findOneAndDelete", async function (doc: IProduct | null) {
  if (doc && doc.categoryId) {
    try {
      const Category = mongoose.model("Category");
      const count = await mongoose.model("Product").countDocuments({
        categoryId: doc.categoryId,
      });
      await Category.findByIdAndUpdate(doc.categoryId, { productCount: count });
    } catch (error) {
      console.error(
        "Error actualizando contador después de eliminación:",
        error
      );
    }
  }
});

export default mongoose.model<IProduct>("Product", ProductSchema);
