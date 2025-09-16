# 🎯 GitHub Copilot Prompt - Sistema de Slots Individuales de Imágenes

## 📋 **Contexto del proyecto**

Necesito implementar en el frontend un sistema avanzado de gestión individual de imágenes por productos. El backend ya está implementado con un sistema de **6 slots individuales** (posiciones 0-5) que permite:

- ✅ **Actualizar imagen específica** sin afectar las demás
- ✅ **Eliminar imagen particular** manteniendo las otras
- ✅ **Reordenar imágenes** entre slots con drag & drop
- ✅ **Gestión automática** de imagen principal (slot 0)

## 🎨 **Componentes a implementar**

### **1. Componente principal: ImageSlotsManager**

```typescript
interface ImageSlot {
  slot: number; // 0-5
  position: number; // 1-6 (para mostrar al usuario)
  imageUrl: string | null;
  isEmpty: boolean;
  isPrimary: boolean;
}

interface ImageSlotsManagerProps {
  productId: string;
  onImagesUpdate?: (gallery: string[]) => void;
  onPrimaryImageChange?: (imageUrl: string) => void;
  maxFileSize?: number; // default: 50MB
  acceptedFormats?: string[]; // default: ['jpeg', 'png', 'webp', 'gif']
}
```

**Funcionalidades requeridas:**

- 🖼️ **Grid visual de 6 slots** numerados del 1 al 6
- 🎯 **Indicador especial** para slot principal (posición 1)
- 📁 **Upload individual** por slot con preview instantáneo
- 🗑️ **Botón eliminar** por slot (excepto si es la última imagen)
- 🔄 **Drag & drop** para reordenamiento entre slots
- ⏳ **Loading states** individuales por slot
- ✅ **Validaciones client-side** antes de upload

### **2. Subcomponente: SlotItem**

```typescript
interface SlotItemProps {
  slot: ImageSlot;
  isLoading: boolean;
  onImageUpdate: (file: File) => Promise<void>;
  onImageDelete: () => Promise<void>;
  onDragStart: (fromSlot: number) => void;
  onDrop: (toSlot: number) => Promise<void>;
  canDelete: boolean; // false si es la última imagen
}
```

**Estados visuales necesarios:**

- 🔵 **Slot vacío:** Botón "+" para agregar imagen
- 🖼️ **Slot ocupado:** Imagen + overlay con acciones
- 👑 **Slot principal:** Badge especial "Principal"
- ⏳ **Loading:** Spinner sobre el slot
- ❌ **Error:** Border rojo + mensaje de error

### **3. Hook personalizado: useImageSlots**

```typescript
interface UseImageSlotsReturn {
  slots: ImageSlot[];
  loading: boolean;
  error: string | null;
  summary: {
    total: number;
    occupied: number;
    empty: number;
  };

  // Acciones
  updateSlot: (slot: number, file: File) => Promise<void>;
  deleteSlot: (slot: number) => Promise<void>;
  reorderSlots: (fromSlot: number, toSlot: number) => Promise<void>;
  refreshSlots: () => Promise<void>;
}
```

## 🔌 **Integración con API Backend**

### **Endpoints disponibles:**

```typescript
// Obtener información de slots
GET /api/v1/products/:id/images
// Response: { success: true, data: { slots: ImageSlot[], summary: {...} } }

// Actualizar slot específico
PUT /api/v1/products/:id/images/:slot
// FormData con imagen, Response: { success: true, data: {...} }

// Eliminar slot específico
DELETE /api/v1/products/:id/images/:slot
// Response: { success: true, data: {...} }

// Reordenar imágenes
POST /api/v1/products/:id/images/:slot/reorder
// Body: { fromSlot: number }, Response: { success: true, data: {...} }
```

### **Servicios a crear:**

```typescript
// services/imageSlotsService.ts
export class ImageSlotsService {
  static async getSlots(productId: string): Promise<ImageSlot[]>;
  static async updateSlot(
    productId: string,
    slot: number,
    file: File
  ): Promise<SlotUpdateResponse>;
  static async deleteSlot(
    productId: string,
    slot: number
  ): Promise<SlotDeleteResponse>;
  static async reorderSlots(
    productId: string,
    fromSlot: number,
    toSlot: number
  ): Promise<SlotReorderResponse>;
}
```

## 🎨 **UI/UX Especificaciones**

### **Layout Grid:**

- 📱 **Mobile:** 2 columnas (3 filas)
- 💻 **Desktop:** 3 columnas (2 filas)
- 🖥️ **Large screens:** 6 columnas (1 fila)

### **Slot visual requirements:**

