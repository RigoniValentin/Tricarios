import mongoose, { Document, Schema, Model } from "mongoose";

export interface ICategory extends Document {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  productCount: number;
  parentCategoryId?: mongoose.Types.ObjectId | null;
  isParent: boolean;
  level: number;
  subcategories?: ICategory[];
  createdAt: Date;
  updatedAt: Date;
  updateProductCount(): Promise<ICategory>;
}

export interface ICategoryModel extends Model<ICategory> {
  updateAllProductCounts(): Promise<ICategory[]>;
  buildHierarchy(categories?: ICategory[]): Promise<ICategory[]>;
  migrateExistingCategories(): Promise<any>;
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
    parentCategoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null, // null para categorías padre
    },
    isParent: {
      type: Boolean,
      default: false,
    },
    level: {
      type: Number,
      default: 0,
      min: [0, "El nivel no puede ser negativo"],
      max: [3, "Máximo 3 niveles de profundidad permitidos"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índices para búsquedas y jerarquías
CategorySchema.index({ name: 1 });
CategorySchema.index({ parentCategoryId: 1 });
CategorySchema.index({ level: 1 });
CategorySchema.index({ isParent: 1 });

// Pre-save middleware para validar jerarquías
CategorySchema.pre("save", async function (next) {
  try {
    const CategoryModel = this.constructor as ICategoryModel;
    
    // Si tiene categoría padre
    if (this.parentCategoryId) {
      const parent = await CategoryModel.findById(this.parentCategoryId);
      if (!parent) {
        throw new Error("Categoría padre no existe");
      }

      // Verificar límite de profundidad
      if (parent.level >= 3) {
        throw new Error("Se ha alcanzado el límite máximo de profundidad (3 niveles)");
      }

      // Verificar que no sea una referencia circular
      let current: ICategory | null = parent;
      const visitedIds = new Set<string>();
      
      while (current && current.parentCategoryId) {
        const currentId = current._id?.toString();
        if (!currentId) break;
        
        if (visitedIds.has(currentId)) {
          throw new Error("Referencia circular detectada en la jerarquía");
        }
        
        if (current.parentCategoryId.toString() === this._id?.toString()) {
          throw new Error("Referencia circular detectada: una categoría no puede ser padre de sí misma");
        }
        
        visitedIds.add(currentId);
        current = await CategoryModel.findById(current.parentCategoryId);
        if (!current) break;
      }

      // Establecer nivel basado en el padre
      this.level = parent.level + 1;
      this.isParent = false;

      // Actualizar padre para marcarlo como isParent si no lo está ya
      if (!parent.isParent) {
        parent.isParent = true;
        await parent.save();
      }
    } else {
      // Es una categoría raíz
      this.level = 0;
      // Verificar si ya tiene subcategorías para determinar isParent
      if (this._id) {
        const hasSubcategories = await CategoryModel.exists({ 
          parentCategoryId: this._id 
        });
        this.isParent = !!hasSubcategories;
      }
    }

    next();
  } catch (error) {
    next(error as Error);
  }
});

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

// Método estático para construir jerarquía de categorías
CategorySchema.statics.buildHierarchy = async function (categories?: ICategory[]) {
  const allCategories = categories || await this.find().populate("parentCategoryId", "name").sort({ name: 1 });

  const categoryMap = new Map<string, any>();
  const rootCategories: any[] = [];

  // Crear mapa de categorías con estructura extendida
  allCategories.forEach((cat: any) => {
    const categoryObj = cat.toObject ? cat.toObject() : cat;
    categoryMap.set(categoryObj._id.toString(), {
      ...categoryObj,
      subcategories: [],
    });
  });

  // Construir jerarquía
  allCategories.forEach((cat: any) => {
    const categoryObj = cat.toObject ? cat.toObject() : cat;
    const categoryWithSubs = categoryMap.get(categoryObj._id.toString());

    if (categoryObj.parentCategoryId) {
      const parent = categoryMap.get(categoryObj.parentCategoryId.toString());
      if (parent) {
        parent.subcategories.push(categoryWithSubs);
      }
    } else {
      rootCategories.push(categoryWithSubs);
    }
  });

  return rootCategories;
};

// Método estático para migrar categorías existentes
CategorySchema.statics.migrateExistingCategories = async function () {
  try {
    console.log("🔄 Iniciando migración de categorías existentes...");

    // Agregar campos faltantes a categorías existentes
    const result = await this.updateMany(
      { 
        $or: [
          { parentCategoryId: { $exists: false } },
          { isParent: { $exists: false } },
          { level: { $exists: false } }
        ]
      },
      {
        $set: {
          parentCategoryId: null,
          isParent: false,
          level: 0,
        },
      }
    );

    console.log(`✅ Migración completada: ${result.modifiedCount} categorías actualizadas`);
    return result;
  } catch (error) {
    console.error("❌ Error en migración:", error);
    throw error;
  }
};

export default mongoose.model<ICategory, ICategoryModel>(
  "Category",
  CategorySchema
);
