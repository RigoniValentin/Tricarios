import "module-alias/register";
import app from "@server/server";
import dotenv from "dotenv";
import "@config/mongodb";

dotenv.config();

export const PAYPAL_API_CLIENT = process.env.PAYPAL_API_CLIENT;
export const PAYPAL_API_SECRET = process.env.PAYPAL_API_SECRET;
export const PAYPAL_API = "https://api-m.sandbox.paypal.com";
export const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const PORT = process.env.PORT || 4000;

export const HOST =
  process.env.NODE_ENV === "production"
    ? process.env.HOST
    : "http://localhost:" + PORT;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
