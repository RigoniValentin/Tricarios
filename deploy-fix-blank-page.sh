#!/bin/bash
# ============================================================================
# Deploy script: arregla la página en blanco de TricariosGrowShop
# Ejecutar desde /home/Tricarios con: bash deploy-fix-blank-page.sh
# ============================================================================
set -e

cd /home/Tricarios

echo "═══════════════════════════════════════════════════════════"
echo " 1. Verificando estado actual"
echo "═══════════════════════════════════════════════════════════"

if [ ! -d "TricariosBack" ]; then
  echo "ERROR: este script debe correr desde /home/Tricarios"
  echo "       (donde están las carpetas TricariosBack y TricariosFront)"
  exit 1
fi

if [ ! -f "distFront/index.html" ]; then
  echo "ERROR: no existe distFront/index.html"
  echo "       Asegurate de haber buildeado el frontend primero"
  exit 1
fi

echo "✓ Estructura OK"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo " 2. Aplicando patch a express (decodifica URLs malformadas)"
echo "═══════════════════════════════════════════════════════════"

EXPRESS_LAYER="node_modules/express/lib/router/layer.js"
if [ ! -f "$EXPRESS_LAYER" ]; then
  echo "ERROR: no se encontró $EXPRESS_LAYER"
  exit 1
fi

if grep -q "evita que express.static aborte" "$EXPRESS_LAYER"; then
  echo "✓ Patch de express ya aplicado"
else
  # Backup
  cp "$EXPRESS_LAYER" "${EXPRESS_LAYER}.bak.$(date +%s)"
  echo "✓ Backup: ${EXPRESS_LAYER}.bak.$(date +%s)"

  # Patch con sed (más robusto que reescribir el archivo completo)
  python3 << 'PYEOF'
import re
path = "node_modules/express/lib/router/layer.js"
with open(path) as f:
    src = f.read()

old = """function decode_param(val) {
  if (typeof val !== 'string' || val.length === 0) {
    return val;
  }

  try {
    return decodeURIComponent(val);
  } catch (err) {
    if (err instanceof URIError) {
      err.message = 'Failed to decode param \\'' + val + '\\'';
      err.status = err.statusCode = 400;
    }

    throw err;
  }
}"""

new = """function decode_param(val) {
  if (typeof val !== 'string' || val.length === 0) {
    return val;
  }

  try {
    return decodeURIComponent(val);
  } catch (err) {
    if (err instanceof URIError) {
      // No propagamos el URIError: devolvemos el valor crudo para que la
      // request siga su curso y devolvemos 400 al final del stack.
      // Evita que express.static aborte el envío de assets cuando un bot
      // (o un cliente con URL malformada) hace requests con percent-encoding
      // inválido (p.ej. /%c0), que es exactamente lo que pasaba en prod.
      return val;
    }

    throw err;
  }
}"""

if old not in src:
    print("ERROR: no se encontró el bloque original a patchear")
    print("       Probablemente ya está parcheado o la versión de express cambió")
    exit(1)

src = src.replace(old, new)
with open(path, 'w') as f:
    f.write(src)
print("✓ Patch aplicado")
PYEOF
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo " 3. Verificando nginx"
echo "═══════════════════════════════════════════════════════════"

NGINX_CONF=$(find /etc/nginx -name "*.conf" -path "*sites-enabled*" -o -name "*.conf" -path "*conf.d*" 2>/dev/null | xargs grep -l "tricariosgrowshop" 2>/dev/null | head -1)

if [ -z "$NGINX_CONF" ]; then
  echo "⚠ No se encontró config de nginx para tricariosgrowshop"
  echo "  Buscá manualmente con: grep -r 'tricariosgrowshop' /etc/nginx/"
  echo ""
else
  echo "✓ Config encontrada: $NGINX_CONF"

  # Verificar que el location /assets/ no esté sirviendo desde disco
  if grep -A 3 "location /assets/" "$NGINX_CONF" | grep -q "try_files"; then
    echo ""
    echo "⚠ ATENCIÓN: nginx tiene 'location /assets/' con try_files."
    echo "  Esto puede romper la página si el path no coincide con distFront/assets/"
    echo "  RECOMENDACIÓN: sacá ese bloque y dejá que Express sirva los assets."
    echo ""
    echo "  Bloque a eliminar:"
    grep -A 3 "location /assets/" "$NGINX_CONF" | sed 's/^/    /'
    echo ""
  fi
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo " 4. Reiniciando pm2"
echo "═══════════════════════════════════════════════════════════"

pm2 restart TricariosApp
sleep 2
pm2 logs TricariosApp --lines 10 --nostream --raw 2>/dev/null || true
echo ""

echo "═══════════════════════════════════════════════════════════"
echo " 5. Verificación final"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "→ HTML servido:"
curl -sIL https://tricariosgrowshop.com/ | grep -E "HTTP|cache-control|content-type|content-length" | head -10

echo ""
echo "→ JS bundle servido:"
curl -sIL https://tricariosgrowshop.com/assets/index-Dlhu9vNL.js 2>/dev/null | grep -E "HTTP|cache-control|content-type|content-length" | head -10 || \
  echo "  (el nombre puede haber cambiado - verificá con ls distFront/assets/)"

echo ""
echo "→ Assets disponibles:"
ls -la distFront/assets/ | head -10

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " ✅ DEPLOY COMPLETADO"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "AHORA EN TU NAVEGADOR (lado cliente):"
echo ""
echo "  1. Abrí una VENTANA INCÓGNITO (Ctrl+Shift+N)"
echo "  2. Andá a https://tricariosgrowshop.com"
echo "  3. La página debería cargar normalmente"
echo ""
echo "Si seguís sin verla en modo normal:"
echo "  - Ctrl+Shift+R (hard reload)"
echo "  - O Ctrl+Shift+Delete → Borrar caché"
echo ""
echo "Si en incógnito tampoco anda:"
echo "  - Abrí DevTools (F12) ANTES de navegar"
echo "  - Pestaña Network → marcá 'Disable cache'"
echo "  - Andá al sitio y mirá la pestaña Console"
echo ""