/**
 * Wrapper JS para re-comprimir imágenes usando el código ya compilado en dist/.
 * Evita depender de ts-node (incompatible con Node 22).
 *
 * USO: node scripts/recompress-uploads.js [directorio]
 */
const path = require("path");
const { compressExistingImages } = require("../dist/src/utils/imageCompressor");

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