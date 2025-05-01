// filepath: c:\valen\CLIENTES\SARAH\PilatesApp\backend\src\controllers\chatController.ts
import { Request, Response } from "express";
import { ChatMessage, IChatMessage } from "../models/ChatMessage";

export const getChatHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const messages: IChatMessage[] = await ChatMessage.find()
      .sort({ createdAt: 1 })
      .exec();
    console.log("Historial enviado:", messages); // Log de los mensajes a enviar
    // Deshabilitar caché para forzar siempre una respuesta completa
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.json(messages);
  } catch (error) {
    console.error("Error al obtener el historial:", error);
    res.status(500).json({ message: "Error al obtener el historial", error });
  }
};

export const deleteChatHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    await ChatMessage.deleteMany({});
    console.log("Historial eliminado exitosamente"); // Log de eliminación
    res.json({ message: "Historial eliminado exitosamente" });
  } catch (error) {
    console.error("Error al eliminar el historial:", error);
    res.status(500).json({ message: "Error al eliminar el historial", error });
  }
};