- 📐 **Aspect ratio:** 1:1 (cuadrado)
- 🎨 **Border:** Dashed para slots vacíos, solid para ocupados
- 👑 **Primary indicator:** Crown icon o "Principal" badge
- 🎯 **Hover states:** Zoom suave + overlay de acciones
- 🔄 **Drag indicator:** Visual cues durante drag & drop

### **Acciones por slot:**

```typescript
// Slot vacío
- 📁 Upload button (center)
- 📋 Paste from clipboard option

// Slot ocupado
- 🔍 View full size (modal/lightbox)
- 🔄 Replace image
- 🗑️ Delete image (si no es la única)
- 👑 Set as primary (si no es slot 0)
- ↕️ Drag handle para reordenar
```

## ⚡ **Estado y gestión de datos**

### **Estado global recomendado:**

```typescript
// store/productImages.ts o context
interface ProductImagesState {
  [productId: string]: {
    slots: ImageSlot[];
    loading: boolean;
    error: string | null;
    lastUpdated: Date;
  };
}

// Acciones del store
const productImagesSlice = {
  setSlots: (productId: string, slots: ImageSlot[]) => void,
  updateSlot: (productId: string, slotData: Partial<ImageSlot>) => void,
  setLoading: (productId: string, loading: boolean) => void,
  setError: (productId: string, error: string | null) => void,
  reorderSlots: (productId: string, fromSlot: number, toSlot: number) => void
}
```

### **Optimistic updates:**

- ✅ **Update local state** inmediatamente
- ✅ **Rollback automático** si falla la API
- ✅ **Loading states** por slot individual
- ✅ **Error boundary** por operación

## 🔄 **Flujos de usuario**

### **1. Flujo de actualización de imagen:**

```typescript
// Paso 1: Usuario selecciona archivo
const handleImageSelect = async (slot: number, file: File) => {
  // Validar archivo
  if (!validateFile(file)) return;

  // Preview inmediato (optimistic)
  setSlotPreview(slot, URL.createObjectURL(file));
  setSlotLoading(slot, true);

  try {
    // API call
    const result = await ImageSlotsService.updateSlot(productId, slot, file);

    // Update state con respuesta real
    updateSlot(slot, result.data);

    // Callback opcional
    onImagesUpdate?.(result.data.gallery);
  } catch (error) {
    // Rollback preview
    revertSlotPreview(slot);
    setSlotError(slot, error.message);
  } finally {
    setSlotLoading(slot, false);
  }
};
```

### **2. Flujo de drag & drop:**

```typescript
// Drag start
const handleDragStart = (e: DragEvent, fromSlot: number) => {
  e.dataTransfer.setData("fromSlot", fromSlot.toString());
  setDraggedSlot(fromSlot);
};

// Drop
const handleDrop = async (e: DragEvent, toSlot: number) => {
  const fromSlot = parseInt(e.dataTransfer.getData("fromSlot"));

  if (fromSlot === toSlot) return;

  // Optimistic reorder
  optimisticReorder(fromSlot, toSlot);

  try {
    await ImageSlotsService.reorderSlots(productId, fromSlot, toSlot);
    // Success - state ya actualizado optimistically
  } catch (error) {
    // Rollback
    revertReorder(fromSlot, toSlot);
    showError(error.message);
  }
};
```

## 🛡️ **Validaciones client-side**

```typescript
// utils/imageValidation.ts
export const validateImageFile = (file: File) => {
  const errors: string[] = [];

  // Tipo de archivo
  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!validTypes.includes(file.type)) {
    errors.push("Formato no válido. Use: JPEG, PNG, WebP, GIF");
  }

  // Tamaño
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    errors.push("Archivo muy grande. Máximo 50MB");
  }

  // Dimensiones mínimas (opcional)
  const img = new Image();
  img.onload = () => {
    if (img.width < 200 || img.height < 200) {
      errors.push("Imagen muy pequeña. Mínimo 200x200px");
    }
  };
  img.src = URL.createObjectURL(file);

  return {
    isValid: errors.length === 0,
    errors,
  };
};
```

## 🎯 **Integraciones adicionales**

### **1. Con formulario de producto existente:**

```typescript
// En el form de edición de producto
const ProductEditForm = () => {
  const [productData, setProductData] = useState({...});

  const handleImagesUpdate = (newGallery: string[]) => {
    setProductData(prev => ({
      ...prev,
      gallery: newGallery,
      image: newGallery[0] // Primera imagen como principal
    }));
  };

  return (
    <form>
      {/* Otros campos del producto */}

      <ImageSlotsManager
        productId={productData.id}
        onImagesUpdate={handleImagesUpdate}
        onPrimaryImageChange={(url) => setProductData(prev => ({...prev, image: url}))}
      />

      {/* Resto del formulario */}
    </form>
  );
};
```

### **2. Con sistema de notificaciones:**

