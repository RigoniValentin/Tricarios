import mongoose, { Document, Schema } from "mongoose";

export interface IComment {
  _id?: mongoose.Types.ObjectId;
  author: string;
  authorId?: mongoose.Types.ObjectId;
  authorAvatar?: string;
  content: string;
  createdAt: Date;
}

export interface IReaction {
  userId: string;
  type: "like" | "love" | "clap" | "fire" | "think";
}

export interface IBlogPost extends Document {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  youtubeUrl: string;
  author: string;
  authorId?: mongoose.Types.ObjectId;
  tags: string[];
  published: boolean;
  featured: boolean;
  views: number;
  viewedIps: string[];
  reactions: IReaction[];
  comments: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema: Schema = new Schema(
  {
    author: {
      type: String,
      required: [true, "El nombre del autor es requerido"],
      trim: true,
      maxlength: [100, "El nombre no puede exceder 100 caracteres"],
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: false,
    },
    authorAvatar: {
      type: String,
      default: "",
    },
    content: {
      type: String,
      required: [true, "El contenido del comentario es requerido"],
      trim: true,
      maxlength: [1000, "El comentario no puede exceder 1000 caracteres"],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const ReactionSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["like", "love", "clap", "fire", "think"],
    },
  },
  { _id: false }
);

const BlogPostSchema: Schema = new Schema(
  {
    title: {
      type: String,
      required: [true, "El título es requerido"],
      trim: true,
      maxlength: [200, "El título no puede exceder 200 caracteres"],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    excerpt: {
      type: String,
      required: [true, "El extracto es requerido"],
      trim: true,
      maxlength: [500, "El extracto no puede exceder 500 caracteres"],
    },
    content: {
      type: String,
      required: [true, "El contenido es requerido"],
    },
    coverImage: {
      type: String,
      default: "",
    },
    youtubeUrl: {
      type: String,
      default: "",
      trim: true,
    },
    author: {
      type: String,
      required: [true, "El autor es requerido"],
      trim: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: false,
    },
    tags: {
      type: [String],
      default: [],
    },
    published: {
      type: Boolean,
      default: false,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    viewedIps: {
      type: [String],
      default: [],
      select: false,
    },
    reactions: {
      type: [ReactionSchema],
      default: [],
    },
    comments: {
      type: [CommentSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índices
BlogPostSchema.index({ published: 1, createdAt: -1 });
BlogPostSchema.index({ tags: 1 });
BlogPostSchema.index({ featured: 1 });
BlogPostSchema.index({ title: "text", content: "text", tags: "text" });

// Generar slug automáticamente desde el título
BlogPostSchema.pre("validate", function (this: IBlogPost, next) {
  if (this.title && (!this.slug || this.isModified("title"))) {
    this.slug = this.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      + "-" + Date.now().toString(36);
  }
  next();
});

// Virtual para ID string
BlogPostSchema.virtual("id").get(function (this: IBlogPost) {
  return (this._id as any).toString();
});

// Virtual para conteo de reacciones
BlogPostSchema.virtual("reactionCount").get(function (this: IBlogPost) {
  return this.reactions?.length || 0;
});

// Virtual para conteo de comentarios
BlogPostSchema.virtual("commentCount").get(function (this: IBlogPost) {
  return this.comments?.length || 0;
});

export default mongoose.model<IBlogPost>("BlogPost", BlogPostSchema);
