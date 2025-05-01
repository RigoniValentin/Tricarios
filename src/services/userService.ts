import { Query } from "types/RepositoryTypes";
import { IUserRepository, IUserService, User } from "types/UserTypes";
import { UserModel } from "../models/Users";

export class UserService implements IUserService {
  private userRepository: IUserRepository;

  constructor(userRepository: IUserRepository) {
    this.userRepository = userRepository;
  }

  async createUser(user: User): Promise<User> {
    return this.userRepository.create(user);
  }

  async findUsers(query?: Query): Promise<User[]> {
    return this.userRepository.find(query);
  }

  async findUserById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ email });
  }

  async findUserByResetToken(token: string): Promise<User | null> {
    return this.userRepository.findOne({ resetPasswordToken: token });
  }

  async updateUser(id: string, user: Partial<User>): Promise<User | null> {
    return this.userRepository.update(id, user);
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.userRepository.delete(id);
  }

  public async hasActiveSubscription(userId: string): Promise<boolean> {
    const user = await this.findUserById(userId);
    if (!user || !user.subscription || !user.subscription.expirationDate) {
      return false;
    }
    // Comprueba si la fecha de expiración es mayor a la fecha actual
    return new Date(user.subscription.expirationDate) > new Date();
  }

  // Nuevo método para actualizar las capacitaciones por email
  async updateUserCapacitationsByEmail(
    email: string,
    capacitations: { capSeresArte: boolean; capThr: boolean; capPhr: boolean }
  ): Promise<User | null> {
    const user = await this.findUserByEmail(email);
    if (!user) {
      return null;
    }
    return this.userRepository.update(user.id, capacitations);
  }
}
