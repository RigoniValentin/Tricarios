import { RolesRepository } from "@repositories/rolesRepository";
import { RolesService } from "@services/rolesService";
import { NextFunction, Request, Response } from "express";
import { IRolesRepository, IRolesService } from "types/RolesTypes";

const rolesRepository: IRolesRepository = new RolesRepository();
const rolesService: IRolesService = new RolesService(rolesRepository);

export const checkRoles = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const roles: string[] = req.body && req.body?.roles ? req.body.roles : [];
  const role = Array.isArray(roles) && roles.length != 0 ? roles : ["user"];
  console.log("req.body", role);

  try {
    const findRoles = await rolesService.findRoles({ name: { $in: role } });

    if (findRoles.length === 0) {
      res.status(404).json({ message: "Role not found" });
      return; // Retorna sin devolver un Response
    }

    req.body.roles = findRoles.map((x) => x._id);

    console.log("req.body.roles :>>", req.body.roles);

    next();
  } catch (error) {
    console.log("error :>>", error);
    res.status(500).json(error);
    return;
  }
};
