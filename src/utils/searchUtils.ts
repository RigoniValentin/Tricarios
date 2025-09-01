// Utilidades para búsqueda inteligente de productos
export interface SearchConfig {
  exactMatchScore: number;
  partialMatchScore: number;
  tagMatchScore: number;
  categoryMatchScore: number;
}

const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  exactMatchScore: 100,
  partialMatchScore: 50,
  tagMatchScore: 75,
  categoryMatchScore: 25,
};

/**
 * Normaliza una cadena de texto para búsqueda
 * - Convierte a minúsculas
 * - Elimina acentos
 * - Normaliza espacios
 * - Escapa caracteres especiales de regex
 */
export const normalizeSearchTerm = (term: string): string => {
  return term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
    .replace(/\s+/g, " ") // Normalizar espacios múltiples
    .trim();
};

/**
 * Escapa caracteres especiales para uso en regex
 */
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Convierte una cadena de búsqueda en palabras individuales
 */
export const extractSearchWords = (searchTerm: string): string[] => {
  const normalized = normalizeSearchTerm(searchTerm);
  return normalized
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => escapeRegex(word));
};

/**
 * Crea queries de MongoDB para búsqueda flexible
 */
export const createSearchQueries = (searchTerm: string) => {
  const normalizedTerm = normalizeSearchTerm(searchTerm);
  const escapedTerm = escapeRegex(normalizedTerm);
  const words = extractSearchWords(searchTerm);

  // Verificar si el término de búsqueda es un número (para managementId)
  const isNumericSearch = /^\d+$/.test(searchTerm.trim());
  const numericValue = isNumericSearch ? parseInt(searchTerm.trim(), 10) : null;

  // Query para coincidencia exacta (mayor prioridad)
  const exactMatchQuery = {
    $or: [
      { name: { $regex: new RegExp(`^${escapedTerm}$`, "i") } },
      { description: { $regex: new RegExp(`^${escapedTerm}$`, "i") } },
      ...(numericValue !== null ? [{ managementId: numericValue }] : []),
    ],
  };

  // Query para coincidencia parcial del término completo
  const partialTermQuery = {
    $or: [
      { name: { $regex: new RegExp(escapedTerm, "i") } },
      { description: { $regex: new RegExp(escapedTerm, "i") } },
      { category: { $regex: new RegExp(escapedTerm, "i") } },
      { tags: { $elemMatch: { $regex: new RegExp(escapedTerm, "i") } } },
    ],
  };

  // Query para búsqueda por palabras individuales (todas las palabras deben estar presentes)
  const allWordsQuery =
    words.length > 1
      ? {
          $and: words.map((word) => ({
            $or: [
              { name: { $regex: new RegExp(word, "i") } },
              { description: { $regex: new RegExp(word, "i") } },
              { category: { $regex: new RegExp(word, "i") } },
              { tags: { $elemMatch: { $regex: new RegExp(word, "i") } } },
            ],
          })),
        }
      : null;

  // Query para búsqueda por palabras individuales (cualquier palabra puede estar presente)
  const anyWordQuery =
    words.length > 1
      ? {
          $or: words.map((word) => ({
            $or: [
              { name: { $regex: new RegExp(word, "i") } },
              { description: { $regex: new RegExp(word, "i") } },
              { category: { $regex: new RegExp(word, "i") } },
              { tags: { $elemMatch: { $regex: new RegExp(word, "i") } } },
            ],
          })),
        }
      : null;

  return {
    exactMatchQuery,
    partialTermQuery,
    allWordsQuery,
    anyWordQuery,
    words,
    isNumericSearch,
    numericValue,
  };
};

/**
 * Calcula el score de relevancia de un producto basado en el término de búsqueda
 */
