import { Router } from "express";
import {
  findUsers,
  findUserById,
  createUser,
  updateUser,
  deleteUser,
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
} from "@controllers/auth/authControllers";
import { getPermissions, verifyToken } from "@middlewares/auth";
import { checkRoles } from "@middlewares/roles";
import { checkSubscription } from "@middlewares/checkSubscription";
import {
  answerQuestion,
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
import {
  applyCoupon,
  cancelPayment,
  captureOrder,
  capturePreference,
  createOrder,
  createPreference,
} from "@controllers/paymentController";

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
  //#endregion

  //#region User Routes
  router.get("/users", verifyToken, getPermissions, findUsers);
  router.get("/users/:id", verifyToken, getPermissions, findUserById);
  router.post("/users", verifyToken, getPermissions, checkRoles, createUser);
  router.put("/users/:id", verifyToken, getPermissions, updateUser);
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
    "/questions/:id/answer",
    verifyToken,
    checkSubscription,
    getPermissions,
    answerQuestion
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

  router.post("/apply-coupon", verifyToken, applyCoupon);

  return router;
};
