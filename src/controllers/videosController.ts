import { Request, Response } from "express";
import { VideosService } from "@services/videosService";
import { VideoRepository } from "@repositories/videosRepository";
import { Video } from "types/VideosTypes";

const videosService = new VideosService(new VideoRepository());

export const createVideo = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const videoData = req.body as Video;
    const newVideo = await videosService.createVideo(videoData);
    res.status(201).json(newVideo);
  } catch (error) {
    if (error instanceof Error) {
      // Aquí se retorna un error específico al cliente
      res.status(400).json({ message: error.message });
    } else {
      res.status(400).json({ message: "Ocurrió un error inesperado" });
    }
  }
};

export const findVideos = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Se pueden agregar filtros por query string si se desean
    const query = req.query;
    const videos = await videosService.findVideos(query);
    res.json(videos);
  } catch (error) {
    res.status(500).json(error);
  }
};

export const findVideoById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const video = await videosService.findVideoById(id);
    if (!video) {
      res.status(404).json({ message: "Video not found" });
      return;
    }
    res.json(video);
  } catch (error) {
    res.status(500).json(error);
  }
};

export const updateVideo = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updatedVideo = await videosService.updateVideo(id, data);
    if (!updatedVideo) {
      res.status(404).json({ message: "Video not found" });
      return;
    }
    res.json(updatedVideo);
  } catch (error) {
    res.status(500).json(error);
  }
};

export const updateVideoByCombo = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Se espera que el cliente envíe en el body la combinación que identifica el video (url, category, trainingType, level, muscleGroup)
    // y un campo newUrl con la nueva URL a asignar
    const { url, category, trainingType, level, muscleGroup, newUrl } =
      req.body;
    if (!url || !category || !newUrl) {
      res
        .status(400)
        .json({ message: "Falta información para actualizar el video." });
      return;
    }
    const query = { url, category, trainingType, level, muscleGroup };
    const updatedVideo = await videosService.updateVideoByCombo(query, newUrl);
    if (!updatedVideo) {
      res.status(404).json({ message: "Video no encontrado." });
      return;
    }
    res.json(updatedVideo);
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Ocurrió un error inesperado." });
    }
  }
};

export const deleteVideo = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await videosService.deleteVideo(id);
    if (!deleted) {
      res.status(404).json({ message: "Video not found" });
      return;
    }
    res.json({ message: "Video deleted" });
  } catch (error) {
    res.status(500).json(error);
  }
};

export const deleteVideoByUrl = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { url } = req.query; // Esperamos que la URL venga como query parameter
    if (typeof url !== "string") {
      res.status(400).json({ message: "URL is required and must be a string" });
      return;
    }
    const deleted = await videosService.deleteVideoByUrl(url);
    if (!deleted) {
      res.status(404).json({ message: "Video not found" });
      return;
    }
    res.json({ message: "Video deleted successfully" });
  } catch (error) {
    res.status(500).json(error);
  }
};
