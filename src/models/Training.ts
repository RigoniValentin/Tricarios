import mongoose, { Schema, Document } from "mongoose";

export interface Training extends Document {
  name: string;
  cupos: number;
}

const TrainingSchema: Schema = new Schema<Training>(
  {
    name: { type: String, required: true, unique: true },
    cupos: { type: Number, required: true, default: 10 },
  },
  { timestamps: true, versionKey: false }
);

export const TrainingModel = mongoose.model<Training>(
  "Training",
  TrainingSchema
);
