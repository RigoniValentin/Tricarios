import mongoose, { Document, Schema, Model } from "mongoose";

export interface ICategory extends Document {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
  updateProductCount(): Promise<ICategory>;
}

export interface ICategoryModel extends Model<ICategory> {
  updateAllProductCounts(): Promise<ICategory[]>;
}

const CategorySchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, "El nombre de la categoría es requerido"],
      unique: true,
      trim: true,
      maxlength: [100, "El nombre no puede exceder 100 caracteres"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "La descripción no puede exceder 500 caracteres"],
    },
    icon: {
      type: String,
      trim: true,
      maxlength: [10, "El icono no puede exceder 10 caracteres"],
      default: "📦",
    },
    color: {
      type: String,
      trim: true,
      maxlength: [100, "El color no puede exceder 100 caracteres"],
      default: "from-gray-400 to-gray-600",
    },
    productCount: {
      type: Number,
      default: 0,
      min: [0, "El contador de productos no puede ser negativo"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índice para búsquedas
CategorySchema.index({ name: 1 });

// Método para actualizar el contador de productos
CategorySchema.methods.updateProductCount = async function () {
  const Product = mongoose.model("Product");
  const count = await Product.countDocuments({ categoryId: this._id });
  this.productCount = count;
  return this.save();
};

// Método estático para actualizar contadores de todas las categorías
CategorySchema.statics.updateAllProductCounts = async function () {
  const Product = mongoose.model("Product");
  const categories = await this.find();

  for (const category of categories) {
    const count = await Product.countDocuments({ categoryId: category._id });
    category.productCount = count;
    await category.save();
  }

  return categories;
};

export default mongoose.model<ICategory, ICategoryModel>(
  "Category",
  CategorySchema
);
