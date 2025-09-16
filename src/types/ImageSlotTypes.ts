// 🎯 Tipos TypeScript para Sistema de Slots de Imágenes
// Definiciones para las nuevas funcionalidades de manejo individual de imágenes

///////////////////////////////////////////////////////////////////////////////
// INTERFACES PARA SLOTS DE IMÁGENES
///////////////////////////////////////////////////////////////////////////////

// Información de un slot individual
export interface ImageSlot {
  slot: number; // 0-5 (índice interno)
  position: number; // 1-6 (para mostrar al usuario)
  imageUrl: string | null;
  isEmpty: boolean;
  isPrimary: boolean; // slot 0 es siempre la imagen principal
}

// Resumen de slots
export interface SlotsSummary {
  total: number; // Siempre 6
  occupied: number; // Slots con imagen
  empty: number; // Slots vacíos
}

///////////////////////////////////////////////////////////////////////////////
// RESPUESTAS DE API
///////////////////////////////////////////////////////////////////////////////

// GET /api/v1/products/:id/images - Obtener información de slots
export interface ImageSlotsResponse {
  success: boolean;
  data?: {
    productId: string;
    productName: string;
    primaryImage: string;
    slots: ImageSlot[];
    summary: SlotsSummary;
  };
  message?: string;
  error?: string;
}

// PUT /api/v1/products/:id/images/:slot - Actualizar slot específico
export interface SlotUpdateResponse {
  success: boolean;
  data?: {
    productId: string;
    slot: number;
    position: number;
    imageUrl: string;
    isPrimary: boolean;
    gallery: string[];
    primaryImage: string;
  };
  message?: string;
  error?: string;
}

// DELETE /api/v1/products/:id/images/:slot - Eliminar slot específico
export interface SlotDeleteResponse {
  success: boolean;
  data?: {
    productId: string;
    slot: number;
    position: number;
    deletedImage: string;
    gallery: string[];
    primaryImage: string;
    remainingImages: number;
  };
  message?: string;
  error?: string;
}

// POST /api/v1/products/:id/images/:slot/reorder - Reordenar imágenes
export interface SlotReorderResponse {
  success: boolean;
  data?: {
    productId: string;
    fromSlot: number;
    toSlot: number;
    movedImage: string;
    replacedImage: string;
    gallery: string[];
    primaryImage: string;
  };
  message?: string;
  error?: string;
}

///////////////////////////////////////////////////////////////////////////////
// TIPOS PARA REQUESTS
///////////////////////////////////////////////////////////////////////////////

// Solicitud de reordenamiento
export interface SlotReorderRequest {
  fromSlot: number; // Slot de origen (0-5)
}

// Parámetros de rutas
export interface SlotRouteParams {
  id: string; // ID del producto
  slot: string; // Número del slot como string (se convierte a number)
}

///////////////////////////////////////////////////////////////////////////////
// TIPOS DE ERRORES ESPECÍFICOS
///////////////////////////////////////////////////////////////////////////////

export interface SlotError {
  code:
    | "INVALID_SLOT"
    | "PRODUCT_NOT_FOUND"
    | "EMPTY_SLOT"
    | "LAST_IMAGE"
    | "UPLOAD_ERROR";
  message: string;
  details?: {
    slot?: number;
    productId?: string;
    minImages?: number;
    maxImages?: number;
  };
}

///////////////////////////////////////////////////////////////////////////////
// TIPOS PARA FRONTEND
///////////////////////////////////////////////////////////////////////////////

// Estado de un slot en el frontend
export interface SlotState {
  id: number; // 0-5
  position: number; // 1-6
  image: string | null;
  file: File | null; // Archivo local antes de subir
  isUploading: boolean;
  uploadProgress: number; // 0-100
  error: string | null;
  isPrimary: boolean;
}

// Operaciones disponibles en un slot
export type SlotOperation = "update" | "delete" | "reorder" | "view";

// Configuración del sistema de slots
export interface SlotsConfig {
  maxSlots: number; // 6
  minImages: number; // 1
  maxFileSize: number; // en bytes
  allowedTypes: string[]; // ['image/jpeg', 'image/png', etc.]
  uploadEndpoint: string;
  deleteEndpoint: string;
  reorderEndpoint: string;
}
