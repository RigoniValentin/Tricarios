import cron from "node-cron";
import { UserService } from "@services/userService";
import { UserRepository } from "@repositories/userRepository";
import { RolesService } from "@services/rolesService";
import { RolesRepository } from "@repositories/rolesRepository"; // Importar RolesRepository

// Instanciar servicios
const userRepository = new UserRepository();
const userService = new UserService(userRepository);
const rolesRepository = new RolesRepository(); // Instanciar RolesRepository
const rolesService = new RolesService(rolesRepository); // Pasarlo al constructor

cron.schedule("0 0 * * *", async () => {
  try {
    const users = await userService.findUsers();
    const now = new Date();

    for (const user of users) {
      // Omitir usuarios con el rol "admin"
      if (
        !user.roles?.some((role) => role.name === "admin") &&
        user.subscription &&
        user.subscription.expirationDate < now
      ) {
        user.roles = user.roles || [];
        // Remover el rol "user" si existe
        user.roles = user.roles.filter((role) => role.name !== "user");

        // Obtener el rol "guest" desde la BD
        const guestRoles = await rolesService.findRoles({ name: "guest" });
        if (!guestRoles || guestRoles.length === 0) {
          console.error("Rol 'guest' no encontrado");
          continue;
        }
        user.roles.push(guestRoles[0]);
        await user.save();
      }
    }

    console.log(
      "Cron job executed: User roles updated based on subscription expiration"
    );
  } catch (error) {
    console.error("Error executing cron job:", error);
  }
});
