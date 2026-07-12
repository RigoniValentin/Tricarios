# Runbook: Levantar y recuperar el Túnel de Cloudflare (RG WEB)

Esta guía documenta cómo crear, configurar y recuperar el túnel de Cloudflare que expone Rio Gestión WEB hacia internet, para que TricariosBack pueda llamarlo desde producción.

El runbook general de la integración está en `OPERACION_INTEGRACION_RG_CLOUDFLARE.md`. Este doc es específicamente sobre el túnel y su ciclo de vida.

---

## 1. Cuándo recrear el túnel

Recrear el túnel desde cero cuando:

- El dashboard muestra el túnel como **Inactive** con 0 réplicas.
- El servicio `cloudflared` no está corriendo en la máquina de RG WEB.
- El DNS autoritativo del hostname del túnel apunta a una IP privada (ULA `fd00::/8` o rangos RFC1918) en vez de a IPs públicas de Cloudflare.
- Hay credenciales corruptas o el token se perdió.
- El dashboard dice "No routes" y el `cloudflared service install` se queja de que ya hay un servicio previo.

Antes de recrear, confirmá el diagnóstico con:

```bash
# Desde cualquier máquina con curl
URL=$(grep ^RG_API_BASE_URL= /home/Tricarios/.env | cut -d= -f2)
curl -sS --max-time 10 -o /dev/null -w "HTTP %{http_code} | DNS %{time_namelookup}s | conectó %{time_connect}s | total %{time_total}s\n" "$URL/api/external/health"
```

Si devuelve `HTTP 000` o `total` cercano a 10s, la URL está caída.

---

## 2. Procedimiento limpio (Windows)

RG WEB corre en Windows, donde cloudflared se instala como servicio de Windows (`Cloudflared`).

### 2.1. Limpieza previa

Si ya hay un servicio previo y/o credenciales, hay que borrarlo todo antes de instalar el token nuevo. El servicio puede quedar en estado `STOP_PENDING` colgado, así que el flujo seguro es:

```cmd
:: Ver estado actual
sc queryex Cloudflared
```

Si el estado es `STOP_PENDING` con flag `NOT_STOPPABLE, IGNORES_SHUTDOWN`:

```cmd
:: Matar el proceso por PID (el que muestra sc queryex)
taskkill /F /PID <PID>

:: Esperar a que libere recursos
timeout /t 3

:: Borrar el servicio
sc delete Cloudflared

:: Confirmar que no existe
sc query Cloudflared
```

Si el estado es `RUNNING` y responde:

```cmd
sc stop Cloudflared
timeout /t 3
sc delete Cloudflared
```

Limpiar credenciales y configs previas en las rutas que cloudflared usa en Windows:

```cmd
del /S /Q "%USERPROFILE%\.cloudflared\*" 2>nul
del /S /Q "C:\Windows\System32\config\systemprofile\.cloudflared\*" 2>nul
del /S /Q "C:\ProgramData\cloudflared\*" 2>nul
```

### 2.2. Borrar el túnel viejo en el dashboard

1. Ir a https://one.dash.cloudflare.com → **Networks** → **Tunnels**.
2. Click en `...` junto al túnel → **Delete**.
3. Confirmar.

### 2.3. Crear túnel nuevo y obtener token

1. En el mismo dashboard: **Create a tunnel** → **Cloudflared**.
2. Nombrarlo (ej. `rgweb`).
3. En la sección "Install and run a connector", copiar el **token** que aparece (es un JWT largo).

### 2.4. Instalar el servicio con el token nuevo

```cmd
cloudflared.exe service install <TOKEN>
```

Salida esperada:

```
2026-07-09T10:35:59Z INF Installing cloudflared Windows service
2026-07-09T10:35:59Z INF cloudflared agent service is installed windowsServiceName=Cloudflared
2026-07-09T10:35:59Z INF Agent service for cloudflared installed successfully windowsServiceName=Cloudflared
```

Si dice "cloudflared service is already installed", el token NO se aplicó. Volvé al paso 2.1.

