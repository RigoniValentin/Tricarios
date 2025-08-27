# 🔍 Sistema de Búsqueda Inteligente de Productos

## Descripción

El sistema de búsqueda mejorado proporciona búsquedas flexibles e inteligentes que pueden manejar:

- ✅ Búsqueda insensible a mayúsculas/minúsculas
- ✅ Búsqueda por palabras individuales
- ✅ Coincidencias parciales en nombre, descripción, categoría y tags
- ✅ Manejo inteligente de caracteres especiales (+, -, &, etc.)
- ✅ Tolerancia a espacios extra y formato inconsistente
- ✅ Priorización de resultados por relevancia
- ✅ Eliminación de acentos automática

## Endpoints Disponibles

### 1. Búsqueda Regular (Mejorada)

```
GET /api/v1/products?search={término}
```

### 2. Búsqueda Avanzada con Scoring

```
GET /api/v1/products/search?q={término}
```

## Ejemplos de Uso

### Producto de ejemplo en la base de datos:

```json
{
  "id": "68925477ef46ac4f7a5ef3eb",
  "name": "Combo picador + plato v2",
  "description": "Descripcion de combo v2",
  "category": "Iluminación",
  "tags": ["combo", "accesorios"],
  "price": 1030011
}
```

### Búsquedas que FUNCIONAN:

```bash
# Coincidencia exacta
GET /api/v1/products?search=Combo picador + plato v2
GET /api/v1/products/search?q=Combo picador + plato v2

# Insensible a mayúsculas
GET /api/v1/products?search=COMBO PICADOR
GET /api/v1/products?search=combo picador

# Búsqueda parcial
GET /api/v1/products?search=picador plato
GET /api/v1/products?search=combo +
GET /api/v1/products?search=plato v2

# Con espacios extra
GET /api/v1/products?search=   combo    picador
GET /api/v1/products?search=combo  +  plato

# Palabras en distinto orden
GET /api/v1/products?search=plato combo picador
GET /api/v1/products?search=v2 combo

# Acentos (se normalizan automáticamente)
GET /api/v1/products?search=descripción combo
```

## Parámetros de Búsqueda Avanzada

### Endpoint: `/api/v1/products/search`

| Parámetro      | Tipo          | Descripción                              |
| -------------- | ------------- | ---------------------------------------- |
| `q`            | string        | **Requerido**. Término de búsqueda       |
| `category`     | string        | Filtrar por categoría                    |
| `categoryId`   | string        | Filtrar por ID de categoría              |
| `minPrice`     | number        | Precio mínimo                            |
| `maxPrice`     | number        | Precio máximo                            |
| `inStock`      | boolean       | Filtrar productos en stock               |
| `featured`     | boolean       | Filtrar productos destacados             |
| `tags`         | string\|array | Filtrar por tags                         |
| `page`         | number        | Página (default: 1)                      |
| `limit`        | number        | Límite por página (default: 10, max: 50) |
| `includeScore` | boolean       | Incluir score de relevancia en respuesta |

### Ejemplos:

```bash
# Búsqueda básica
GET /api/v1/products/search?q=combo picador

# Búsqueda con filtros
GET /api/v1/products/search?q=combo&category=Iluminación&inStock=true

# Búsqueda con rango de precios
GET /api/v1/products/search?q=picador&minPrice=500000&maxPrice=2000000

# Búsqueda con score de relevancia
GET /api/v1/products/search?q=combo picador&includeScore=true

# Búsqueda con paginación
GET /api/v1/products/search?q=combo&page=1&limit=20
```

## Respuesta de la API

### Búsqueda Regular

```json
{
  "success": true,
  "data": [
    {
      "id": "68925477ef46ac4f7a5ef3eb",
      "name": "Combo picador + plato v2",
      "description": "Descripcion de combo v2",
      "price": 1030011,
      "category": "Iluminación",
      "inStock": true,
      "featured": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "pages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### Búsqueda Avanzada (con score)

```json
{
  "success": true,
  "data": [
    {
      "id": "68925477ef46ac4f7a5ef3eb",
      "name": "Combo picador + plato v2",
      "description": "Descripcion de combo v2",
      "price": 1030011,
      "relevanceScore": 185
    }
  ],
  "searchInfo": {
    "query": "combo picador",
    "normalizedQuery": "combo picador",
    "words": ["combo", "picador"],
    "includeScore": true
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "pages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

## Sistema de Scoring

### Valores de Score:

- **100 puntos**: Coincidencia exacta en nombre
- **80 puntos**: Coincidencia exacta en descripción
- **75 puntos**: Coincidencia en tags
- **50 puntos**: Coincidencia parcial en nombre
- **30 puntos**: Coincidencia parcial en descripción
- **25 puntos**: Coincidencia en categoría
- **30 puntos**: Bonus por múltiples palabras coincidentes
- **10 puntos**: Bonus si es producto destacado
- **5 puntos**: Bonus si está en stock

### Orden de Prioridad:

1. **Coincidencias exactas** (mayor score)
2. **Coincidencias parciales**
3. **Productos destacados**
4. **Productos en stock**
5. **Fecha de creación** (más recientes primero)

## Mejoras Implementadas

### 1. Normalización de Texto

- Convierte a minúsculas
- Elimina acentos (café → cafe)
- Normaliza espacios múltiples
- Escapa caracteres especiales para regex

### 2. Búsqueda Flexible

- Búsqueda por palabras individuales
- Coincidencias en cualquier orden
- Tolerancia a espacios extra
- Manejo de caracteres especiales (+, -, &, etc.)

### 3. Scoring Inteligente

- Algoritmo de relevancia personalizable
- Priorización de campos importantes
- Bonus por características del producto
- Ordenamiento automático por relevancia

### 4. Optimización de Performance

- Índices de MongoDB recomendados
- Paginación eficiente
- Caching de resultados (futuro)

## Configuración Recomendada de MongoDB

### Índices para optimizar búsquedas:

```javascript
// Índices de texto para búsqueda
db.products.createIndex({
  name: "text",
  description: "text",
  category: "text",
  tags: "text",
});

// Índices para filtros comunes
db.products.createIndex({ category: 1 });
db.products.createIndex({ categoryId: 1 });
db.products.createIndex({ price: 1 });
db.products.createIndex({ inStock: 1 });
db.products.createIndex({ featured: 1 });
db.products.createIndex({ tags: 1 });
db.products.createIndex({ createdAt: -1 });

// Índice compuesto para búsquedas con filtros
db.products.createIndex({
  category: 1,
  inStock: 1,
  featured: 1,
  price: 1,
});
```

## Testing

### Casos de prueba:

```bash
# Coincidencia exacta
curl "https://tricariosgrowshop.com/api/v1/products/search?q=Combo%20picador%20%2B%20plato%20v2"

# Búsqueda parcial
curl "https://tricariosgrowshop.com/api/v1/products/search?q=combo%20picador"

# Insensible a mayúsculas
curl "https://tricariosgrowshop.com/api/v1/products/search?q=COMBO%20PICADOR"

# Con filtros
curl "https://tricariosgrowshop.com/api/v1/products/search?q=combo&category=Iluminación&inStock=true"

# Con score
curl "https://tricariosgrowshop.com/api/v1/products/search?q=combo%20picador&includeScore=true"
```

Esta implementación resuelve el problema de búsqueda original y proporciona una experiencia de búsqueda mucho más robusta y user-friendly.
