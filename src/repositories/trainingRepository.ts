import { TrainingModel } from "@models/Training";
import { Training } from "types/TrainingTypes";

export class TrainingRepository {
  async create(trainingData: Partial<Training>): Promise<Training> {
    const training = new TrainingModel(trainingData);
    return await training.save();
  }

  async find(query?: Record<string, unknown>): Promise<Training[]> {
    return await TrainingModel.find(query || {}).exec();
  }

  async findById(id: string): Promise<Training | null> {
    return await TrainingModel.findById(id).exec();
  }

  async update(id: string, data: Partial<Training>): Promise<Training | null> {
    return await TrainingModel.findByIdAndUpdate(id, data, {
      new: true,
    }).exec();
  }

  async findAll(): Promise<Training[]> {
    return await TrainingModel.find().exec();
  }
}
