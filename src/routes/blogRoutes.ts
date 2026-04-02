import { Router } from "express";
import {
  getBlogPosts,
  getPublishedPosts,
  getFeaturedPosts,
  getBlogBySlug,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  incrementViews,
  toggleReaction,
  addComment,
  deleteComment,
  getAllTags,
} from "@controllers/blogController";
import { uploadBlogImage, handleUploadError } from "@middlewares/upload";
import { verifyToken, getPermissions } from "@middlewares/auth";

const router = Router();

// ─── Rutas públicas ────────────────────────────────────────

// GET /api/v1/blogs/published - Posts publicados (público)
router.get("/published", getPublishedPosts);

// GET /api/v1/blogs/featured - Posts destacados (público)
router.get("/featured", getFeaturedPosts);

// GET /api/v1/blogs/tags - Todos los tags (público)
router.get("/tags", getAllTags);

// GET /api/v1/blogs/:slug - Post por slug (público)
router.get("/slug/:slug", getBlogBySlug);

// POST /api/v1/blogs/:id/views - Incrementar vistas (público, con control por IP)
router.post("/:id/views", incrementViews);

// POST /api/v1/blogs/:id/reactions - Toggle reacción (requiere autenticación)
router.post("/:id/reactions", verifyToken, toggleReaction);

// POST /api/v1/blogs/:id/comments - Agregar comentario (requiere autenticación)
router.post("/:id/comments", verifyToken, addComment);

// ─── Rutas protegidas (admin) ──────────────────────────────

// GET /api/v1/blogs - Todos los posts (admin)
router.get("/", verifyToken, getBlogPosts);

// POST /api/v1/blogs - Crear post (admin)
router.post(
  "/",
  verifyToken,
  uploadBlogImage,
  handleUploadError,
  createBlogPost
);

// PUT /api/v1/blogs/:id - Actualizar post (admin)
router.put(
  "/:id",
  verifyToken,
  uploadBlogImage,
  handleUploadError,
  updateBlogPost
);

// DELETE /api/v1/blogs/:id - Eliminar post (admin)
router.delete("/:id", verifyToken, deleteBlogPost);

// DELETE /api/v1/blogs/:id/comments/:commentId - Eliminar comentario (admin)
router.delete("/:id/comments/:commentId", verifyToken, deleteComment);

export default router;
