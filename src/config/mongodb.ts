import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoDbUrl = process.env.MONGODB_URL_STRING as string;

export default (async () => {
  try {
    await mongoose.connect(mongoDbUrl);
    console.log("Conectado a MongoDB");
  } catch (error) {
    console.log("Erroral conectar", error);
    process.exit(1);
  }
})();
