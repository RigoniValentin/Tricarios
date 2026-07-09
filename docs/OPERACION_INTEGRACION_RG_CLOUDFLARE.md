# Runbook: Integracion Rio Gestion, Tricarios y Cloudflare

Esta guia es para operar la integracion cuando algo falla, sin tener que leer el codigo cada vez. Cubre Rio Gestion WEB, TricariosBack, TricariosFront y el puente de Cloudflare.

## Resumen rapido

El flujo real es este:

```text
TricariosFront
  usa /api/v1 en el mismo dominio publico
        |
        v
TricariosBack
  - sirve API y frontend publico
  - recibe webhooks de Rio Gestion en /api/v1/external/rg/webhook/stock
  - consulta Rio Gestion por el tunel en RG_API_BASE_URL
        |
        v
Cloudflare Tunnel
  expone el Rio Gestion local hacia internet sin abrir puertos entrantes
        |
        v
Rio Gestion WEB
  - fuente de verdad de productos, precios y stock
  - expone /api/external/* para TricariosBack
  - envia webhooks al backend de Tricarios
```

Reglas importantes:

- Rio Gestion es la fuente de verdad para productos marcados como `VENTA_WEB`.
- TricariosBack guarda los productos en Mongo usando `Product.managementId = PRODUCTO_ID` de Rio Gestion.
- TricariosFront no habla con Rio Gestion directamente; solo llama a TricariosBack con rutas relativas `/api/v1`.
- La URL `trycloudflare.com` es temporal si se usa un tunel rapido. Si el tunel se reinicia, puede cambiar y hay que actualizar `RG_API_BASE_URL` en TricariosBack.

## Piezas del codigo

Rio Gestion WEB:

- Panel administrativo: `Configuracion > Integraciones`.
- Endpoints externos: `GET /api/external/health`, `GET /api/external/sync-stock`, `POST /api/external/orders`.
- Logs SQL: tabla `INTEGRACIONES_SYNC_LOGS`.
- API keys SQL: tabla `INTEGRACIONES_API_KEYS`.
- Configuracion SQL: tabla `INTEGRACIONES_CONFIG`.
- Worker de webhooks: envia cambios de stock/precio cada 5 segundos, con reintentos.

TricariosBack:

- Variables `RG_*` en `.env`.
- Endpoints de diagnostico: `/api/v1/external/rg/status` y `/api/v1/external/rg/logs`.
- Pull manual: `POST /api/v1/external/rg/pull`.
- Webhook entrante: `POST /api/v1/external/rg/webhook/stock` con firma `X-RG-Signature`.
- Logs Mongo: coleccion `integrationlogs`, con vencimiento automatico a 30 dias.

TricariosFront:

- Usa `src/config/api.ts` con `API_BASE_URL = "/api/v1"`.
- En produccion debe estar servido por el mismo backend/dominio que TricariosBack.

## Variables sensibles

No pegues estas claves en documentacion, tickets, capturas ni chats:

- `RG_API_KEY`: clave emitida desde Rio Gestion. TricariosBack la usa para llamar a Rio Gestion y proteger endpoints de diagnostico/pull.
- `RG_WEBHOOK_SECRET`: secreto compartido para firmar y validar webhooks HMAC.
- Tokens de MercadoPago, PayPal, JWT, SMTP y cualquier `.env` real.

Si una clave se filtro, accion recomendada:

1. En Rio Gestion, revocar la API key vieja.
2. Generar una API key nueva.
3. Actualizar `RG_API_KEY` en TricariosBack.
4. Reiniciar TricariosBack.
5. Probar salud y sincronizacion.

## Chequeos de salud

### 1. Rio Gestion local

En la PC donde corre Rio Gestion:

```powershell
irm http://localhost:<PUERTO_RG>/api/health
```

Si esto falla, el problema no es Cloudflare: Rio Gestion no esta levantado, el puerto no es el correcto o no puede iniciar por base de datos/configuracion.

### 2. Rio Gestion por Cloudflare Tunnel

Desde cualquier maquina con internet:

```powershell
$headers = @{ "x-api-key" = $env:RG_API_KEY }
irm "$env:RG_API_BASE_URL/api/external/health" -Headers $headers
```

Resultado esperado: `status = ok`.

Si local funciona pero por tunel falla, revisar `cloudflared`.

### 3. TricariosBack y modulo RG

```powershell
$headers = @{ "x-api-key" = $env:RG_API_KEY }
irm "https://tricariosgrowshop.com/api/v1/external/rg/status" -Headers $headers
```

Resultado esperado:

- `success = true`
- `config.enabled = true`
- `config.hasBaseUrl = true`
- `config.hasApiKey = true`
- `config.hasWebhookSecret = true`

Ultimos logs:

```powershell
irm "https://tricariosgrowshop.com/api/v1/external/rg/logs?limit=20" -Headers $headers
```

### 4. Script guiado

Desde `TricariosBack`:

```powershell
$env:RG_API_BASE_URL = "https://tu-tunel-o-dominio"
$env:RG_API_KEY = "pegar-api-key-solo-en-la-terminal"
powershell -ExecutionPolicy Bypass -File .\scripts\diagnosticar-integracion-rg.ps1
```

Para forzar un pull desde TricariosBack hacia Rio Gestion:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\diagnosticar-integracion-rg.ps1 -Pull
```

## Reiniciar la integracion

### Caso A: se usa tunel rapido `trycloudflare.com`

1. En la PC de Rio Gestion, confirmar que Rio Gestion local responde: `http://localhost:<PUERTO_RG>/api/health`.
2. Cerrar el proceso viejo de `cloudflared` si quedo abierto.
3. Levantar el tunel de nuevo:

