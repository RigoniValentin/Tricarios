import { Document, Types } from "mongoose";
import { Query, Repository } from "./RepositoryTypes";

export interface Question extends Document {
  text: string;
  category: string;
  status: "pending" | "answered" | "rejected"; // modificado: se agrega "rejected"
  user: Types.ObjectId;
  answerUrl?: string; // nueva propiedad
  rejectComment?: string; // <-- nueva propiedad
}

// Puedes aprovechar la interface Repository de RepositoryTypes para los métodos comunes
export interface IQuestionRepository extends Repository<Question> {
  count(query: Query): Promise<number>; // nuevo método para contar documentos
}

export interface IQuestionService {
  createQuestion(question: Question): Promise<Question>;
  findQuestions(query?: Query): Promise<Question[]>;
  findQuestionById(id: string): Promise<Question | null>;
  updateQuestion(id: string, data: Partial<Question>): Promise<Question | null>;
  deleteQuestion(id: string): Promise<boolean>;
  answerQuestion(id: string, answerUrl: string): Promise<Question | null>;
  rejectQuestion(id: string, rejectComment: string): Promise<Question | null>; // <-- nuevo método
}
