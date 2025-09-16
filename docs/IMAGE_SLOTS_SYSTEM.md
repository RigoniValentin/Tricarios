# Sistema de Slots Individuales de Imágenes

## 🎯 **Resumen**

Sistema avanzado para manejo individual de imágenes por producto, permitiendo actualizar, eliminar y reordenar imágenes específicas sin afectar las demás. Cada producto tiene **6 slots** numerados del 0 al 5 (posiciones 1-6 para el usuario).

## 📊 **Características principales**

- ✅ **6 slots individuales** por producto (0-5)
- ✅ **Actualización granular** - cambiar solo una imagen
- ✅ **Eliminación selectiva** - quitar imagen específica
- ✅ **Reordenamiento** - mover imágenes entre slots
- ✅ **Imagen principal automática** - slot 0 siempre es la principal
- ✅ **Compatibilidad total** con sistema existente
- ✅ **Validaciones robustas** y manejo de errores

## 🔌 **Endpoints disponibles**

### 1. **Obtener información de slots**

```http
GET /api/v1/products/:id/images
```

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "productId": "66f3c2e5a1b23d4e5f678901",
    "productName": "Bong de Vidrio Premium",
    "primaryImage": "/uploads/products/product-123-main.jpg",
    "slots": [
      {
        "slot": 0,
        "position": 1,
        "imageUrl": "/uploads/products/product-123-main.jpg",
        "isEmpty": false,
        "isPrimary": true
      },
      {
        "slot": 1,
        "position": 2,
        "imageUrl": "/uploads/products/product-123-side.jpg",
        "isEmpty": false,
        "isPrimary": false
      },
      {
        "slot": 2,
        "position": 3,
        "imageUrl": null,
        "isEmpty": true,
        "isPrimary": false
      }
    ],
    "summary": {
      "total": 6,
      "occupied": 2,
      "empty": 4
    }
  }
}
```

### 2. **Actualizar imagen específica**

```http
PUT /api/v1/products/:id/images/:slot
Content-Type: multipart/form-data

FormData: image = [archivo de imagen]
```

**Parámetros:**

- `id`: ID del producto
- `slot`: Número del slot (0-5)
- `image`: Archivo de imagen (form-data)

**Respuesta:**

```json
{
  "success": true,
  "message": "Imagen del slot 3 actualizada exitosamente",
  "data": {
    "productId": "66f3c2e5a1b23d4e5f678901",
    "slot": 2,
    "position": 3,
    "imageUrl": "/uploads/products/product-456-new.jpg",
    "isPrimary": false,
    "gallery": [
      "/uploads/products/product-123-main.jpg",
      "/uploads/products/product-123-side.jpg",
      "/uploads/products/product-456-new.jpg"
    ],
    "primaryImage": "/uploads/products/product-123-main.jpg"
  }
}
```

### 3. **Eliminar imagen específica**

```http
DELETE /api/v1/products/:id/images/:slot
```

**Parámetros:**

- `id`: ID del producto
- `slot`: Número del slot (0-5)

**Respuesta:**

```json
{
  "success": true,
  "message": "Imagen del slot 3 eliminada exitosamente",
  "data": {
    "productId": "66f3c2e5a1b23d4e5f678901",
    "slot": 2,
    "position": 3,
    "deletedImage": "/uploads/products/product-456-old.jpg",
    "gallery": [
      "/uploads/products/product-123-main.jpg",
      "/uploads/products/product-123-side.jpg"
    ],
    "primaryImage": "/uploads/products/product-123-main.jpg",
    "remainingImages": 2
  }
}
```

### 4. **Reordenar imágenes**

```http
POST /api/v1/products/:id/images/:slot/reorder
Content-Type: application/json

{
  "fromSlot": 3
}
```

**Parámetros:**

- `id`: ID del producto
- `slot`: Slot de destino (0-5)
- `fromSlot`: Slot de origen (0-5) en el body

**Respuesta:**

```json
{
  "success": true,
  "message": "Imagen movida del slot 4 al slot 1",
  "data": {
    "productId": "66f3c2e5a1b23d4e5f678901",
    "fromSlot": 3,
    "toSlot": 0,
    "movedImage": "/uploads/products/product-789.jpg",
    "replacedImage": "/uploads/products/product-123-main.jpg",
    "gallery": [
      "/uploads/products/product-789.jpg",
      "/uploads/products/product-123-main.jpg",
      "/uploads/products/product-123-side.jpg"
    ],
    "primaryImage": "/uploads/products/product-789.jpg"
  }
}
```

## 🔧 **Validaciones y restricciones**

### **Validaciones de slots:**

- ✅ Slot debe estar entre **0 y 5**
- ✅ Producto debe existir
- ✅ Formato de archivo válido (jpeg, png, webp, gif)
- ✅ Tamaño máximo: **50MB** por imagen

### **Validaciones de eliminación:**

- ❌ **No se puede eliminar la última imagen** (mínimo 1 requerida)
- ❌ No se puede eliminar slot vacío
- ✅ Se actualiza automáticamente la imagen principal si se elimina slot 0

### **Validaciones de reordenamiento:**

- ❌ Slots de origen y destino no pueden ser iguales
- ❌ Ambos slots deben estar en rango válido (0-5)
- ✅ Se pueden intercambiar slots vacíos y ocupados

## 🎨 **Casos de uso frontend**

### **1. Cambiar solo la imagen principal:**

```javascript
// En lugar de resubir todas las imágenes
const formData = new FormData();
formData.append("image", newMainImage);