```powershell
cloudflared tunnel --url http://localhost:<PUERTO_RG>
```

4. Copiar la nueva URL `https://...trycloudflare.com`.
5. Actualizar `RG_API_BASE_URL` en el `.env` real de TricariosBack.
6. Reiniciar TricariosBack.
7. Ejecutar el script de diagnostico.

Este modo sirve para pruebas, pero no es ideal para produccion porque la URL puede cambiar.

### Caso B: se usa tunel nombrado con dominio estable

Acciones tipicas en Windows:

```powershell
cloudflared tunnel list
cloudflared tunnel info <NOMBRE_TUNEL>
cloudflared tunnel run <NOMBRE_TUNEL>
```

Si esta instalado como servicio:

```powershell
Get-Service cloudflared
Restart-Service cloudflared
```

La recomendacion para soporte es usar tunel nombrado y un hostname estable, por ejemplo `rg.tricariosgrowshop.com`, en vez de depender de una URL `trycloudflare.com`.

Ejemplo conceptual de `config.yml` para tunel nombrado:

```yaml
tunnel: <tunnel-id>
credentials-file: C:\Users\<usuario>\.cloudflared\<tunnel-id>.json

ingress:
  - hostname: rg.tricariosgrowshop.com
    service: http://localhost:<PUERTO_RG>
  - service: http_status:404
```

Comandos habituales de alta inicial:

```powershell
cloudflared tunnel login
cloudflared tunnel create rg-tricarios
cloudflared tunnel route dns rg-tricarios rg.tricariosgrowshop.com
cloudflared service install
```

## Sincronizar catalogo y stock

Desde Rio Gestion:

1. Ir a `Configuracion > Integraciones > Webhook`.
2. Presionar `Probar conexion`.
3. Presionar `Sincronizar catalogo completo`.
4. Ver la pestana `Logs`.

Desde TricariosBack:

```powershell
$headers = @{ "x-api-key" = $env:RG_API_KEY }
irm -Method Post "https://tricariosgrowshop.com/api/v1/external/rg/pull" -Headers $headers
```

Diferencia entre ambos caminos:

- Rio Gestion `Sincronizar catalogo completo`: Rio Gestion empuja todos los `VENTA_WEB` hacia TricariosBack por webhook.
- TricariosBack `/pull`: TricariosBack consulta a Rio Gestion por el tunel y trae el snapshot completo.

## Diagnostico por sintomas

### El frontend no carga productos o imagenes

1. Revisar que TricariosBack este arriba.
2. Probar `https://tricariosgrowshop.com/api/v1/products`.
3. Confirmar que TricariosFront siga usando `/api/v1` y no una URL local.
4. Si productos existen pero sin stock/precio actualizado, revisar integracion RG.

### TricariosBack no puede traer productos desde Rio Gestion

1. Probar Rio Gestion local.
2. Probar el tunel con `/api/external/health`.
3. Confirmar que `RG_API_BASE_URL` no sea una URL vieja de `trycloudflare.com`.
4. Confirmar que `RG_API_KEY` coincida con una API key activa en Rio Gestion.
5. Revisar logs de TricariosBack: `/api/v1/external/rg/logs`.

### Rio Gestion no puede enviar webhooks a TricariosBack

1. En Rio Gestion, `Configuracion > Integraciones > Probar conexion`.
2. Confirmar que `webhook_url` sea `https://tricariosgrowshop.com/api/v1/external/rg/webhook/stock`.
3. Confirmar que `webhook_enabled` este activo.
4. Confirmar que el secret configurado en Rio Gestion sea igual a `RG_WEBHOOK_SECRET` en TricariosBack.
5. Revisar `INTEGRACIONES_SYNC_LOGS` en Rio Gestion y `integrationlogs` en TricariosBack.

### Error 401

- En endpoints `/api/external/*` de Rio Gestion: API key invalida, ausente o revocada.
- En webhook de TricariosBack: firma HMAC ausente o secret distinto.

### Error 412 al enviar pedidos a Rio Gestion

Falta configurar en Rio Gestion:

- `orders_default_cliente_id`
- `orders_default_punto_venta_id`

Se configura desde `Configuracion > Integraciones > Webhook > Defaults para pedidos entrantes`.

### Error 502 en TricariosBack `/pull`

TricariosBack no pudo hablar correctamente con Rio Gestion. Revisar:

- Tunel caido o URL incorrecta.
- Rio Gestion caido.
- API key invalida.
- Timeout (`RG_REQUEST_TIMEOUT_MS`).

## Checklist de soporte

1. `Rio Gestion local /api/health` responde.
2. `Cloudflare Tunnel /api/external/health` responde con `x-api-key`.
3. `TricariosBack /api/v1/external/rg/status` muestra config completa.
4. `TricariosBack /api/v1/external/rg/logs` no muestra errores recientes.
5. En Rio Gestion, `Probar conexion` devuelve OK.
6. En Rio Gestion, `Sincronizar catalogo completo` devuelve OK.
7. En TricariosFront, los productos se ven con stock/precio actual.

## Hallazgos de esta revision

- `setup-cloudflare-tunnel.ps1` en Rio Gestion WEB no contiene un script de Cloudflare: contiene codigo React/Next. No usarlo como referencia operativa hasta corregirlo o reemplazarlo.
- `.env.example` de TricariosBack debe usar una URL placeholder estable, no una URL concreta `trycloudflare.com`.
- La integracion ya tiene logs y endpoints de salud suficientes para soporte basico; faltaba una guia operativa y un comando unico de diagnostico.