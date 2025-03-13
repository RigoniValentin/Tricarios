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
    // Verificar la cantidad de preguntas pendientes en esa categoría
    const pendingCount = await this.questionRepository.count({
      category: (question as any).category,
      status: "pending",
    });

    console.log("Pending count", pendingCount);

    if (pendingCount >= 3) {
      throw new Error(
        "Se alcanzó el límite de 3 preguntas pendientes para esta categoría. Espere a que el administrador responda alguna para agregar otra."
      );
    }

    // Se crea la pregunta en estado pending
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

  // Método para que el admin responda una pregunta. Recibe el id y el link de youtube
  async answerQuestion(
    id: string,
    answerUrl: string
  ): Promise<Question | null> {
    // Actualiza la pregunta, asigna el link de respuesta y marca el status como answered.
    return this.questionRepository.update(id, {
      answerUrl,
      status: "answered",
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
