import { Document } from "mongoose";
import { Query, Repository } from "./RepositoryTypes";
import { Roles } from "./RolesTypes";

export interface User extends Document {
  name: string;
  lastname: string;
  email: string;
  password: string;
  age: number;
  whatsapp: string;
  roles?: Roles[];
  permissions?: string[];
  // Nuevos campos para capacitaciones:
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  // Campos para suscripciones:
  subscription?: {
    type: "monthly" | "annual";
    status: "active" | "inactive" | "cancelled" | "expired";
    expirationDate: Date;
    paymentId?: string;
  };
  couponUsed?: boolean;
  comparePassword(password: string): Promise<boolean>;
  createdAt: Date;
}

export interface IUserRepository extends Repository<User> {
  findOne(query: Query): Promise<User | null>;
}

export interface IUserService {
  createUser(user: User): Promise<User>;
  findUsers(query?: Query): Promise<User[]>;
  findUserById(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserByResetToken(token: string): Promise<User | null>;
  updateUser(id: string, user: Partial<User>): Promise<User | null>;
  deleteUser(id: string): Promise<boolean>;
  hasActiveSubscription(userId: string): Promise<boolean>;
}
