import express from "express";
import projectsRoutes from "./projects";
import tasksRoutes from "./tasks";
import aiSynthRoutes from "./aiSynth";
import activityRoutes from "./activity";
import statsRoutes from "./stats";
import usersRoutes from "./users";
import myTasksRoutes from "./myTasks";
import notificationsRoutes from "./notifications";

const router = express.Router();

router.use("/projects", projectsRoutes);
router.use("/", tasksRoutes);
router.use("/tasks", myTasksRoutes);
router.use("/ai-synth", aiSynthRoutes);
router.use("/activity", activityRoutes);
router.use("/stats", statsRoutes);
router.use("/users", usersRoutes);
router.use("/notifications", notificationsRoutes);

export default router;
