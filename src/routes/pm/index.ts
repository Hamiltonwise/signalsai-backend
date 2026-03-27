import express from "express";
import projectsRoutes from "./projects";
import tasksRoutes from "./tasks";
import aiSynthRoutes from "./aiSynth";
import briefRoutes from "./brief";
import activityRoutes from "./activity";
import statsRoutes from "./stats";
import usersRoutes from "./users";

const router = express.Router();

router.use("/projects", projectsRoutes);
router.use("/", tasksRoutes);
router.use("/ai-synth", aiSynthRoutes);
router.use("/daily-brief", briefRoutes);
router.use("/activity", activityRoutes);
router.use("/stats", statsRoutes);
router.use("/users", usersRoutes);

export default router;
