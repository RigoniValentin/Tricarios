import { Request, Response } from "express";
import { TrainingService } from "@services/trainingService";
import { TrainingRepository } from "@repositories/trainingRepository";

const trainingService = new TrainingService(new TrainingRepository());

export const updateCupos = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { cupos } = req.body;
    if (typeof cupos !== "number") {
      res.status(400).json({ message: "El campo 'cupos' debe ser un número." });
      return;
    }
    const updatedTraining = await trainingService.updateCupos(id, cupos);
    if (!updatedTraining) {
      res.status(404).json({ message: "Capacitación no encontrada." });
      return;
    }
    res.json(updatedTraining);
  } catch (error) {
    res
      .status(500)
      .json({ message: error instanceof Error ? error.message : error });
  }
};

export const getCupos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const cupos = await trainingService.getCupos(id);
    if (cupos === null) {
      res.status(404).json({ message: "Capacitación no encontrada." });
      return;
    }
    res.json({ cupos });
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : error,
    });
  }
};

export const getTrainings = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const trainings = await trainingService.getAllTrainings();
    res.json(trainings);
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : error,
    });
  }
};

export const createTraining = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, cupos } = req.body;
    if (!name || cupos === undefined) {
      res
        .status(400)
        .json({ message: "El nombre y la cantidad de cupos son requeridos." });
      return;
    }
    const training = await trainingService.createTraining({ name, cupos });
    res.status(201).json(training);
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : error,
    });
  }
};
