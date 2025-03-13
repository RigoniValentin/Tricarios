import mongoose, { Schema } from "mongoose";
import { Question } from "types/QuestionsTypes";

const QuestionSchema: Schema = new Schema<Question>(
  {
    text: { type: String, required: true },
    category: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "answered", "rejected"], // se agrega "rejected"
      default: "pending",
    },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    answerUrl: { type: String, default: undefined }, // nueva propiedad
    rejectComment: { type: String, default: undefined }, // <-- nueva propiedad
  },
  { timestamps: true, versionKey: false }
);

export const QuestionModel = mongoose.model<Question>(
  "Question",
  QuestionSchema
);
