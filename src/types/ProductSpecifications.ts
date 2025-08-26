// Tipos específicos para especificaciones de productos

// Tipos base permitidos para valores de especificaciones
export type SpecificationValue = string | number;

// Interfaz para especificaciones de productos
export interface IProductSpecifications {
  [key: string]: SpecificationValue;
}

// Especificaciones comunes para productos de cannabis (ejemplo)
// Usamos Partial para permitir propiedades opcionales
export type ICannabisSpecifications = Partial<{
  Tipo: string;
  Genética: string;
  THC: string;
  CBD: string;
  "Tiempo de floración": string;
  Rendimiento: string | number;
  Altura: string | number;
  Dificultad: string;
  "Indoor/Outdoor": string;
  Sabor: string;
  Aroma: string;
  Efecto: string;
}> &
  IProductSpecifications;

// Función de validación para specifications
export function validateSpecifications(specs: any): boolean {
  if (typeof specs !== "object" || specs === null || Array.isArray(specs)) {
    return false;
  }

  return Object.keys(specs).every(
    (key) =>
      typeof key === "string" &&
      (typeof specs[key] === "string" || typeof specs[key] === "number")
  );
}

// Función para limpiar y formatear specifications
export function sanitizeSpecifications(specs: any): IProductSpecifications {
  if (!validateSpecifications(specs)) {
    return {};
  }

  const sanitized: IProductSpecifications = {};

  for (const [key, value] of Object.entries(specs)) {
    if (
      typeof key === "string" &&
      (typeof value === "string" || typeof value === "number")
    ) {
      sanitized[key.trim()] = value;
    }
  }

  return sanitized;
}

// Función para parsear specifications desde string JSON
export function parseSpecificationsFromString(
  specsString: string
): IProductSpecifications {
  try {
    const parsed = JSON.parse(specsString);
    return sanitizeSpecifications(parsed);
  } catch (error) {
    console.error("Error parsing specifications:", error);
    return {};
  }
}
