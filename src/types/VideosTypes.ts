import { Document } from "mongoose";
import { Query } from "./RepositoryTypes"; // Asegúrate de tener definida la interface Query

export interface Video extends Document {
  url: string;
  category: string;
  trainingType: string;
  level: string;
  muscleGroup: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IVideosService {
  createVideo(video: Video): Promise<Video>;
  findVideos(query?: Query): Promise<Video[]>;
  findVideoById(id: string): Promise<Video | null>;
  updateVideo(id: string, data: Partial<Video>): Promise<Video | null>;
  updateVideoByCombo(query: Query, newUrl: string): Promise<Video | null>; // <-- Nuevo método
  deleteVideo(id: string): Promise<boolean>;
  deleteVideoByUrl(url: string): Promise<boolean>;
}

export interface IVideoRepository {
  create(video: Video): Promise<Video>;
  find(query?: Query): Promise<Video[]>;
  findOne(query: Query): Promise<Video | null>; // <-- Agregado
  findById(id: string): Promise<Video | null>;
  update(id: string, data: Partial<Video>): Promise<Video | null>;
  updateByCombo(query: Query, newUrl: string): Promise<Video | null>;
  delete(id: string): Promise<boolean>;
  deleteByUrl(url: string): Promise<boolean>;
}
