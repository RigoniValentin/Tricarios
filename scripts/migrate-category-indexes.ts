import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoDbUrl = process.env.MONGODB_URL_STRING;
if (!mongoDbUrl) {
  console.error("MONGODB_URL_STRING is not defined in your environment.");
  process.exit(1);
}

const migrateCategoryIndexes = async () => {
  try {
    await mongoose.connect(mongoDbUrl as string);
    console.log("Conectado a MongoDB");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("No se pudo obtener la referencia a la base de datos");
    }

    const categoriesCollection = db.collection("categories");
    const indexes = await categoriesCollection.indexes();
    console.log("\nÍndices actuales en 'categories':");
    indexes.forEach((idx: any) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} ${idx.unique ? "(unique)" : ""}`);
    });

    // 1) Eliminar el índice único global antiguo sobre 'name' (si existe).
    const oldGlobalUnique = indexes.find(
      (idx: any) =>
        idx.name === "name_1" ||
        (idx.key && idx.key.name === 1 && Object.keys(idx.key).length === 1 && idx.unique)
    );
    if (oldGlobalUnique && typeof oldGlobalUnique.name === "string") {
      console.log(`\nEliminando índice único global antiguo: ${oldGlobalUnique.name}`);
      await categoriesCollection.dropIndex(oldGlobalUnique.name);
      console.log("  Eliminado.");
    } else {
      console.log("\nNo se encontró índice único global antiguo sobre 'name'. OK.");
    }

    // 2) Asegurar que el campo parentCategoryId exista en todos los documentos
    //    (categorías legadas podrían no tener el campo, lo que rompería el
    //    nuevo índice compuesto al tratar missing != null).
    const missingParent = await categoriesCollection.countDocuments({
      parentCategoryId: { $exists: false },
    });
    if (missingParent > 0) {
      console.log(`\nDocumentos sin parentCategoryId: ${missingParent}. Inicializando a null...`);
      await categoriesCollection.updateMany(
        { parentCategoryId: { $exists: false } },
        { $set: { parentCategoryId: null } }
      );
      console.log("  Inicializados.");
    } else {
      console.log("\nTodos los documentos tienen parentCategoryId. OK.");
    }

    // 3) Detectar duplicados que el nuevo índice compuesto rechazaría.
    //    Si existen, el script falla de forma segura para que el operador
    //    resuelva los duplicados manualmente antes de continuar.
    const duplicates = await categoriesCollection
      .aggregate([
        {
          $group: {
            _id: { name: "$name", parentCategoryId: "$parentCategoryId" },
            ids: { $push: "$_id" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();

    if (duplicates.length > 0) {
      console.log(
        "\nATENCIÓN: se encontraron duplicados (mismo nombre bajo el mismo padre):"
      );
      duplicates.forEach((d: any) => {
        console.log(`  - name="${d._id.name}", parent=${d._id.parentCategoryId}, count=${d.count}, ids=${JSON.stringify(d.ids)}`);
      });
      console.log(
        "\nResolvé los duplicados manualmente (renombrar/eliminar) y volvé a correr este script."
      );
      process.exit(2);
    }

    // 4) Crear el nuevo índice compuesto único.
    const compoundIndexName = "name_1_parentCategoryId_1";
    const hasCompound = (await categoriesCollection.indexes()).some(
      (idx: any) => idx.name === compoundIndexName
    );
    if (!hasCompound) {
      console.log(`\nCreando índice compuesto único: ${compoundIndexName}`);
      await categoriesCollection.createIndex(
        { name: 1, parentCategoryId: 1 },
        { unique: true, name: compoundIndexName }
      );
      console.log("  Creado.");
    } else {
      console.log(`\nEl índice compuesto ${compoundIndexName} ya existe. OK.`);
    }

    console.log("\nÍndices finales:");
    const finalIndexes = await categoriesCollection.indexes();
    finalIndexes.forEach((idx: any) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} ${idx.unique ? "(unique)" : ""}`);
    });

    console.log("\nMigración completada con éxito.");
    process.exit(0);
  } catch (error) {
    console.error("Error durante la migración:", error);
    process.exit(1);
  }
};

migrateCategoryIndexes();