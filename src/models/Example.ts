import mongoose, { Schema, Document } from "mongoose";

export interface Example extends Document {
  category: "conciencia" | "biologia" | "emociones";
  examples: string[];
}

const ExampleSchema: Schema = new Schema<Example>(
  {
    category: {
      type: String,
      required: true,
      enum: ["conciencia", "biologia", "emociones"],
      unique: true,
    },
    examples: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false }
);

export const ExampleModel = mongoose.model<Example>("Example", ExampleSchema);
