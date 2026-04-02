import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

interface CompressionResult {
  originalPath: string;
  compressedPath: string;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  savedPercent: number;
}

// Max width for product images (maintains aspect ratio)
const MAX_WIDTH = 1200;
const JPEG_QUALITY = 80;
const WEBP_QUALITY = 80;
const PNG_COMPRESSION_LEVEL = 8;

/**
 * Compress a single image file in-place (overwrites the original).
 * Converts to the same format but optimized, resizing if wider than MAX_WIDTH.
 */
export const compressImage = async (
  filePath: string
): Promise<CompressionResult | null> => {
  try {
    const stat = await fs.stat(filePath);
    const originalSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();

    // Skip GIFs (animated) and very small files (<10KB)
    if (ext === ".gif" || originalSize < 10240) {
      return null;
    }

    const tempPath = filePath + ".tmp";

    let pipeline = sharp(filePath).rotate(); // auto-rotate based on EXIF

    // Resize if wider than MAX_WIDTH
    pipeline = pipeline.resize({
      width: MAX_WIDTH,
      height: MAX_WIDTH,
      fit: "inside",
      withoutEnlargement: true,
    });

    // Apply format-specific compression
    switch (ext) {
      case ".jpg":
      case ".jpeg":
        pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
        break;
      case ".png":
        pipeline = pipeline.png({ compressionLevel: PNG_COMPRESSION_LEVEL });
        break;
      case ".webp":
        pipeline = pipeline.webp({ quality: WEBP_QUALITY });
        break;
      default:
        // Unknown format, convert to JPEG
        pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
        break;
    }

    await pipeline.toFile(tempPath);

    // Get compressed size
    const compressedStat = await fs.stat(tempPath);
    const compressedSize = compressedStat.size;

    // Only keep compressed version if it's actually smaller
    if (compressedSize < originalSize) {
      await fs.rename(tempPath, filePath);
      const savedBytes = originalSize - compressedSize;
      const savedPercent = Math.round((savedBytes / originalSize) * 100);

      console.log(
        `🗜️  Comprimido: ${path.basename(filePath)} | ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (-${savedPercent}%)`
      );

      return {
        originalPath: filePath,
        compressedPath: filePath,
        originalSize,
        compressedSize,
        savedBytes,
        savedPercent,
      };
    } else {
      // Compressed is bigger or same, remove temp and keep original
      await fs.unlink(tempPath);
      console.log(
        `⏭️  Sin compresión útil: ${path.basename(filePath)} (${formatBytes(originalSize)})`
      );
      return null;
    }
  } catch (error) {
    console.error(`❌ Error comprimiendo ${filePath}:`, error);
    // Clean up temp file if it exists
    try {
      await fs.unlink(filePath + ".tmp");
    } catch {
      // ignore
    }
    return null;
  }
};

/**
 * Compress multiple image files (used after multer upload).
 */
export const compressUploadedFiles = async (
  files: Express.Multer.File[]
): Promise<CompressionResult[]> => {
  if (!files || files.length === 0) return [];

  const results: CompressionResult[] = [];

  for (const file of files) {
    const result = await compressImage(file.path);
    if (result) {
      // Update the file size in the multer object
      file.size = result.compressedSize;
      results.push(result);
    }
  }

  if (results.length > 0) {
    const totalSaved = results.reduce((sum, r) => sum + r.savedBytes, 0);
    console.log(
      `✅ Compresión completada: ${results.length} archivos, ${formatBytes(totalSaved)} ahorrados`
    );
  }

  return results;
};

/**
 * Compress all existing images in a directory recursively.
 */
export const compressExistingImages = async (
  directory: string
): Promise<{ processed: number; compressed: number; totalSaved: number }> => {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  let processed = 0;
  let compressed = 0;
  let totalSaved = 0;

  const processDir = async (dir: string) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await processDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (imageExtensions.includes(ext)) {
            processed++;
            const result = await compressImage(fullPath);
            if (result) {
              compressed++;
              totalSaved += result.savedBytes;
            }
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error procesando directorio ${dir}:`, error);
    }
  };

  console.log(`🔄 Iniciando compresión de imágenes existentes en: ${directory}`);
  await processDir(directory);
  console.log(
    `✅ Compresión masiva completada: ${compressed}/${processed} archivos comprimidos, ${formatBytes(totalSaved)} ahorrados`
  );

  return { processed, compressed, totalSaved };
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};
