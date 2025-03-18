import dotenv from "dotenv";
dotenv.config();

import "module-alias/register";
import app from "@server/server";
import "@config/mongodb";

export const PAYPAL_API_CLIENT = process.env.PAYPAL_API_CLIENT;
export const PAYPAL_API_SECRET = process.env.PAYPAL_API_SECRET;
// Use production API if in production; otherwise use sandbox.
export const PAYPAL_API =
  process.env.NODE_ENV === "production"
    ? "https://api-m.sandbox.paypal.com" /*"https://api-m.paypal.com"*/
    : "https://api-m.sandbox.paypal.com";
export const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const PORT = process.env.PORT || 3010;

export const HOST =
  process.env.NODE_ENV === "production"
    ? process.env.HOST || "https://pilatestransmissionsarah.com"
    : "http://localhost:" + PORT;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
