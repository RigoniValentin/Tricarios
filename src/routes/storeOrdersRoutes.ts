import { Router } from "express";
import { createStoreOrder } from "../controllers/storeOrdersController";

/**
 * Rutas BFF de la tienda (TricariosFront -> TricariosBack -> RG WEB).
 * Se monta en `/api/v1/store`.
 *
 * NO usar `verifyRGApiKey` aquí: el frontend habla con su propio backend.
 * La protección debe ser por sesión/JWT del usuario logueado de la tienda
 * (cuando aplique) más rate-limiting. Para checkout anónimo, este endpoint
 * queda público pero respaldado por idempotencia + validación.
 */
const router = Router();

router.post("/orders", createStoreOrder);

export default router;
