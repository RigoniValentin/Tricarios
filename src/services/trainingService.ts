import { Training } from "types/TrainingTypes";
import { TrainingRepository } from "@repositories/trainingRepository";

export class TrainingService {
  private trainingRepository: TrainingRepository;

  constructor(trainingRepository: TrainingRepository) {
    this.trainingRepository = trainingRepository;
  }

  async createTraining(trainingData: Partial<Training>): Promise<Training> {
    return this.trainingRepository.create(trainingData);
  }

  async updateCupos(id: string, cupos: number): Promise<Training | null> {
    return this.trainingRepository.update(id, { cupos });
  }

  async getTrainingById(id: string): Promise<Training | null> {
    return this.trainingRepository.findById(id);
  }

  // Método opcional para devolver solo el campo cupos:
  async getCupos(id: string): Promise<number | null> {
    const training = await this.trainingRepository.findById(id);
    return training ? training.cupos : null;
  }

  async getAllTrainings(): Promise<Training[]> {
    return this.trainingRepository.findAll();
  }
}
