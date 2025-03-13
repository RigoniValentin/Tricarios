import { Document } from "mongoose";

export interface Training extends Document {
  name: string;
  cupos: number;
}
