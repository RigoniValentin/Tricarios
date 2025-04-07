import { Query } from "types/RepositoryTypes";
import {
  IQuestionRepository,
  IQuestionService,
  Question,
} from "types/QuestionsTypes";

export class QuestionsService implements IQuestionService {
  private questionRepository: IQuestionRepository;

  constructor(questionRepository: IQuestionRepository) {
    this.questionRepository = questionRepository;
  }

  async createQuestion(question: Question): Promise<Question> {
    const pendingCount = await this.questionRepository.count({
      category: (question as any).category,
      status: "pending",
    });

    console.log("Pending count", pendingCount);
    /*
    if (pendingCount >= 3) {
      throw new Error(
        "Se alcanzó el límite de 3 preguntas pendientes para esta categoría. Espere a que el administrador responda alguna para agregar otra."
      );
    }
*/
    question.status = "pending";
    return this.questionRepository.create(question);
  }

  async findQuestions(query?: Query): Promise<Question[]> {
    return this.questionRepository.find(query);
  }

  async findQuestionById(id: string): Promise<Question | null> {
    return this.questionRepository.findById(id);
  }

  async updateQuestion(
    id: string,
    data: Partial<Question>
  ): Promise<Question | null> {
    return this.questionRepository.update(id, data);
  }

  async deleteQuestion(id: string): Promise<boolean> {
    return this.questionRepository.delete(id);
  }

  // Se actualiza el método answerQuestion para requerir dos URLs y responder solo si se proporcionan ambas
  // Agrega este método para actualizar la respuesta 1:
  async answerQuestionVideo1(
    id: string,
    videoUrl: string
  ): Promise<Question | null> {
    if (!videoUrl || !videoUrl.trim()) {
      throw new Error("Debe proporcionar una URL de video válida.");
    }
    // Obtiene la pregunta para conservar la respuesta 2 si existe
    const question = await this.questionRepository.findById(id);
    if (!question) {
      throw new Error("Pregunta no encontrada.");
    }
    const newAnswerUrls = question.answerUrls || [];
    newAnswerUrls[0] = videoUrl.trim();
    return this.questionRepository.update(id, {
      answerUrls: newAnswerUrls,
      status: "answered",
    });
  }

  // Agrega este método para actualizar la respuesta 2:
  async answerQuestionVideo2(
    id: string,
    videoUrl: string
  ): Promise<Question | null> {
    if (!videoUrl || !videoUrl.trim()) {
      throw new Error("Debe proporcionar una URL de video válida.");
    }
    const question = await this.questionRepository.findById(id);
    if (!question) {
      throw new Error("Pregunta no encontrada.");
    }
    const newAnswerUrls = question.answerUrls || [];
    newAnswerUrls[1] = videoUrl.trim();
    // No es necesario cambiar el estado, ya que si existe la respuesta 1 se consideró respondida
    return this.questionRepository.update(id, {
      answerUrls: newAnswerUrls,
    });
  }

  async rejectQuestion(
    id: string,
    rejectComment: string
  ): Promise<Question | null> {
    return this.questionRepository.update(id, {
      rejectComment,
      status: "rejected",
    });
  }
}
