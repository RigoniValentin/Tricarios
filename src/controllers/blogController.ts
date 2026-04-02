import { Request, Response } from "express";
import BlogPost, { IBlogPost } from "@models/BlogPost";

// ─── Helpers ────────────────────────────────────────────────

const formatBlogForFrontend = (blog: IBlogPost) => {
  const obj = blog.toObject({ virtuals: true });
  return {
    ...obj,
    _id: (blog._id as any).toString(),
    id: (blog._id as any).toString(),
  };
};

// ─── GET /api/v1/blogs ─────────────────────────────────────

export const getBlogPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      page = "1",
      limit = "10",
      published,
      featured,
      tag,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter: any = {};
    if (published !== undefined) filter.published = published === "true";
    if (featured === "true") filter.featured = true;
    if (tag) filter.tags = { $in: [tag] };
    if (search) {
      filter.$text = { $search: search as string };
    }

    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    const [blogs, total] = await Promise.all([
      BlogPost.find(filter).sort(sort).skip(skip).limit(limitNum).exec(),
      BlogPost.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: blogs.map(formatBlogForFrontend),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error obteniendo blog posts:", error);
    res.status(500).json({ success: false, error: "Error obteniendo posts" });
  }
};

// ─── GET /api/v1/blogs/published ────────────────────────────

export const getPublishedPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      page = "1",
      limit = "10",
      tag,
      search,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const filter: any = { published: true };
    if (tag) filter.tags = { $in: [tag] };
    if (search) {
      filter.$text = { $search: search as string };
    }

    const [blogs, total] = await Promise.all([
      BlogPost.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select("-comments")
        .exec(),
      BlogPost.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: blogs.map(formatBlogForFrontend),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error obteniendo posts publicados:", error);
    res.status(500).json({ success: false, error: "Error obteniendo posts" });
  }
};

// ─── GET /api/v1/blogs/featured ─────────────────────────────

export const getFeaturedPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const blogs = await BlogPost.find({ published: true, featured: true })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("-comments")
      .exec();

    res.status(200).json({
      success: true,
      data: blogs.map(formatBlogForFrontend),
    });
  } catch (error) {
    console.error("❌ Error obteniendo posts destacados:", error);
    res.status(500).json({ success: false, error: "Error obteniendo posts destacados" });
  }
};

// ─── GET /api/v1/blogs/:slug ────────────────────────────────

export const getBlogBySlug = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;

    const blog = await BlogPost.findOne({ slug }).exec();
    if (!blog) {
      res.status(404).json({ success: false, error: "Post no encontrado" });
      return;
    }

    res.status(200).json({
      success: true,
      data: formatBlogForFrontend(blog),
    });
  } catch (error) {
    console.error("❌ Error obteniendo blog post:", error);
    res.status(500).json({ success: false, error: "Error obteniendo post" });
  }
};

// ─── POST /api/v1/blogs/:id/views ──────────────────────────

export const incrementViews = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Get client IP for unique tracking
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    // Check if this IP already viewed this post
    const blog = await BlogPost.findById(id).select("+viewedIps").exec();

    if (!blog) {
      res.status(404).json({ success: false, error: "Post no encontrado" });
      return;
    }

    if (!blog.viewedIps.includes(clientIp)) {
      blog.viewedIps.push(clientIp);
      blog.views += 1;
      await blog.save();
    }

    res.status(200).json({ success: true, data: { views: blog.views } });
  } catch (error) {
    console.error("❌ Error incrementando vistas:", error);
    res.status(500).json({ success: false, error: "Error actualizando vistas" });
  }
};

// ─── POST /api/v1/blogs ────────────────────────────────────

export const createBlogPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    console.log("📝 Creando blog post...");
    console.log("Body:", JSON.stringify(req.body, null, 2));

    const { title, excerpt, content, tags, published, featured, author, youtubeUrl } = req.body;

    // Handle cover image from multer
    let coverImage = "";
    if (req.file) {
      coverImage = `/uploads/blog/${req.file.filename}`;
      console.log(`📷 Imagen de portada: ${coverImage}`);
    }

    const blogData: any = {
      title,
      excerpt,
      content,
      coverImage,
      youtubeUrl: youtubeUrl || "",
      author: author || (req as any).currentUser?.name || "Admin",
      authorId: (req as any).currentUser?._id,
      tags: tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : [],
      published: published === "true" || published === true,
      featured: featured === "true" || featured === true,
    };

    const blog = new BlogPost(blogData);
    await blog.save();

    console.log("✅ Blog post creado:", blog.title);

    res.status(201).json({
      success: true,
      data: formatBlogForFrontend(blog),
      message: "Post creado exitosamente",
    });
  } catch (error: any) {
    console.error("❌ Error creando blog post:", error);
    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        error: "Ya existe un post con ese título/slug",
      });
      return;
    }
    res.status(500).json({ success: false, error: "Error creando post" });
  }
};

// ─── PUT /api/v1/blogs/:id ─────────────────────────────────

