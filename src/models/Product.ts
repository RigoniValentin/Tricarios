import mongoose, { Document, Schema } from "mongoose";

export interface IProduct extends Document {
  name: string;
  price: number;
  description: string;
  category: mongoose.Types.ObjectId;
  stock: number;
  image: string; // Imagen principal
  images: string[]; // Array de todas las imágenes (máximo 4)
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
    price: {
      type: Number,
      required: [true, "El precio es requerido"],
      min: [0, "El precio no puede ser negativo"],
    },
    description: {
      type: String,
      required: [true, "La descripción es requerida"],
      trim: true,
      maxlength: [2000, "La descripción no puede exceder 2000 caracteres"],
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "La categoría es requerida"],
    },
    stock: {
      type: Number,
      required: [true, "El stock es requerido"],
      min: [0, "El stock no puede ser negativo"],
      default: 0,
    },
    image: {
      type: String,
      required: false, // Se establece automáticamente en el middleware pre('save')
    },
    images: {
      type: [String],
      validate: {
        validator: function (v: string[]) {
          return v && v.length <= 4 && v.length >= 1;
        },
        message: "Debe tener entre 1 y 4 imágenes máximo",
      },
      required: [true, "Al menos una imagen es requerida"],
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
ProductSchema.index({ price: 1 });
ProductSchema.index({ stock: 1 });

// Middleware para establecer imagen principal automáticamente
ProductSchema.pre("save", function (this: IProduct, next) {
  console.log(
    `🔧 Pre-save middleware ejecutándose para producto: ${this.name}`
  );
  console.log(`📷 Imágenes recibidas:`, this.images);

  try {
    if (this.images && this.images.length > 0) {
      this.image = this.images[0]; // La primera imagen es siempre la principal
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

    if (this.images && this.images.length > 4) {
      console.log(
        `❌ Demasiadas imágenes: ${this.images.length}, máximo permitido: 4`
      );
      return next(
        new Error("No se pueden tener más de 4 imágenes por producto")
      );
    }

    // Solo validar imágenes obligatorias para productos nuevos
    if (this.isNew && (!this.images || this.images.length === 0)) {
      console.log(`❌ Producto nuevo sin imágenes`);
      return next(new Error("Debe tener al menos una imagen"));
    }

    console.log(
      `✅ Validación de imágenes exitosa: ${this.images?.length || 0} imágenes`
    );
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

// Middleware para populate automático de categoría
ProductSchema.pre(/^find/, function (this: any, next) {
  this.populate({
    path: "category",
    select: "name description",
  });
  next();
});

export default mongoose.model<IProduct>("Product", ProductSchema);
