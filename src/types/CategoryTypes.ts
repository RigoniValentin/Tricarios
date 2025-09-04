// Category-related TypeScript types for API responses and requests

// Product counts endpoint types
export interface CategoryProductCountsQuery {
  includeParents?: string;
  includeLeaves?: string;
  rollupParents?: string;
  inStock?: string;
  featured?: string;
  search?: string;
  tenantId?: string;
  shopId?: string;
}

export interface CountsPayload {
  counts: Record<string, number>;
  updatedAt?: string;
}

export interface CountsResponse {
  success: boolean;
  data?: CountsPayload;
  message?: string;
  error?: string;
}

// General category types
export interface CategoryHierarchyNode {
  _id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  level: number;
  isParent: boolean;
  parentCategoryId?: string | null;
  productCount: number;
  subcategories?: CategoryHierarchyNode[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryFilters {
  search?: string;
  parentId?: string;
  level?: number;
  isParent?: boolean;
}

export interface CategoryPaginationOptions {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}