await fetch(`/api/v1/products/${productId}/images/0`, {
  method: "PUT",
  body: formData,
});
```

### **2. Eliminar imagen específica:**

```javascript
// Eliminar la tercera imagen (slot 2)
await fetch(`/api/v1/products/${productId}/images/2`, {
  method: "DELETE",
});
```

### **3. Reordenar con drag & drop:**

```javascript
// Mover imagen del slot 3 al slot 1
await fetch(`/api/v1/products/${productId}/images/1/reorder`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fromSlot: 3 }),
});
```

### **4. Interface de gestión de slots:**

```javascript
// Obtener estado actual de slots
const response = await fetch(`/api/v1/products/${productId}/images`);
const { slots, summary } = response.data;

// Renderizar 6 slots con estado individual
slots.forEach((slot, index) => {
  renderSlot({
    position: slot.position, // 1-6
    image: slot.imageUrl,
    isEmpty: slot.isEmpty,
    isPrimary: slot.isPrimary,
    onUpdate: (file) => updateSlot(index, file),
    onDelete: () => deleteSlot(index),
    onReorder: (fromIndex) => reorderSlot(fromIndex, index),
  });
});
```

## 📊 **Beneficios del nuevo sistema**

### **Para el usuario:**

- ⚡ **Velocidad:** Cambiar una imagen vs todas
- 💾 **Ahorro de datos:** Subir solo lo necesario
- 🎯 **Precisión:** Control granular sobre cada posición
- 🔄 **Flexibilidad:** Reordenar con drag & drop

### **Para el desarrollador:**

- 🛡️ **Robustez:** Validaciones específicas por operación
- 📝 **Logs:** Trazabilidad detallada por slot
- 🔌 **API REST:** Endpoints semánticos y predecibles
- 🧪 **Testing:** Casos de prueba específicos

### **Para el sistema:**

- 📈 **Performance:** Operaciones más ligeras
- 💾 **Storage:** Gestión optimizada de archivos
- 🔄 **Escalabilidad:** Menos carga en uploads masivos
- 🛠️ **Mantenimiento:** Funciones específicas y modulares

## 🔄 **Compatibilidad**

### **Productos existentes:**

- ✅ **Funcionan igual** que antes
- ✅ **Endpoints antiguos** siguen activos
- ✅ **Migración automática** al usar nuevos endpoints
- ✅ **Sin breaking changes**

### **Nuevos productos:**

- 🆕 **Pueden usar ambos sistemas**
- 🆕 **Slots individuales desde el inicio**
- 🆕 **Mejores UX/UI** con gestión granular

## 🚦 **Códigos de respuesta**

| Código  | Significado     | Cuándo ocurre                                      |
| ------- | --------------- | -------------------------------------------------- |
| **200** | ✅ Éxito        | Operación completada correctamente                 |
| **400** | ❌ Bad Request  | Slot inválido, sin archivo, parámetros incorrectos |
| **404** | ❌ Not Found    | Producto no encontrado                             |
| **500** | ❌ Server Error | Error interno del servidor                         |

## 🔍 **Ejemplos de errores comunes**

### **Slot inválido:**

```json
{
  "success": false,
  "message": "Slot debe estar entre 0 y 5 (posiciones 1-6)"
}
```

### **Producto no encontrado:**

```json
{
  "success": false,
  "message": "Producto no encontrado"
}
```

### **Sin archivo para actualizar:**

```json
{
  "success": false,
  "message": "Debe proporcionar una imagen para actualizar el slot"
}
```

### **Eliminar última imagen:**

```json
{
  "success": false,
  "message": "No se puede eliminar la última imagen. El producto debe tener al menos una imagen."
}
```

## 🧪 **Testing**

Usar el archivo `image_slots_tests.http` para:

- ✅ Testing completo de todos los endpoints
- ✅ Casos de éxito y error
- ✅ Validaciones de slots y productos
- ✅ Flujos completos de uso

## 📚 **Recursos adicionales**

- **Tipos TypeScript:** `src/types/ImageSlotTypes.ts`
- **Tests HTTP:** `image_slots_tests.http`
- **Controladores:** `src/controllers/productControllerNew.ts`
- **Rutas:** `src/routes/productRoutes.ts`
- **Middleware:** `src/middlewares/upload.ts`

## 🎯 **Próximos pasos para el frontend**

1. **Crear componente SlotManager** para gestión visual
2. **Implementar drag & drop** para reordenamiento
3. **Añadir preview instantáneo** por slot
4. **Optimizar UX** con loading states por slot
5. **Añadir validaciones client-side** antes de upload
