import { Request, Response } from "express";
import { UserRepository } from "@repositories/userRepository";
import { UserService } from "@services/userService";
import { IUserRepository, IUserService } from "types/UserTypes";
import { deleteImageFile } from "@middlewares/upload";

const userRepository: IUserRepository = new UserRepository();
const userService: IUserService = new UserService(userRepository);

// ─── GET /api/v1/profile ───────────────────────────────────

export const getProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = (req as any).currentUser;
    if (!user) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        lastname: user.lastname,
        email: user.email,
        whatsapp: user.whatsapp,
        age: user.age,
        avatar: user.avatar || "",
        bio: user.bio || "",
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ Error obteniendo perfil:", error);
    res.status(500).json({ message: "Error obteniendo perfil" });
  }
};

// ─── PUT /api/v1/profile ───────────────────────────────────

export const updateProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = (req as any).currentUser;
    if (!user) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const { name, lastname, whatsapp, age, bio } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (lastname !== undefined) updateData.lastname = lastname;
    if (whatsapp !== undefined) updateData.whatsapp = whatsapp;
    if (age !== undefined) updateData.age = parseInt(age);
    if (bio !== undefined) updateData.bio = bio.substring(0, 300);

    const updated = await userService.updateUser(
      (user._id as any).toString(),
      updateData
    );

    if (!updated) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: updated._id,
        name: updated.name,
        lastname: updated.lastname,
        email: updated.email,
        whatsapp: updated.whatsapp,
        age: updated.age,
        avatar: updated.avatar || "",
        bio: updated.bio || "",
      },
      message: "Perfil actualizado exitosamente",
    });
  } catch (error: any) {
    console.error("❌ Error actualizando perfil:", error);
    if (error.code === 11000) {
      res.status(400).json({ message: "Ese nombre de usuario ya está en uso" });
      return;
    }
    res.status(500).json({ message: "Error actualizando perfil" });
  }
};

// ─── PUT /api/v1/profile/password ──────────────────────────

export const changePassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = (req as any).currentUser;
    if (!user) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        message: "La contraseña actual y la nueva son requeridas",
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        message: "La nueva contraseña debe tener al menos 6 caracteres",
      });
      return;
    }

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      res.status(400).json({ message: "La contraseña actual es incorrecta" });
      return;
    }

    // Update password (pre-save hook will hash it)
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Contraseña actualizada exitosamente",
    });
  } catch (error) {
    console.error("❌ Error cambiando contraseña:", error);
    res.status(500).json({ message: "Error cambiando contraseña" });
  }
};

// ─── POST /api/v1/profile/avatar ───────────────────────────

export const uploadProfileAvatar = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = (req as any).currentUser;
    if (!user) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: "No se proporcionó imagen" });
      return;
    }

    // Delete old avatar if exists
    if (user.avatar) {
      await deleteImageFile(user.avatar);
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    const updated = await userService.updateUser(
      (user._id as any).toString(),
      { avatar: avatarPath } as any
    );

    if (!updated) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    res.status(200).json({
      success: true,
      data: { avatar: avatarPath },
      message: "Avatar actualizado exitosamente",
    });
  } catch (error) {
    console.error("❌ Error subiendo avatar:", error);
    res.status(500).json({ message: "Error subiendo avatar" });
  }
};