### 2.5. Configurar el ingress

El servicio de Windows lee el config desde el perfil del SYSTEM:

```cmd
mkdir "C:\Windows\System32\config\systemprofile\.cloudflared" 2>nul
notepad "C:\Windows\System32\config\systemprofile\.cloudflared\config.yml"
```

Contenido (reemplazar `<TUNNEL_ID>`, `<TU_DOMINIO>` y `<PUERTO_RG_WEB>`):

```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Windows\System32\config\systemprofile\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: rgweb.<TU_DOMINIO>
    service: http://localhost:<PUERTO_RG_WEB>
  - service: http_status:404
```

Para descubrir el puerto de RG WEB:

```cmd
netstat -ano | findstr LISTENING | findstr :
```

### 2.6. Iniciar el servicio y verificar

```cmd
sc start Cloudflared
sc query Cloudflared
```

Volver al dashboard de Cloudflare. El túnel debe pasar de `Inactive` a **HEALTHY** con 1 réplica.

---

## 3. Procedimiento limpio (Linux)

Si en el futuro RG WEB se mueve a una máquina Linux:

```bash
# Instalar cloudflared
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# Limpiar instalación previa si quedó algo colgado
sudo systemctl stop cloudflared 2>/dev/null
sudo systemctl disable cloudflared 2>/dev/null
sudo rm -rf /etc/cloudflared /root/.cloudflared

# Instalar como servicio con el token del dashboard
sudo cloudflared service install <TOKEN>

# Crear config
sudo tee /etc/cloudflared/config.yml >/dev/null <<EOF
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: rgweb.<TU_DOMINIO>
    service: http://localhost:<PUERTO_RG_WEB>
  - service: http_status:404
EOF

# Habilitar y arrancar
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 30 --no-pager
```

---

## 4. Public Hostname (paso obligatorio en el dashboard)

Aunque el túnel esté HEALTHY, **sin este paso el hostname no resuelve públicamente**. En el dashboard:

1. **Networks** → **Tunnels** → click en el túnel nuevo.
2. Pestaña **Public Hostname**.
3. **Add a public hostname**:
   - **Subdomain:** `rgweb`
   - **Domain:** tu dominio delegado a Cloudflare (ej. `tudominio.com`)
   - **Service Type:** `HTTP`
   - **URL:** `localhost:<PUERTO_RG_WEB>`
4. Save.

Esto crea el registro DNS público correcto (apunta a IPs de Cloudflare edge, NO a ULAs ni IPs privadas).

---

## 5. Conectar TricariosBack al túnel

Una vez que el túnel está HEALTHY y el Public Hostname configurado:

En el VPS de Tricarios:

```bash
cd /home/Tricarios

# 1. Probar que la nueva URL responde
curl -sS --max-time 10 -o /dev/null -w "HTTP %{http_code} en %{time_total}s\n" \
  "https://rgweb.<TU_DOMINIO>/api/external/health"

# Debe devolver 200, no 000.

# 2. Actualizar .env
sed -i "s|^RG_API_BASE_URL=.*|RG_API_BASE_URL=https://rgweb.<TU_DOMINIO>|" .env
grep RG_API_BASE_URL .env

# 3. Reiniciar el backend
pm2 restart TricariosApp

# 4. Test end-to-end
curl -sS -X POST https://tricariosgrowshop.com/api/v1/store/orders \
  -H "Content-Type: application/json" \
  -d '{"externalOrderId":"test-after-tunnel-fix","items":[{"cantidad":1,"precioUnitario":1}]}' \
  -w "\nHTTP %{http_code}\n"

# Esperado: 201 (creado) o 400 (validación), nunca 502.
```

---

## 6. Tabla de problemas comunes

