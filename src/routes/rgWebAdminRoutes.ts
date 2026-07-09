import { Router } from "express";
import { verifyToken, getPermissions } from "@middlewares/auth";
import {
  getRGWebStatusForAdmin,
  triggerRGWebSyncForAdmin,
} from "@controllers/rgWebAdminController";

/**
 * Endpoints para el panel admin de la tienda Tricarios.
 * Se montan en `/api/v1/integrations/rgweb`.
 *
 * A diferencia de `/external/rg/*` (que usa la api-key compartida con
 * RG WEB), estos endpoints están protegidos por JWT del usuario admin
 * y normalizan la respuesta al shape esperado por la UI del admin.
 */
const router = Router();

router.get("/status", verifyToken, getPermissions, getRGWebStatusForAdmin);
router.post("/sync", verifyToken, getPermissions, triggerRGWebSyncForAdmin);

export default router;