export const calculateRelevanceScore = (
  product: any,
  searchTerm: string,
  config: SearchConfig = DEFAULT_SEARCH_CONFIG
): number => {
  const normalizedSearch = normalizeSearchTerm(searchTerm);
  const normalizedName = normalizeSearchTerm(product.name || "");
  const normalizedDescription = normalizeSearchTerm(product.description || "");
  const normalizedCategory = normalizeSearchTerm(product.category || "");
  const words = extractSearchWords(searchTerm);

  let score = 0;

  // Verificar si es búsqueda numérica para managementId
  const isNumericSearch = /^\d+$/.test(searchTerm.trim());
  const numericValue = isNumericSearch ? parseInt(searchTerm.trim(), 10) : null;

  // Coincidencia exacta de managementId (máxima prioridad)
  if (numericValue !== null && product.managementId === numericValue) {
    score += config.exactMatchScore * 1.5; // Prioridad extra para managementId
  }
  // Coincidencia exacta en nombre (máxima prioridad)
  else if (normalizedName === normalizedSearch) {
    score += config.exactMatchScore;
  }
  // Coincidencia exacta en descripción
  else if (normalizedDescription === normalizedSearch) {
    score += config.exactMatchScore * 0.8;
  }
  // Coincidencia parcial en nombre
  else if (normalizedName.includes(normalizedSearch)) {
    score += config.partialMatchScore;
  }
  // Coincidencia parcial en descripción
  else if (normalizedDescription.includes(normalizedSearch)) {
    score += config.partialMatchScore * 0.6;
  }

  // Bonus por coincidencias en categoría
  if (normalizedCategory.includes(normalizedSearch)) {
    score += config.categoryMatchScore;
  }

  // Bonus por coincidencias en tags
  if (product.tags && Array.isArray(product.tags)) {
    const tagMatches = product.tags.some((tag: string) =>
      normalizeSearchTerm(tag).includes(normalizedSearch)
    );
    if (tagMatches) {
      score += config.tagMatchScore;
    }
  }

  // Bonus por número de palabras que coinciden
  if (words.length > 1) {
    const matchingWords = words.filter(
      (word) =>
        normalizedName.includes(word) ||
        normalizedDescription.includes(word) ||
        normalizedCategory.includes(word)
    );
    score += (matchingWords.length / words.length) * 30;
  }

  // Bonus si el producto está en stock y destacado
  if (product.inStock) score += 5;
  if (product.featured) score += 10;

  return Math.round(score);
};

/**
 * Ordena productos por relevancia
 */
export const sortByRelevance = (
  products: any[],
  searchTerm: string,
  config?: SearchConfig
): any[] => {
  return products
    .map((product) => ({
      ...product,
      relevanceScore: calculateRelevanceScore(product, searchTerm, config),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
};

/**
 * Crea un pipeline de agregación de MongoDB para búsqueda con scoring
 */
export const createSearchAggregationPipeline = (
  searchTerm: string,
  additionalFilters: any = {},
  page: number = 1,
  limit: number = 10
) => {
  const { exactMatchQuery, partialTermQuery, allWordsQuery, anyWordQuery } =
    createSearchQueries(searchTerm);
  const skip = (page - 1) * limit;

  const pipeline: any[] = [];

  // Filtros adicionales primero
  if (Object.keys(additionalFilters).length > 0) {
    pipeline.push({ $match: additionalFilters });
  }

  // Etapa de búsqueda y scoring
  pipeline.push({
    $addFields: {
      searchScore: {
        $sum: [
          // Coincidencia exacta
          {
            $cond: [exactMatchQuery, 100, 0],
          },
          // Coincidencia parcial del término completo
          {
            $cond: [partialTermQuery, 50, 0],
          },
          // Bonus por todas las palabras presentes
          ...(allWordsQuery
            ? [
                {
                  $cond: [allWordsQuery, 30, 0],
                },
              ]
            : []),
          // Bonus por stock y featured
          { $cond: ["$inStock", 5, 0] },
          { $cond: ["$featured", 10, 0] },
        ],
      },
    },
  });

  // Filtrar solo productos que tienen algún score
  pipeline.push({
    $match: {
      $or: [
        exactMatchQuery,
        partialTermQuery,
        ...(allWordsQuery ? [allWordsQuery] : []),
        ...(anyWordQuery ? [anyWordQuery] : []),
      ],
    },
  });

  // Ordenar por score descendente, luego por featured y fecha
  pipeline.push({
    $sort: {
      searchScore: -1,
      featured: -1,
      createdAt: -1,
    },
  });

  // Paginación
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  return pipeline;
};
