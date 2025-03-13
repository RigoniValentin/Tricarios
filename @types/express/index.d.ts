import { User } from "../../src/types/UserTypes";

declare global {
  namespace Express {
    interface Request {
      currentUser: User;
    }
  }
}
