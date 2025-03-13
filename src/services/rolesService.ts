import { Query } from "types/RepositoryTypes";
import { IRolesRepository, IRolesService, Roles } from "types/RolesTypes";

export class RolesService implements IRolesService {
  private rolesRepository: IRolesRepository;

  constructor(rolesRepository: IRolesRepository) {
    this.rolesRepository = rolesRepository;
  }

  async createRoles(roles: Roles): Promise<Roles> {
    return this.rolesRepository.create(roles);
  }

  async findRoles(query?: Query): Promise<Roles[]> {
    return this.rolesRepository.find(query);
  }

  async findRolesById(id: string): Promise<Roles | null> {
    return this.rolesRepository.findById(id);
  }

  async updateRoles(id: string, roles: Partial<Roles>): Promise<Roles | null> {
    return this.rolesRepository.update(id, roles);
  }

  async deleteRoles(id: string): Promise<boolean> {
    return this.rolesRepository.delete(id);
  }
}