```typescript
// Integrar con toast/snackbar
const handleSlotSuccess = (message: string) => {
  toast.success(message);
};

const handleSlotError = (error: string) => {
  toast.error(error);
};
```

### **3. Con lightbox/modal para preview:**

```typescript
// Modal para vista completa
const ImageLightbox = ({ images, currentIndex, onClose, onNavigate }) => {
  // Galería con navegación
  // Zoom, fullscreen, etc.
};
```

## 🧪 **Testing sugerido**

### **Unit tests:**

- ✅ Hook `useImageSlots` con mocked API
- ✅ Validaciones de archivos
- ✅ Componente `SlotItem` con diferentes estados
- ✅ Servicio `ImageSlotsService`

### **Integration tests:**

- ✅ Flujo completo de upload
- ✅ Drag & drop entre slots
- ✅ Eliminación con validaciones
- ✅ Reordenamiento y primary image update

### **E2E tests:**

- ✅ Usuario gestiona imágenes en producto
- ✅ Upload múltiple con error handling
- ✅ Responsive behavior en diferentes pantallas

## 🚀 **Performance optimizations**

### **Lazy loading:**

```typescript
// Cargar slots solo cuando se necesiten
const ImageSlotsManager = lazy(() => import("./ImageSlotsManager"));

// Usar en el form de producto
<Suspense fallback={<ImageSlotsSkeleton />}>
  <ImageSlotsManager productId={productId} />
</Suspense>;
```

### **Image optimization:**

- 🖼️ **Thumbnails:** Generar previews 150x150px
- 📱 **Responsive images:** Diferentes tamaños según device
- ⚡ **CDN:** Servir desde CDN si está disponible
- 🗜️ **Compression:** WebP cuando sea posible

### **Caching:**

```typescript
// Cache en memoria para slots ya cargados
const slotsCache = new Map<string, ImageSlot[]>();

// React Query o SWR para cache automático
const { data: slots, mutate } = useSWR(
  `/api/v1/products/${productId}/images`,
  fetcher,
  { revalidateOnFocus: false }
);
```

## 📱 **Consideraciones responsive**

### **Breakpoints específicos:**

```css
/* Mobile: Stack vertical, 2 slots por fila */
@media (max-width: 768px) {
  .slots-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .slot-item {
    aspect-ratio: 1;
    min-height: 120px;
  }
}

/* Tablet: 3 slots por fila */
@media (min-width: 769px) and (max-width: 1024px) {
  .slots-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
}

/* Desktop: 6 slots en línea */
@media (min-width: 1025px) {
  .slots-grid {
    grid-template-columns: repeat(6, 1fr);
    gap: 20px;
  }
}
```

## 🎨 **Temas y estilos**

### **Variables CSS recomendadas:**

```css
:root {
  --slot-size: 150px;
  --slot-border-radius: 8px;
  --slot-border-empty: 2px dashed #ccc;
  --slot-border-filled: 2px solid #e0e0e0;
  --slot-border-primary: 3px solid #1976d2;
  --slot-hover-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  --slot-drag-opacity: 0.5;
  --primary-badge-bg: #1976d2;
  --error-border: #f44336;
  --success-border: #4caf50;
}
```

### **Estados interactivos:**

```css
.slot-item {
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--slot-hover-shadow);
  }

  &.is-dragging {
    opacity: var(--slot-drag-opacity);
    transform: rotate(5deg);
  }

  &.is-drop-target {
    border-color: var(--primary-badge-bg);
    background: rgba(25, 118, 210, 0.05);
  }
}
```

## 💡 **Sugerencias finales**

1. **Progressive Enhancement:** Mantener funcionalidad básica sin JS
2. **Accessibility:** ARIA labels, keyboard navigation, screen readers
3. **Error boundaries:** Wrap componentes para errores graceful
4. **Analytics:** Track eventos de upload, delete, reorder
5. **Feature flags:** Permitir toggle entre sistema nuevo y viejo
6. **Documentation:** Generar Storybook para componentes
7. **Monitoring:** Logs de errores y performance metrics

---

## ✅ **Checklist de implementación**

- [ ] Crear hook `useImageSlots`
- [ ] Implementar `ImageSlotsManager` component
- [ ] Crear `SlotItem` subcomponent
- [ ] Implementar servicios API
- [ ] Añadir validaciones client-side
- [ ] Implementar drag & drop
- [ ] Crear estados de loading/error
- [ ] Añadir responsive design
- [ ] Implementar optimistic updates
- [ ] Crear tests unitarios
- [ ] Integrar con formulario existente
- [ ] Añadir lightbox/modal preview
- [ ] Optimizar performance
- [ ] Testing E2E
- [ ] Documentation completa

**¡Listo para implementar! 🚀**
