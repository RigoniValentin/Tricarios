import { UserRepository } from "@repositories/userRepository";
import { UserService } from "@services/userService";
import { Request, Response } from "express";
import { IUserRepository, IUserService, User } from "types/UserTypes";
import jwt from "jsonwebtoken";

const userRepository: IUserRepository = new UserRepository();
const userService: IUserService = new UserService(userRepository);

export const registerUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email }: User = req.body;
    const userExists = await userService.findUserByEmail(req.body.email);
    if (userExists) {
      res.status(400).json({ message: "User already exists" });
      return;
    }

    const newUser = await userService.createUser({
      ...req.body,
      role: "guest",
    });

    res.status(201).json(newUser);
  } catch (error) {
    console.log("error :>> ", error);
    res.status(500).json(error);
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  const jwtSecret = process.env.JWT_SECRET as string;
  try {
    const { email, password }: User = req.body;
    const user = await userService.findUserByEmail(email);
    if (!user) {
      res.status(404).json({ message: "Invalid user or password..." });
      return;
    }
    const comparePass = await user.comparePassword(password);
    if (!comparePass) {
      res.status(400).json({ message: "Invalid user or password..." });
      return;
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        username: user.username,
        roles: user.roles,
        nationality: user.nationality,
        locality: user.locality,
        age: user.age,
      },
      jwtSecret,
      { expiresIn: "2h" }
    );

    //const decodedPayload = jwt.decode(token);
    //console.log("Payload decodificado:", decodedPayload);
    console.log("MercadoPago Access Token:", process.env.MP_ACCESS_TOKEN);
    res.json(token);
  } catch (error) {
    console.log("error :>> ", error);
    res.status(500).json(error);
  }
};

export const refreshToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const updatedUser = await userService.findUserById(
      req.currentUser._id as string
    );
    if (!updatedUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    const jwtSecret = process.env.JWT_SECRET as string;
    const newToken = jwt.sign(
      {
        id: updatedUser._id,
        email: updatedUser.email,
        username: updatedUser.username,
        roles: updatedUser.roles,
        nationality: updatedUser.nationality,
        locality: updatedUser.locality,
        age: updatedUser.age,
      },
      jwtSecret,
      { expiresIn: "2h" }
    );
    console.log("New token:", newToken);

    res.json({ token: newToken });
  } catch (error: any) {
    res.status(500).json({ message: error.message || error });
  }
};
