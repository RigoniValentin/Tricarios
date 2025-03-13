import { Request, Response } from "express";
import { QuestionsService } from "@services/questionsService";
import { QuestionRepository } from "@repositories/questionsRepository";
import { Question } from "types/QuestionsTypes";

const questionsService = new QuestionsService(new QuestionRepository());

export const createQuestion = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Usa req.currentUser para saber quién hace la pregunta
    const userId = req.currentUser._id;
    const questionData = {
      ...req.body,
      user: userId,
    } as Question;

    const newQuestion = await questionsService.createQuestion(questionData);
    res.status(201).json(newQuestion);
  } catch (error) {
    res
      .status(400)
      .json({ message: error instanceof Error ? error.message : error });
  }
};

// Endpoint para que admin responda una pregunta
export const answerQuestion = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { answerUrl } = req.body;
    if (!answerUrl) {
      res
        .status(400)
        .json({ message: "El link de la respuesta es obligatorio." });
      return;
    }
    const answered = await questionsService.answerQuestion(id, answerUrl);
    if (!answered) {
      res.status(404).json({ message: "Pregunta no encontrada." });
      return;
    }
    res.json(answered);
  } catch (error) {
    res
      .status(500)
      .json({ message: error instanceof Error ? error.message : error });
  }
};

export const rejectQuestion = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { rejectComment } = req.body;
    if (!rejectComment) {
      res
        .status(400)
        .json({ message: "El comentario de rechazo es obligatorio." });
      return;
    }
    const rejected = await questionsService.rejectQuestion(id, rejectComment);
    if (!rejected) {
      res.status(404).json({ message: "Pregunta no encontrada." });
      return;
    }
    res.json(rejected);
  } catch (error) {
    res
      .status(500)
      .json({ message: error instanceof Error ? error.message : error });
  }
};

export const findQuestions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Opcional: Si el usuario no es admin, puedes filtrar por su id, por ejemplo:
    // const query = { ...req.query, user: req.currentUser._id };
    const query = req.query;
    const questions = await questionsService.findQuestions(query);
    res.json(questions);
  } catch (error) {
    res.status(500).json({
      message:
        error instanceof Error ? error.message : "Ocurrió un error inesperado.",
    });
  }
};

// Puedes agregar endpoints GET para que los usuarios consulten
// sus preguntas pendientes y respondidas, filtrando por req.currentUser._id y status.
