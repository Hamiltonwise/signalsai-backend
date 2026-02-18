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

const mondayRoutes = express.Router();

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
