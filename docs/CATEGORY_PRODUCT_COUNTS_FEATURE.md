# Category Product Counts Endpoint

## Overview

The Category Product Counts endpoint provides an efficient way to retrieve product counts for all categories in a single API call, with support for hierarchical rollup calculations and various filtering options.

## Endpoint

```
GET /api/v1/categories/product-counts
```

## Query Parameters

| Parameter        | Type    | Default | Description                                                                                         |
| ---------------- | ------- | ------- | --------------------------------------------------------------------------------------------------- |
| `includeParents` | boolean | `true`  | Include categories that have child categories                                                       |
| `includeLeaves`  | boolean | `true`  | Include categories that don't have child categories                                                 |
| `rollupParents`  | boolean | `true`  | If true, parent categories show cumulative count of all descendants. If false, only direct products |
| `inStock`        | boolean | -       | Filter products by stock status                                                                     |
| `featured`       | boolean | -       | Filter products by featured status                                                                  |
| `search`         | string  | -       | Search filter applied to products                                                                   |

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "data": {
    "counts": {
      "68b47d8ce2a98ab7c43623f9": 42,
      "68b771c839cea21795777011": 7,
      "68b7715539cea21795776e91": 0
    },
    "updatedAt": "2025-09-04T12:34:56.000Z"
  }
}
```

### Error Response (500)

```json
{
  "success": false,
  "message": "Error al obtener los conteos de productos por categoría",
  "error": "Detailed error message"
}
```

## Use Cases

### 1. Get All Counts (Default)

```bash
GET /api/v1/categories/product-counts
```

Returns counts for all categories with hierarchical rollup.

### 2. Parent Categories Only with Rollup

```bash
GET /api/v1/categories/product-counts?includeParents=true&includeLeaves=false&rollupParents=true
```

Useful for navigation menus showing total products in each parent category.

### 3. Leaf Categories Only (Direct Counts)

```bash
GET /api/v1/categories/product-counts?includeParents=false&includeLeaves=true&rollupParents=false
```

Useful for showing actual product distribution across final categories.

### 4. In-Stock Products Only

```bash
GET /api/v1/categories/product-counts?inStock=true
```

Useful for inventory management and customer-facing counts.

### 5. Featured Products Only

```bash
GET /api/v1/categories/product-counts?featured=true
```

Useful for highlighting promoted products in categories.

## Implementation Details

### Performance Optimizations

- Uses MongoDB aggregation pipeline for efficient counting
- Builds hierarchy map in memory for fast rollup calculations
- Supports index usage on `categoryId`, `inStock`, and `featured` fields

### Rollup Logic

- **rollupParents=true**: Parent categories accumulate counts from all descendant categories
- **rollupParents=false**: Parent categories only show directly assigned products

### Filtering Logic

1. Product filters (`inStock`, `featured`, `search`) are applied first
2. Counts are calculated for matching products only
3. Hierarchy rollup is performed on filtered counts
4. Final filtering by `includeParents`/`includeLeaves` is applied

## Database Indexes

Recommended indexes for optimal performance:

```javascript
// Products collection
db.products.createIndex({ categoryId: 1 });
db.products.createIndex({ categoryId: 1, inStock: 1 });
db.products.createIndex({ categoryId: 1, featured: 1 });

// Categories collection
db.categories.createIndex({ parentCategoryId: 1 });
```

## Frontend Integration

This endpoint is designed for frontend applications that need to display product counts across category hierarchies efficiently:

```javascript
// Frontend usage example
const response = await fetch(
  "/api/v1/categories/product-counts?includeParents=true&rollupParents=true"
);
const { counts } = response.data;

// Use counts to update UI
Object.entries(counts).forEach(([categoryId, count]) => {
  updateCategoryDisplay(categoryId, count);
});
```

## Testing

Use the provided `product_counts_tests.http` file to test various scenarios:

- Default behavior
- Different combinations of include parameters
- Product filtering
- Edge cases and error handling

## Response Time

- Typical response time: 10-50ms for small catalogs
- Scales well with proper indexing
- Consider caching for high-traffic applications (TTL: 1-5 minutes)

## Error Handling

The endpoint handles various error scenarios gracefully:

- Database connection issues
- Invalid query parameters (falls back to defaults)
- Empty result sets
- Malformed category hierarchy

## Cache Strategy

Consider implementing cache for high-traffic scenarios:

- Cache key: `product-counts:v1[:filters-hash]`
- TTL: 1-5 minutes
- Invalidate on product/category changes
