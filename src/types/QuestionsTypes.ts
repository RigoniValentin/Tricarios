import { Document, Types } from "mongoose";
import { Query, Repository } from "./RepositoryTypes";

export interface Question extends Document {
  text: string;
  category: string;
  status: "pending" | "answered" | "rejected";
  user: Types.ObjectId;
  // Se cambia de answerUrl a answerUrls, que es un arreglo de strings.
  answerUrls?: string[];
  rejectComment?: string;
}

// Puedes aprovechar la interface Repository de RepositoryTypes para los métodos comunes
export interface IQuestionRepository extends Repository<Question> {
  count(query: Query): Promise<number>;
}

export interface IQuestionService {
  createQuestion(question: Question): Promise<Question>;
  findQuestions(query?: Query): Promise<Question[]>;
  findQuestionById(id: string): Promise<Question | null>;
  updateQuestion(id: string, data: Partial<Question>): Promise<Question | null>;
  deleteQuestion(id: string): Promise<boolean>;
  // Métodos para responder individualmente con cada video:
  answerQuestionVideo1(id: string, videoUrl: string): Promise<Question | null>;
  answerQuestionVideo2(id: string, videoUrl: string): Promise<Question | null>;
  rejectQuestion(id: string, rejectComment: string): Promise<Question | null>;
}
