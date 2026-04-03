import express from "express";
import {
  handleCreateTask,
  handleFetchTasks,
  handleArchiveTask,
  handleUpdateTask,
  handleGetTaskComments,
  handleAddTaskComment,
  handleDiagBoards,
} from "../controllers/monday/MondayController";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";

const mondayRoutes = express.Router();

mondayRoutes.use(authenticateToken, superAdminMiddleware);

// Task CRUD
mondayRoutes.post("/createTask", handleCreateTask);
mondayRoutes.post("/fetchTasks", handleFetchTasks);
mondayRoutes.post("/archiveTask", handleArchiveTask);
mondayRoutes.post("/updateTask", handleUpdateTask);

// Task comments
mondayRoutes.post("/getTaskComments", handleGetTaskComments);
mondayRoutes.post("/addTaskComment", handleAddTaskComment);

// Diagnostics
mondayRoutes.get("/diag/boards", handleDiagBoards);

export default mondayRoutes;
