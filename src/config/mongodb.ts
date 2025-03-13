import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoDbUrl = process.env.MONGODB_URL_STRING;
if (!mongoDbUrl) {
  console.error("MONGODB_URL_STRING is not defined in your environment.");
  process.exit(1);
}

export default (async () => {
  try {
    await mongoose.connect(mongoDbUrl);
    console.log("Conectado a MongoDB");
  } catch (error) {
    console.error("Erroral conectar", error);
    process.exit(1);
  }
})();
