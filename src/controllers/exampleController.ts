import { Request, Response } from "express";
import { ExampleModel } from "@models/Example";

export const getExamples = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { category } = req.query;
    if (
      !category ||
      !["conciencia", "biologia", "emociones"].includes(category as string)
    ) {
      res.status(400).json({ message: "Categoría inválida" });
      return;
    }
    const doc = await ExampleModel.findOne({ category });
    res.json(doc ? doc.examples : []);
  } catch (error) {
    res
      .status(500)
      .json({ message: error instanceof Error ? error.message : error });
  }
};

export const saveExamples = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { category, examples } = req.body;
    if (
      !category ||
      !["conciencia", "biologia", "emociones"].includes(category)
    ) {
      res.status(400).json({ message: "Categoría inválida" });
      return;
    }
    if (!Array.isArray(examples)) {
      res
        .status(400)
        .json({ message: "El campo examples debe ser un arreglo de strings" });
      return;
    }
    const updated = await ExampleModel.findOneAndUpdate(
      { category },
      { examples },
      { new: true, upsert: true }
    );
    res.json(updated);
  } catch (error) {
    res
      .status(500)
      .json({ message: error instanceof Error ? error.message : error });
  }
};
