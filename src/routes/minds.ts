import express from "express";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";
import * as mindsController from "../controllers/minds/MindsController";
import * as chatController from "../controllers/minds/MindsChatController";
import * as sourcesController from "../controllers/minds/MindsSourcesController";
import * as discoveryController from "../controllers/minds/MindsDiscoveryController";
import * as syncController from "../controllers/minds/MindsSyncController";
import * as proposalsController from "../controllers/minds/MindsProposalsController";
import * as skillsController from "../controllers/minds/MindsSkillsController";

const mindsRoutes = express.Router();

// All minds routes require super admin
mindsRoutes.use(authenticateToken, superAdminMiddleware);

// Minds CRUD
mindsRoutes.get("/", mindsController.listMinds);
mindsRoutes.post("/", mindsController.createMind);
mindsRoutes.get("/:mindId", mindsController.getMind);
mindsRoutes.put("/:mindId", mindsController.updateMind);
mindsRoutes.put("/:mindId/brain", mindsController.updateBrain);
mindsRoutes.get("/:mindId/versions", mindsController.listVersions);
mindsRoutes.post("/:mindId/versions/:versionId/publish", mindsController.publishVersion);

// Chat & Conversations
mindsRoutes.post("/:mindId/chat", chatController.chat);
mindsRoutes.post("/:mindId/chat/stream", chatController.chatStream);
mindsRoutes.get("/:mindId/conversations", chatController.listConversations);
mindsRoutes.get("/:mindId/conversations/:conversationId", chatController.getConversation);
mindsRoutes.delete("/:mindId/conversations/:conversationId", chatController.deleteConversation);

// Sources
mindsRoutes.get("/:mindId/sources", sourcesController.listSources);
mindsRoutes.post("/:mindId/sources", sourcesController.createSource);
mindsRoutes.delete("/:mindId/sources/:sourceId", sourcesController.deleteSource);
mindsRoutes.patch("/:mindId/sources/:sourceId", sourcesController.toggleSource);

// Discovery
mindsRoutes.get("/:mindId/discovery-batch", discoveryController.getDiscoveryBatch);
mindsRoutes.patch("/:mindId/discovered-posts/:postId", discoveryController.updatePostStatus);
mindsRoutes.post("/:mindId/discovery/run", discoveryController.triggerDiscovery);
mindsRoutes.delete("/:mindId/discovery-batch/:batchId", discoveryController.deleteBatch);

// Sync runs
mindsRoutes.post("/:mindId/sync-runs/scrape-compare", syncController.startScrapeCompare);
mindsRoutes.post("/:mindId/sync-runs/compile", syncController.startCompile);
mindsRoutes.get("/:mindId/sync-runs", syncController.listSyncRuns);
mindsRoutes.get("/:mindId/batches/:batchId/sync-runs", syncController.listSyncRunsByBatch);
mindsRoutes.get("/:mindId/sync-runs/:runId", syncController.getSyncRun);
mindsRoutes.get("/:mindId/sync-runs/:runId/proposals", syncController.getRunProposals);

// Proposals
mindsRoutes.patch("/:mindId/proposals/:proposalId", proposalsController.updateProposal);

// Skills
mindsRoutes.get("/:mindId/skills", skillsController.listSkills);
mindsRoutes.post("/:mindId/skills/suggest", skillsController.suggestSkill);
mindsRoutes.post("/:mindId/skills", skillsController.createSkill);
mindsRoutes.get("/:mindId/skills/:skillId", skillsController.getSkill);
mindsRoutes.put("/:mindId/skills/:skillId", skillsController.updateSkill);
mindsRoutes.delete("/:mindId/skills/:skillId", skillsController.deleteSkill);
mindsRoutes.post("/:mindId/skills/:skillId/generate", skillsController.generateNeuron);
mindsRoutes.get("/:mindId/skills/:skillId/neuron", skillsController.getSkillNeuron);
mindsRoutes.get("/:mindId/skills/:skillId/analytics", skillsController.getSkillAnalytics);

// Status
mindsRoutes.get("/:mindId/status", syncController.getMindStatus);

export default mindsRoutes;
