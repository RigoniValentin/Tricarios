import { UserRepository } from "@repositories/userRepository";
import { UserService } from "@services/userService";
import { Request, Response, NextFunction } from "express";

// Crear una instancia de UserService
const userRepository = new UserRepository();
const userService = new UserService(userRepository);

export const checkSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = await userService.findUserById(req.currentUser.id);

  if (user) {
    // Si el usuario tiene el rol "admin", permitir el acceso sin verificar la suscripción
    if (user.roles && user.roles.some((role) => role.name === "admin")) {
      return next();
    }

    // Verificar la suscripción si el usuario no es "admin"
    if (user.subscription && user.subscription.expirationDate < new Date()) {
      if (user.roles && user.roles.length > 0) {
        // Actualiza el nombre del primer rol a "guest"
        user.roles[0].name = "guest";
      }
      await user.save();
    }
  }

  next();
};
