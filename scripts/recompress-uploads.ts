/**
 * Re-procesa imágenes existentes con la nueva configuración de calidad
 * (2560px max, JPEG/WebP quality 92). Útil cuando se actualizan los valores
 * del compressor y se quieren aplicar retroactivamente.
 *
 * USO:
 *   ts-node scripts/recompress-uploads.ts [directorio]
 *
 * Si no se pasa directorio, procesa todos los subdirectorios de /home/Tricarios/uploads
 * (products, slides, blog, avatars).
 */
import { compressExistingImages } from "../src/utils/imageCompressor";
import path from "path";

async function main() {
  const target = process.argv[2] || path.join(process.cwd(), "uploads");
  console.log(`\n🗜️  Re-compresión de imágenes en: ${target}\n`);
  console.log("⚠️  Esto SOBREESCRIBE los archivos existentes.");
  console.log("   Asegurate de tener backup antes.\n");

  const result = await compressExistingImages(target);
  console.log("\n=== RESUMEN ===");
  console.log(`Procesados: ${result.processed}`);
  console.log(`Comprimidos (más chicos): ${result.compressed}`);
  console.log(`Ahorrado: ${(result.totalSaved / 1024 / 1024).toFixed(2)} MB\n`);

  if (result.compressed === 0 && result.processed > 0) {
    console.log(
      "ℹ️  Ninguna imagen se redujo — probablemente ya están en la mejor calidad posible.",
    );
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});