import { VideoModel } from "@models/Videos";
import { IVideoRepository, Video } from "types/VideosTypes";
import { Query } from "types/RepositoryTypes";

export class VideoRepository implements IVideoRepository {
  async create(video: Video): Promise<Video> {
    const newVideo = new VideoModel(video);
    return await newVideo.save();
  }

  async find(query?: Query): Promise<Video[]> {
    return await VideoModel.find(query || {}).exec();
  }

  async findOne(query: Query): Promise<Video | null> {
    return await VideoModel.findOne(query).exec();
  }

  async findById(id: string): Promise<Video | null> {
    return await VideoModel.findById(id).exec();
  }

  async update(id: string, data: Partial<Video>): Promise<Video | null> {
    return await VideoModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async updateByCombo(query: Query, newUrl: string): Promise<Video | null> {
    return await VideoModel.findOneAndUpdate(
      query,
      { url: newUrl },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await VideoModel.findByIdAndDelete(id).exec();
    return deleted !== null;
  }

  async deleteByUrl(url: string): Promise<boolean> {
    const deleted = await VideoModel.findOneAndDelete({ url }).exec();
    return deleted !== null;
  }
}
