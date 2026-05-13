import axios, { AxiosInstance, AxiosError } from "axios";
import https from "https";
import mongoose from "mongoose";
import { rgIntegrationConfig } from "@config/rgIntegration";
import Product, { IProduct } from "@models/Product";
import Category from "@models/Category";
import { logIntegrationEvent } from "@models/IntegrationLog";

/**
 * Servicio de integración con Río Gestión (ERP).
 *
 * Responsabilidades:
 *  - PULL: traer el snapshot de catálogo desde RG y sincronizar Productos.
 *  - PUSH: enviar órdenes confirmadas hacia RG.
 *  - UPSERT: aplicar payloads de webhook entrantes (`stock.updated`, `stock.full_sync`).
 *
 * Diseño:
 *  - Todas las operaciones son "best-effort": loguean a `IntegrationLog`
 *    y nunca propagan excepciones al flujo del cliente.
 *  - La clave canónica de vinculación es `Product.managementId` ↔ `PRODUCTO_ID` en RG.
 */

// ── Contratos ───────────────────────────────────────────────────────────────

export interface RGStockSyncItem {
  PRODUCTO_ID: number;
  CODIGO: string | null;
  NOMBRE: string;
  PRECIO: number;
  STOCK: number;
  ACTIVO: boolean;
  CODIGO_BARRAS?: string | null;
}

export interface RGStockSyncResponse {
  count: number;
  items: RGStockSyncItem[];
}

export interface RGOrderItem {
  productoId: number;
  cantidad: number;
  precioUnitario?: number;
  descuento?: number;
}

export interface RGOrderPayload {
  externalOrderId: string;
  cliente?: {
    nombre?: string;
    email?: string;
    telefono?: string;
    documento?: string;
  };
  items: RGOrderItem[];
  observaciones?: string;
  metodoPago?: string;
}

export interface UpsertReport {
  received: number;
  updated: number;
  skipped: number;
  errors: number;
}

// ── HTTP client ─────────────────────────────────────────────────────────────

let cachedClient: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (cachedClient) return cachedClient;

  // Para túneles Cloudflare (trycloudflare.com) el VPS puede no tener
  // la CA intermedia en su store. Usamos un agente que permite la cadena
  // de Cloudflare sin deshabilitar TLS globalmente.
  const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
  });

  cachedClient = axios.create({
    baseURL: rgIntegrationConfig.baseUrl,
    timeout: rgIntegrationConfig.requestTimeoutMs,
    httpsAgent,
    headers: {
      "x-api-key": rgIntegrationConfig.apiKey,
      "Content-Type": "application/json",
      "User-Agent": "TricariosFront/1.0",
    },
    // Aceptamos cualquier status para poder loguearlo nosotros mismos.
    validateStatus: () => true,
  });
  return cachedClient;
}

function describeAxiosError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError;
    return `${ax.code || "AXIOS_ERROR"}: ${ax.message}`;
  }
  return (err as Error)?.message || "Error desconocido";
}

// ── PULL: catálogo ──────────────────────────────────────────────────────────

/**
 * Trae el snapshot completo de productos VENTA_WEB desde RG y aplica
 * el upsert sobre `Product`.
 */
export async function pullCatalog(): Promise<{
  ok: boolean;
  message: string;
  report?: UpsertReport;
}> {
  if (!rgIntegrationConfig.enabled) {
    return { ok: false, message: "Integración deshabilitada" };
  }

  const started = Date.now();
  try {
    const res = await getClient().get<RGStockSyncResponse>(
      "/api/external/sync-stock"
    );
    const duration = Date.now() - started;

    if (res.status < 200 || res.status >= 300) {
      await logIntegrationEvent({
        direction: "OUTBOUND",
        eventType: "catalog.pull",
        status: "ERROR",
        httpStatus: res.status,
        targetUrl: "/api/external/sync-stock",
        errorMessage: `HTTP ${res.status}`,
        responseBody: res.data,
        durationMs: duration,
      });
      return { ok: false, message: `HTTP ${res.status}` };
    }

    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    const report = await upsertProductsFromRG(items);

    await logIntegrationEvent({
      direction: "OUTBOUND",
      eventType: "catalog.pull",
      status: report.errors > 0 ? "PARTIAL" : "SUCCESS",
      httpStatus: res.status,
      targetUrl: "/api/external/sync-stock",
      payload: { received: items.length },
      responseBody: report,
      durationMs: duration,
    });

    return { ok: true, message: "OK", report };
  } catch (err) {
    const msg = describeAxiosError(err);
    await logIntegrationEvent({
      direction: "OUTBOUND",
      eventType: "catalog.pull",
      status: "ERROR",
      targetUrl: "/api/external/sync-stock",
      errorMessage: msg,
      durationMs: Date.now() - started,
    });
    return { ok: false, message: msg };
  }
}

// ── UPSERT: aplica items (de webhook o pull) sobre Product ──────────────────

/**
 * Inserta o actualiza productos a partir de un payload del backend de RG.
 *
 * Política:
 *  - Si existe Product con `managementId === item.PRODUCTO_ID` → update (price, stock, name).
 *  - Si no existe Y `RG_DEFAULT_CATEGORY_ID` está seteado → crea un Product nuevo.
 *  - Si no existe y no hay categoría por defecto → se omite (skipped).
 *
 *  Actualiza también `inStock = stockCount > 0`.
 */
