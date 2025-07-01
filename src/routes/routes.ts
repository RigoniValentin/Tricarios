import { Router } from "express";
import {
  findUsers,
  findUserById,
  createUser,
  updateUser,
  deleteUser,
  getUsersSubscriptionInfo,
  updateUserCapacitations,
  updateUserCapacitationsByEmail,
} from "@controllers/userController";
import {
  findRoles,
  findRolesById,
  createRoles,
  updateRoles,
  deleteRoles,
} from "@controllers/rolesController";
import {
  loginUser,
  refreshToken,
  registerUser,
  forgotPassword,
  resetPassword,
} from "@controllers/auth/authControllers";
import { getPermissions, verifyToken } from "@middlewares/auth";
import { checkRoles } from "@middlewares/roles";
import { checkSubscription } from "@middlewares/checkSubscription";
import {
  answerQuestionVideo1,
  answerQuestionVideo2,
  createQuestion,
  findQuestions,
  rejectQuestion,
} from "@controllers/questionController";
import {
  createVideo,
  deleteVideo,
  deleteVideoByUrl,
  findVideoById,
  findVideos,
  updateVideo,
  updateVideoByCombo,
} from "@controllers/videosController";
import {
  createTraining,
  updateCupos,
  getCupos,
  getTrainings,
} from "@controllers/trainingController";
// Importar rutas de la tienda
import categoryRoutes from "./categoryRoutes";
import productRoutes from "./productRoutes";
import {
  applyCoupon,
  cancelPayment,
  captureOrder,
  capturePreference,
  createOrder,
  createPreference,
} from "@controllers/paymentController";
import { sendResetPasswordEmail } from "@services/emailService";
import { getExamples, saveExamples } from "@controllers/exampleController";
import { getChatHistory, deleteChatHistory } from "@controllers/chatController";
import { get } from "mongoose";

const router = Router();

export default () => {
  router.get("/health", (req, res) => {
    res.send("Api is healthy");
  });

  //#region Auth Routes
  router.post("/auth/register", checkRoles, registerUser);
  router.post("/auth/login", loginUser);
  router.get(
    "/auth/refresh",
    verifyToken,
    (req, res, next) => {
      res.set("Cache-Control", "no-store");
      next();
    },
    refreshToken
  );
  router.post("/auth/forgot-password", forgotPassword);
  router.post("/auth/reset-password", resetPassword);
  //#endregion

  //#region User Routes
  router.get("/users", verifyToken, getPermissions, findUsers);
  router.get(
    "/users/subscription-info",
    verifyToken,
    getPermissions,
    getUsersSubscriptionInfo
  );
  router.get("/users/:id", verifyToken, getPermissions, findUserById);
  router.post("/users", verifyToken, getPermissions, checkRoles, createUser);
  router.put("/users/:id", verifyToken, getPermissions, updateUser);
  router.put(
    "/users/:id/capacitations",
    verifyToken,
    getPermissions,
    updateUserCapacitations
  );
  router.put(
    "/users/email/:email/capacitations",
    verifyToken,
    getPermissions,
    updateUserCapacitationsByEmail
  );
  router.delete("/users/:id", verifyToken, getPermissions, deleteUser);
  //#endregion

  //#region Roles Routes
  router.get("/roles", verifyToken, getPermissions, findRoles);
  router.get("/roles/:id", verifyToken, getPermissions, findRolesById);
  router.post("/roles", verifyToken, getPermissions, createRoles);
  router.put("/roles/:id", verifyToken, getPermissions, updateRoles);
  router.delete("/roles/:id", verifyToken, getPermissions, deleteRoles);
  //#endregion

  //#region Question Routes
  router.post(
    "/questions",
    verifyToken,
    checkSubscription,
    getPermissions,
    createQuestion
  );
  router.get(
    "/questions",
    verifyToken,
    checkSubscription,
    getPermissions,
    findQuestions
  );
  router.put(
    "/questions/:id/answer/1",
    verifyToken,
    checkSubscription,
    getPermissions,
    answerQuestionVideo1
  );
  router.put(
    "/questions/:id/answer/2",
    verifyToken,
    checkSubscription,
    getPermissions,
    answerQuestionVideo2
  );
  router.put("/questions/:id/reject", verifyToken, rejectQuestion);
  //#endregion

  //#region Videos Routes
  router.post(
    "/videos",
    verifyToken,
    checkSubscription,
    getPermissions,
    checkRoles,
    createVideo
  );
  router.get("/videos", findVideos);
  router.get("/videos/:id", findVideoById);
  router.put(
    "/videos/:id",
    verifyToken,
    getPermissions,
    checkRoles,
    updateVideo
  );
  router.put(
    "/videos-by-combo",
    verifyToken,
    getPermissions,
    checkRoles,
    updateVideoByCombo
  );
  router.delete(
    "/videos/:id",
    verifyToken,
    getPermissions,
    checkRoles,
    deleteVideo
  );
  router.delete(
    "/videos",
    verifyToken,
    getPermissions,
    checkRoles,
    deleteVideoByUrl
  );
  //#endregion

  // #region Trainings Routes
  router.post("/trainings", verifyToken, getPermissions, createTraining);
  router.put("/trainings/:id", verifyToken, getPermissions, updateCupos);
  router.get("/trainings/:id", verifyToken, getCupos);
  router.get("/trainings", getTrainings);
  // #endregion

  // #region Payments Routes
  router.get("/create-order", verifyToken, createOrder);
  router.get("/capture-order", captureOrder);
  router.get("/cancel-order", cancelPayment);

  router.post("/create-preference", verifyToken, createPreference);
  router.get("/capture-preference", capturePreference);
  // #endregion

  // #region Email Routes
  // Route para enviar email a través del helper
  router.post("/send-email", async (req, res) => {
    const { to, subject, text } = req.body;
    try {
      await sendResetPasswordEmail(to, text);
      res.status(200).send(`Email sent to: ${to}`);
    } catch (error) {
      res.status(500).send("Error sending email");
    }
  });
  // #endregion

  // #region Coupons Routes
  router.post("/apply-coupon", verifyToken, applyCoupon);
  // #endregion

  // #region Example Routes
  router.get("/examples", getExamples);
  router.put("/examples", saveExamples);
  // #endregion

  // #region Chat Routes
  // Obtener historial (para todos los usuarios)
  router.get("/history", verifyToken, getChatHistory);

  // Eliminar historial (acceso restringido, por ejemplo admin)
  router.delete("/history", verifyToken, getPermissions, deleteChatHistory);
  // #endregion

  // #region Store Routes
  // Rutas de categorías de la tienda
  router.use("/categories", categoryRoutes);

  // Rutas de productos de la tienda
  router.use("/products", productRoutes);
  // #endregion

  return router;
};