| Síntoma | Causa probable | Fix |
|---|---|---|
| `POST /api/v1/store/orders` devuelve 502 tras ~46s | `RG_API_BASE_URL` apunta a túnel caído o DNS roto | Recrear túnel (sección 2 ó 3) |
| IntegrationLog muestra `ECONNABORTED` en `order.push` | Timeout hacia RG WEB | Misma que arriba: túnel caído |
| DNS resuelve a `fd00::/8` o `192.168.x.x` o `10.x.x.x` | Registro DNS mal apuntado (manual o residual) | Borrar túnel viejo y crear uno nuevo; verificar Public Hostname |
| Dashboard dice "Inactive, 0 replicas" | `cloudflared` no está corriendo en la máquina de RG | Iniciar servicio (`sc start Cloudflared` o `systemctl start cloudflared`) |
| `cloudflared service install` dice "already installed" | Token nuevo no se aplicó sobre servicio previo | Sección 2.1: matar proceso + borrar servicio antes de instalar |
| Servicio Windows en `STOP_PENDING` (error 1061) | Proceso colgado | `taskkill /F /PID <PID>` y luego `sc delete Cloudflared` |
| HTTP 412 al hacer pedidos a RG | Faltan `orders_default_cliente_id` / `orders_default_punto_venta_id` en RG WEB | Configuración → Integraciones en el panel de RG WEB |
| Inbound funciona (stock/nombres RG→Tricarios) pero outbound no (pedidos Tricarios→RG) | El endpoint de RG que recibe pedidos requiere config extra; la URL puede estar caída | Verificar primero la URL con `curl /api/external/health` |
| Dev funciona y prod no | Diferente `RG_API_BASE_URL`; el dev usa `localhost` o túnel local válido | Apuntar prod al túnel nuevo Healthy |

---

## 7. Verificación de salud end-to-end

Checklist para confirmar que todo está andando después de un fix:

1. **DNS público correcto:**
   ```bash
   dig +short rgweb.<TU_DOMINIO> @1.1.1.1
   # Debe devolver IPs públicas de Cloudflare (104.16-31.x.x o 172.64-71.x.x)
   ```

2. **Tunnel HEALTHY:**
   - Dashboard muestra 1+ réplica activa.

3. **Endpoint de RG responde:**
   ```bash
   curl -sS --max-time 10 "https://rgweb.<TU_DOMINIO>/api/external/health"
   # Esperado: JSON con status: ok
   ```

4. **TricariosBack apunta a la URL correcta:**
   ```bash
   grep ^RG_API_BASE_URL /home/Tricarios/.env
   ```

5. **Pedido de prueba:**
   ```bash
   curl -sS -X POST https://tricariosgrowshop.com/api/v1/store/orders \
     -H "Content-Type: application/json" \
     -d '{"externalOrderId":"smoke-test-'"$(date +%s)"'","items":[{"cantidad":1,"precioUnitario":1}]}' \
     -w "\nHTTP %{http_code}\n"
   # Esperado: 201
   ```

6. **Verificación en IntegrationLog:**
   ```bash
   API_KEY=$(grep ^RG_API_KEY= /home/Tricarios/.env | cut -d= -f2)
   curl -sS -H "x-api-key: $API_KEY" \
     "https://tricariosgrowshop.com/api/v1/external/rg/logs?limit=3&direction=OUTBOUND" \
     | /root/.nvm/versions/node/v22.13.0/bin/node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);(j.logs||[]).forEach(l=>console.log(l.eventType,l.status,'httpStatus='+l.httpStatus,l.errorMessage||''))})"
   # Esperado: order.push, SUCCESS, httpStatus 200 o 201
   ```

---

## 8. Nota sobre IDs perdidos

Cuando el túnel estuvo caído, los pedidos `externalOrderId` quedaron registrados en `IntegrationLog` con `status: ERROR` del lado de TricariosBack, pero nunca llegaron a RG WEB. Si se quiere recuperar pedidos perdidos:

1. Los IDs están en el campo `payload.externalOrderId` de cada log de error.
2. Una vez que el túnel esté operativo, se pueden reenviar manualmente con el mismo `externalOrderId` — RG WEB respeta la idempotency key (`Idempotency-Key` header) y deduplica si ya existen.
3. Si pasaron más de 30 días, los logs se purgan automáticamente (TTL del modelo `IntegrationLog`).