export async function upsertProductsFromRG(
  items: RGStockSyncItem[]
): Promise<UpsertReport> {
  const report: UpsertReport = {
    received: items.length,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  if (!items || items.length === 0) return report;

  // Resolución (perezosa) de la categoría por defecto para nuevos productos.
  let defaultCategory: { _id: mongoose.Types.ObjectId; name: string } | null = null;
  const defaultCategoryIdRaw = rgIntegrationConfig.defaultCategoryId;
  if (defaultCategoryIdRaw && mongoose.isValidObjectId(defaultCategoryIdRaw)) {
    try {
      const cat = await Category.findById(defaultCategoryIdRaw).lean();
      if (cat) defaultCategory = { _id: cat._id as mongoose.Types.ObjectId, name: cat.name };
    } catch {
      /* noop */
    }
  }

  for (const item of items) {
    if (!item || typeof item.PRODUCTO_ID !== "number" || item.PRODUCTO_ID <= 0) {
      report.skipped++;
      continue;
    }

    try {
      const stockCount = Math.max(0, Math.floor(Number(item.STOCK) || 0));
      const price = Math.max(0, Number(item.PRECIO) || 0);
      const inStock = item.ACTIVO !== false && stockCount > 0;

      const update: any = {
        price,
        stockCount,
        inStock,
      };
      // Solo pisamos el nombre si viene válido (no romper edición manual del front).
      if (typeof item.NOMBRE === "string" && item.NOMBRE.trim().length > 0) {
        update.name = item.NOMBRE.trim().slice(0, 200);
      }

      const updated = await Product.findOneAndUpdate(
        { managementId: item.PRODUCTO_ID },
        { $set: update },
        { new: true }
      );

      if (updated) {
        report.updated++;
        continue;
      }

      // No existe → si tenemos categoría por defecto, lo creamos.
      if (!defaultCategory) {
        report.skipped++;
        continue;
      }

      await Product.create({
        managementId: item.PRODUCTO_ID,
        name: (item.NOMBRE || `Producto ${item.PRODUCTO_ID}`).slice(0, 200),
        description: (item.NOMBRE || `Producto ${item.PRODUCTO_ID}`).slice(0, 2000),
        price,
        stockCount,
        inStock,
        category: defaultCategory.name,
        categoryId: defaultCategory._id,
        featured: false,
        rating: 0,
        reviews: 0,
        tags: [],
        specifications: {},
        gallery: [],
      });
      report.updated++;
    } catch (err) {
      report.errors++;
      console.error(
        `[rgIntegration] error upsert managementId=${item.PRODUCTO_ID}:`,
        (err as Error).message
      );
    }
  }

  return report;
}

// ── PUSH: orden hacia RG ────────────────────────────────────────────────────

/**
 * Envía una orden a RG. Best-effort: NUNCA lanza, devuelve { ok, ... }.
 *
 * Idempotencia: el caller DEBE proveer un `externalOrderId` único y estable
 * (ej: el `_id` del Order de Mongo o el `payment_id` de MP).
 */
export async function pushOrder(
  order: RGOrderPayload
): Promise<{ ok: boolean; message: string; httpStatus?: number; responseBody?: any }> {
  if (!rgIntegrationConfig.enabled) {
    return { ok: false, message: "Integración deshabilitada" };
  }

  if (!order?.externalOrderId || !Array.isArray(order.items) || order.items.length === 0) {
    return { ok: false, message: "Payload inválido (externalOrderId/items)" };
  }

  const started = Date.now();
  try {
    const res = await getClient().post("/api/external/orders", order);
    const duration = Date.now() - started;
    const ok = res.status >= 200 && res.status < 300;

    await logIntegrationEvent({
      direction: "OUTBOUND",
      eventType: "order.push",
      status: ok ? "SUCCESS" : "ERROR",
      httpStatus: res.status,
      targetUrl: "/api/external/orders",
      payload: order,
      responseBody: res.data,
      errorMessage: ok ? null : `HTTP ${res.status}`,
      durationMs: duration,
    });

    return {
      ok,
      message: ok ? "Orden enviada" : `HTTP ${res.status}`,
      httpStatus: res.status,
      responseBody: res.data,
    };
  } catch (err) {
    const msg = describeAxiosError(err);
    await logIntegrationEvent({
      direction: "OUTBOUND",
      eventType: "order.push",
      status: "ERROR",
      targetUrl: "/api/external/orders",
      payload: order,
      errorMessage: msg,
      durationMs: Date.now() - started,
    });
    return { ok: false, message: msg };
  }
}

/**
 * Helper: dado un array de items "del carrito" (cualquier estructura con
 * managementId o referencia a Product), arma un payload válido para `pushOrder`.
 * Items sin managementId se omiten (no se pueden vincular a RG).
 */
export async function buildOrderItemsFromCart(
  cart: Array<{
    productId?: string;
    managementId?: number;
    quantity: number;
    unit_price?: number;
    title?: string;
  }>
): Promise<RGOrderItem[]> {
  const out: RGOrderItem[] = [];
  for (const c of cart) {
    if (!c || !c.quantity || c.quantity <= 0) continue;

    let managementId: number | undefined = typeof c.managementId === "number" ? c.managementId : undefined;

    // Resolver por productId (Mongo _id) si no vino el managementId.
    if (!managementId && c.productId && mongoose.isValidObjectId(c.productId)) {
      const prod = await Product.findById(c.productId).select("managementId").lean<Pick<IProduct, "managementId">>();
      if (prod?.managementId) managementId = prod.managementId;
    }

    // Último recurso: buscar por nombre exacto.
    if (!managementId && c.title) {
      const prod = await Product.findOne({ name: c.title.trim() })
        .select("managementId")
        .lean<Pick<IProduct, "managementId">>();
      if (prod?.managementId) managementId = prod.managementId;
    }

    if (!managementId) continue;

    out.push({
      productoId: managementId,
      cantidad: c.quantity,
      ...(typeof c.unit_price === "number" ? { precioUnitario: c.unit_price } : {}),
    });
  }
  return out;
}
