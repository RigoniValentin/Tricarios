import mongoose, { Schema, Document } from "mongoose";

export interface IChatMessage extends Document {
  sender: string;
  message: string;
  createdAt: Date;
}

const ChatMessageSchema: Schema = new Schema({
  sender: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const ChatMessage = mongoose.model<IChatMessage>(
  "ChatMessage",
  ChatMessageSchema
);
