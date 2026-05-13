import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { rgIntegrationConfig } from "@config/rgIntegration";

/**
 * Extiende Request para exponer el raw body capturado por express.json verify().
 */
export interface ExternalAuthRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Verifica que el header `x-api-key` coincida con la API key configurada
 * para Río Gestión. Usa comparación en tiempo constante.
 *
 * Se usa para proteger endpoints administrativos invocados por el propio
 * backend de Río Gestión (ej: forzar un pull).
 */
export function verifyRGApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!rgIntegrationConfig.enabled) {
    res.status(503).json({
      success: false,
      message: "La integración con Río Gestión está deshabilitada",
    });
    return;
  }

  const provided = (req.header("x-api-key") || "").trim();
  const expected = rgIntegrationConfig.apiKey;

  if (!expected) {
    res.status(500).json({
      success: false,
      message: "RG_API_KEY no configurado en el servidor",
    });
    return;
  }

  if (!provided || provided.length !== expected.length) {
    res.status(401).json({ success: false, message: "API key inválida" });
    return;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (!crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ success: false, message: "API key inválida" });
    return;
  }

  next();
}

/**
 * Verifica la firma HMAC-SHA256 (header `X-RG-Signature`) sobre el raw body
 * de la request. Requiere que el middleware json haya guardado `req.rawBody`.
 *
 * Se usa para validar webhooks salientes de Río Gestión.
 */
export function verifyRGSignature(
  req: ExternalAuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!rgIntegrationConfig.enabled) {
    res.status(503).json({
      success: false,
      message: "La integración con Río Gestión está deshabilitada",
    });
    return;
  }

  const secret = rgIntegrationConfig.webhookSecret;
  if (!secret) {
    res.status(500).json({
      success: false,
      message: "RG_WEBHOOK_SECRET no configurado en el servidor",
    });
    return;
  }

  const signature = (req.header("x-rg-signature") || "").trim().toLowerCase();
  if (!signature) {
    res.status(401).json({ success: false, message: "Falta firma X-RG-Signature" });
    return;
  }

  const rawBody = req.rawBody;
  if (!rawBody || rawBody.length === 0) {
    res.status(400).json({ success: false, message: "Body vacío o no capturado" });
    return;
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  // timingSafeEqual requiere mismo length
  if (signature.length !== expected.length) {
    res.status(401).json({ success: false, message: "Firma inválida" });
    return;
  }

  const ok = crypto.timingSafeEqual(
    Buffer.from(signature, "utf8"),
    Buffer.from(expected, "utf8")
  );
  if (!ok) {
    res.status(401).json({ success: false, message: "Firma inválida" });
    return;
  }

  next();
}