export const updateBlogPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    console.log(`📝 Actualizando blog post ${id}...`);

    const { title, excerpt, content, tags, published, featured, author, youtubeUrl } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (excerpt !== undefined) updateData.excerpt = excerpt;
    if (content !== undefined) updateData.content = content;
    if (author !== undefined) updateData.author = author;
    if (youtubeUrl !== undefined) updateData.youtubeUrl = youtubeUrl;
    if (published !== undefined)
      updateData.published = published === "true" || published === true;
    if (featured !== undefined)
      updateData.featured = featured === "true" || featured === true;
    if (tags !== undefined)
      updateData.tags = Array.isArray(tags) ? tags : JSON.parse(tags);

    // Handle cover image from multer
    if (req.file) {
      updateData.coverImage = `/uploads/blog/${req.file.filename}`;
      console.log(`📷 Nueva imagen de portada: ${updateData.coverImage}`);
    }

    const blog = await BlogPost.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).exec();

    if (!blog) {
      res.status(404).json({ success: false, error: "Post no encontrado" });
      return;
    }

    console.log("✅ Blog post actualizado:", blog.title);

    res.status(200).json({
      success: true,
      data: formatBlogForFrontend(blog),
      message: "Post actualizado exitosamente",
    });
  } catch (error) {
    console.error("❌ Error actualizando blog post:", error);
    res.status(500).json({ success: false, error: "Error actualizando post" });
  }
};

// ─── DELETE /api/v1/blogs/:id ──────────────────────────────

export const deleteBlogPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Eliminando blog post ${id}...`);

    const blog = await BlogPost.findByIdAndDelete(id).exec();

    if (!blog) {
      res.status(404).json({ success: false, error: "Post no encontrado" });
      return;
    }

    console.log("✅ Blog post eliminado:", blog.title);

    res.status(200).json({
      success: true,
      message: "Post eliminado exitosamente",
    });
  } catch (error) {
    console.error("❌ Error eliminando blog post:", error);
    res.status(500).json({ success: false, error: "Error eliminando post" });
  }
};

// ─── POST /api/v1/blogs/:id/reactions ──────────────────────

export const toggleReaction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    const user = (req as any).currentUser;

    if (!user) {
      res.status(401).json({ success: false, error: "Autenticación requerida" });
      return;
    }

    const userId = (user._id as any).toString();

    if (!type) {
      res.status(400).json({
        success: false,
        error: "type es requerido",
      });
      return;
    }

    const blog = await BlogPost.findById(id).exec();
    if (!blog) {
      res.status(404).json({ success: false, error: "Post no encontrado" });
      return;
    }

    // Check if user already reacted with same type
    const existingIndex = blog.reactions.findIndex(
      (r) => r.userId === userId && r.type === type
    );

    if (existingIndex >= 0) {
      // Remove reaction (toggle off)
      blog.reactions.splice(existingIndex, 1);
    } else {
      // Remove any existing reaction from this user, then add new one
      blog.reactions = blog.reactions.filter((r) => r.userId !== userId);
      blog.reactions.push({ userId, type });
    }

    await blog.save();

    res.status(200).json({
      success: true,
      data: {
        reactions: blog.reactions,
        reactionCount: blog.reactions.length,
      },
    });
  } catch (error) {
    console.error("❌ Error toggling reaction:", error);
    res.status(500).json({ success: false, error: "Error actualizando reacción" });
  }
};

// ─── POST /api/v1/blogs/:id/comments ───────────────────────

export const addComment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const user = (req as any).currentUser;

    if (!user) {
      res.status(401).json({ success: false, error: "Autenticación requerida" });
      return;
    }

    if (!content) {
      res.status(400).json({
        success: false,
        error: "content es requerido",
      });
      return;
    }

    if (content.length > 1000) {
      res.status(400).json({
        success: false,
        error: "El comentario no puede exceder 1000 caracteres",
      });
      return;
    }

    const blog = await BlogPost.findById(id).exec();
    if (!blog) {
      res.status(404).json({ success: false, error: "Post no encontrado" });
      return;
    }

    const authorName = `${user.name} ${user.lastname}`;

    blog.comments.push({
      author: authorName,
      authorId: user._id,
      authorAvatar: user.avatar || "",
      content,
      createdAt: new Date(),
    });

    await blog.save();

    res.status(201).json({
      success: true,
      data: {
        comments: blog.comments,
        commentCount: blog.comments.length,
      },
      message: "Comentario agregado exitosamente",
    });
  } catch (error) {
    console.error("❌ Error agregando comentario:", error);
    res.status(500).json({ success: false, error: "Error agregando comentario" });
  }
};

// ─── DELETE /api/v1/blogs/:postId/comments/:commentId ──────

export const deleteComment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id, commentId } = req.params;

    const blog = await BlogPost.findById(id).exec();
    if (!blog) {
      res.status(404).json({ success: false, error: "Post no encontrado" });
      return;
    }

    const commentIndex = blog.comments.findIndex(
      (c) => (c._id as any)?.toString() === commentId
    );

    if (commentIndex === -1) {
      res.status(404).json({ success: false, error: "Comentario no encontrado" });
      return;
    }

    blog.comments.splice(commentIndex, 1);
    await blog.save();

    res.status(200).json({
      success: true,
      message: "Comentario eliminado exitosamente",
      data: {
        comments: blog.comments,
        commentCount: blog.comments.length,
      },
    });
  } catch (error) {
    console.error("❌ Error eliminando comentario:", error);
    res.status(500).json({ success: false, error: "Error eliminando comentario" });
  }
};

// ─── GET /api/v1/blogs/tags ────────────────────────────────

export const getAllTags = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const tags = await BlogPost.distinct("tags", { published: true }).exec();

    res.status(200).json({
      success: true,
      data: tags.sort(),
    });
  } catch (error) {
    console.error("❌ Error obteniendo tags:", error);
    res.status(500).json({ success: false, error: "Error obteniendo tags" });
  }
};
