import { UserRepository } from "@repositories/userRepository";
import { UserService } from "@services/userService";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { IUserRepository, IUserService, User } from "types/UserTypes";
import { permissions, Method } from "types/PermissionsType";

const userRepository: IUserRepository = new UserRepository();
const userService: IUserService = new UserService(userRepository);

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const jwtSecret = process.env.JWT_SECRET as string;
  const token =
    req.headers.authorization?.replace("Bearer ", "") ||
    (req.query.authToken as string); // Leer el token de la URL

  if (!token) {
    res.status(401).json({ message: "JWT must be provided" });
    return;
  }

  try {
    const verify = jwt.verify(token, jwtSecret) as User;

    const getUser = await userService.findUserById(verify.id);
    if (!getUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    req.currentUser = getUser;
    next();
  } catch (error: any) {
    console.log("error :>> ", error);
    res.status(401).send(error.message);
  }
};

export const getPermissions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // - Obtener lo roles, (desde currentUser) y el Metodo HTTP de la petición
  const { currentUser, method, path } = req;
  const { roles } = currentUser;
  console.log("currentUser :>> ", currentUser);

  // - Obtener el path/modulos (usuarios - roles - posts)
  const currentModule = path.split("/")[1];
  console.log("currentModule :>> ", currentModule);

  // - Conseguir en los permisos el metodo que coincida para obtener el objeto que contiene el scope
  const findMethod = permissions.find(
    (p) => p.method === Method[method as keyof typeof Method]
  );

  // - Armar el permiso correspondiente al scope en le momento de la petición
  if (
    !findMethod?.permissions.includes(`${currentModule}_${findMethod.scope}`)
  ) {
    findMethod?.permissions.push(`${currentModule}_${findMethod.scope}`);
  }
  console.log("findMethod :>> ", findMethod);

  // - obtener todos los permisos de los roles del usuario
  const mergedRolesPermissions = [
    ...new Set(roles?.flatMap((role) => role.permissions)),
  ];
  console.log("mergedRolesPermissions :>> ", mergedRolesPermissions);

  //- Verificar si el usuario Tiene Permisos
  //- Tienen mayor prioridad q los permisos de los roles

  let userPermissions: string[] = [];

  if (currentUser.permissions?.length == 0) {
    userPermissions = currentUser.permissions!;
  } else {
    userPermissions = mergedRolesPermissions;
  }

  // - Comparar los permisos armados en el scope con los permisos del ususario
  const permissionGranted = findMethod?.permissions.find((x) =>
    mergedRolesPermissions.includes(x)
  );
  console.log("permissionGranted :>> ", permissionGranted);

  // - si no hay match, regresamos un error unauthorized
  if (!permissionGranted) {
    res.status(401).send("Unauthorized");
    return;
  }
  // - si todo bien next()
  next();
};
