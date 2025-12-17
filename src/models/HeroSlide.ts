import mongoose, { Document, Schema } from "mongoose";

export interface IHeroSlide extends Document {
  title?: string;
  subtitle?: string;
  image: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HeroSlideSchema: Schema = new Schema(
  {
    title: {
      type: String,
      required: false,
      trim: true,
      maxlength: [100, "El título no puede exceder 100 caracteres"],
    },
    subtitle: {
      type: String,
      trim: true,
      maxlength: [200, "El subtítulo no puede exceder 200 caracteres"],
    },
    image: {
      type: String,
      required: [true, "La imagen del slide es requerida"],
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
      min: [0, "El orden no puede ser negativo"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret: any) {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Índices
HeroSlideSchema.index({ order: 1 });
HeroSlideSchema.index({ isActive: 1 });

export default mongoose.model<IHeroSlide>("HeroSlide", HeroSlideSchema);
