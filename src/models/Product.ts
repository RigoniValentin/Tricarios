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
  category: string; // Nombre de la categoría
  categoryId: mongoose.Types.ObjectId; // ID de la categoría
  image: string; // Imagen principal
  gallery: string[]; // Array de todas las imágenes (máximo 4)
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
          return !v || v.length <= 4; // Validamos solo si existe
        },
        message: "Máximo 4 imágenes permitidas",
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
  console.log(
    `🔧 Pre-save middleware ejecutándose para producto: ${this.name}`
  );
  console.log(`📷 Imágenes recibidas:`, this.gallery);

  try {
    if (this.gallery && this.gallery.length > 0) {
      this.image = this.gallery[0]; // La primera imagen es siempre la principal
      console.log(`✅ Imagen principal establecida: ${this.image}`);
    } else {
      console.log(`⚠️  No se encontraron imágenes en el array`);
      // Si no hay imágenes pero ya existe una imagen principal, mantenerla
      if (!this.image) {
        console.log(`❌ No hay imagen principal y no hay imágenes en el array`);
      }
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
    console.log(`🔍 Validando imágenes para producto: ${this.name}`);
    console.log(`📷 Gallery recibido en middleware:`, this.gallery);
    console.log(
      `📷 Tipo de gallery:`,
      typeof this.gallery,
      Array.isArray(this.gallery)
    );

    if (this.gallery && this.gallery.length > 4) {
      console.log(
        `❌ Demasiadas imágenes: ${this.gallery.length}, máximo permitido: 4`
      );
      return next(
        new Error("No se pueden tener más de 4 imágenes por producto")
      );
    }

    // Si no hay imágenes, usar imagen por defecto
    if (!this.gallery || this.gallery.length === 0) {
      console.log(`📷 Usando imagen por defecto para producto sin imágenes`);
      this.gallery = ["/uploads/products/default-product.png"];
      this.image = "/uploads/products/default-product.png";
    } else {
      // Si hay imágenes, la primera es la principal
      console.log(`📷 Usando galería existente:`, this.gallery);
      this.image = this.gallery[0];
    }

    console.log(
      `✅ Validación de imágenes exitosa: ${this.gallery?.length || 0} imágenes`
    );
    console.log(`✅ Imagen principal final:`, this.image);
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
    console.log(
      `📊 Contador de productos actualizado para categoría ${doc.categoryId}: ${count}`
    );
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
      console.log(
        `📊 Contador de productos actualizado después de eliminación para categoría ${doc.categoryId}: ${count}`
      );
    } catch (error) {
      console.error(
        "Error actualizando contador después de eliminación:",
        error
      );
    }
  }
});

export default mongoose.model<IProduct>("Product", ProductSchema);
