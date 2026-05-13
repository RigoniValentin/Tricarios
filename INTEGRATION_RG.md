# Integración Tricarios ↔ Río Gestión (RG ERP)

Este módulo implementa la sincronización bidireccional entre la tienda Tricarios y el sistema de gestión Río Gestión (RG). Está pensado como **plantilla base** para futuras integraciones de tiendas con RG.

## Arquitectura

```
   ┌────────────────────┐                            ┌─────────────────────┐
   │      RG WEB        │   webhook (HMAC sha256)    │  Tricarios Backend  │
   │                    │ ───────────────────────▶   │  /api/v1/external   │
   │  - Maestro productos                            │                     │
   │  - Stock real      │   GET sync-stock (x-api-key)│  - upsert Product  │
   │  - Ventas          │ ◀───────────────────────   │                     │
   │                    │   POST orders   (x-api-key)│  - push order      │
   └────────────────────┘ ◀───────────────────────   └─────────────────────┘
```

- **Catálogo / Stock**: RG es la fuente de verdad. Tricarios solo refleja.
- **Órdenes**: Tricarios envía órdenes confirmadas a RG, que las registra como ventas reales.
- **Vínculo entre productos**: campo `managementId` en Mongo ↔ `PRODUCTO_ID` en RG.

## Variables de entorno

Ver `.env.example`. Mínimamente:

```
RG_API_BASE_URL=https://gestion.tu-cliente.com
RG_API_KEY=<api-key emitida desde RG → Configuración → Integraciones>
RG_WEBHOOK_SECRET=<secreto compartido para HMAC>
RG_DEFAULT_CATEGORY_ID=<ObjectId de Mongo, opcional>
RG_INTEGRATION_ENABLED=true
```

> `RG_INTEGRATION_ENABLED=false` desactiva todo el módulo sin tocar código.

## Endpoints expuestos (`/api/v1/external/rg`)

| Método | Ruta                  | Auth                            | Descripción                                   |
|--------|-----------------------|---------------------------------|-----------------------------------------------|
| POST   | `/webhook/stock`      | HMAC (`X-RG-Signature`)         | Recibe `stock.updated` / `stock.full_sync`   |
| POST   | `/pull`               | `x-api-key`                      | Fuerza un pull completo del catálogo         |
| GET    | `/status`             | `x-api-key`                      | Estado de configuración + último evento      |
| GET    | `/logs?limit=50`      | `x-api-key`                      | Bitácora de eventos                          |

## Configuración en RG (lado servidor)

1. RG → Configuración → Integraciones → **Generar API Key** (copiarla a `RG_API_KEY`).
2. RG → Configuración → Integraciones → Webhook:
   - URL: `https://tricariosgrowshop.com/api/v1/external/rg/webhook/stock`
   - Secreto: el mismo valor que `RG_WEBHOOK_SECRET`.
   - **Probar conexión** debería devolver 200.
3. En cada producto del maestro, marcar `Venta Web = ON` para exponerlo a la tienda.

## Recibir cambios desde RG (INBOUND)

RG dispara automáticamente un webhook a `/webhook/stock` cuando cambia el stock o el precio de un producto `Venta Web`. El middleware `verifyRGSignature` valida la firma HMAC sobre el raw body.

Body esperado:

```json
{
  "event": "stock.updated",
  "timestamp": "2026-05-13T14:00:00.000Z",
  "data": {
    "items": [
      {
        "PRODUCTO_ID": 1234,
        "CODIGO": "ABC-001",
        "NOMBRE": "Producto X",
        "PRECIO": 9500,
        "STOCK": 12,
        "ACTIVO": true,
        "CODIGO_BARRAS": "7790..."
      }
    ]
  }
}
```

Política de upsert (`upsertProductsFromRG`):

- Si existe `Product.managementId === PRODUCTO_ID` → actualiza `price`, `stockCount`, `inStock`, `name`.
- Si no existe **y** `RG_DEFAULT_CATEGORY_ID` está configurado → lo crea con esa categoría.
- Si no existe **y** no hay categoría por defecto → se omite (queda como `skipped`).

## Enviar órdenes a RG (OUTBOUND)

Desde cualquier flujo de checkout, después de confirmar el pago:

```ts
import { pushOrder, buildOrderItemsFromCart } from "@services/rgIntegration.service";

const items = await buildOrderItemsFromCart(cartItems);
if (items.length > 0) {
  // Fire-and-forget: nunca afecta la respuesta al cliente.
  pushOrder({
    externalOrderId: order._id.toString(), // ID estable y único
    cliente: {
      nombre: user.name,
      email: user.email,
      telefono: user.phone,
    },
    items,
    metodoPago: "mercadopago",
    observaciones: `Tienda Tricarios - MP payment ${paymentId}`,
  }).catch(() => {
    /* el servicio ya loguea a IntegrationLog */
  });
}
```

> El backend RG es **idempotente**: usa el `externalOrderId` como tag interno
> (`[EXT:<id>]` en `VENTAS.OBSERVACIONES`). Reenviar la misma orden no duplica
> la venta.

## Diagnóstico

```bash
curl -H "x-api-key: $RG_API_KEY" https://tricariosgrowshop.com/api/v1/external/rg/status
curl -H "x-api-key: $RG_API_KEY" https://tricariosgrowshop.com/api/v1/external/rg/logs?limit=20
```

Los eventos quedan en la colección `integrationlogs` con TTL de 30 días.

## Ejecutar un pull manual

```bash
curl -X POST -H "x-api-key: $RG_API_KEY" https://tricariosgrowshop.com/api/v1/external/rg/pull
```

Equivalente al botón **Sincronizar catálogo completo** en RG → Integraciones.

## Cómo usar este módulo como base para otra tienda

1. Copiar `src/config/rgIntegration.ts`, `src/middlewares/externalAuth.ts`,
   `src/services/rgIntegration.service.ts`, `src/controllers/externalSyncController.ts`,
   `src/routes/externalRoutes.ts` y `src/models/IntegrationLog.ts`.
2. Asegurar que el modelo de producto destino tenga el campo `managementId: Number`
   indexado y único (sparse).
3. Capturar el `rawBody` en el middleware json (ver `server/server.ts`).
4. Montar `externalRoutes` en `/api/v1/external`.
5. Configurar las variables `RG_*` y emitir la API key desde RG.
