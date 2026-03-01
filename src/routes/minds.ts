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
import * as portalController from "../controllers/minds/MindsPortalController";
import * as workRunsController from "../controllers/minds/MindsWorkRunsController";
import * as parentingController from "../controllers/minds/MindsParentingController";
import * as credentialsController from "../controllers/minds/MindsPlatformCredentialsController";
import * as publishChannelsController from "../controllers/minds/MindsPublishChannelsController";
import * as skillUpgradeController from "../controllers/minds/MindsSkillUpgradeController";

const mindsRoutes = express.Router();

// All minds routes require super admin
mindsRoutes.use(authenticateToken, superAdminMiddleware);

// Publish Channels (global, not per-mind — must be before /:mindId routes)
mindsRoutes.get("/publish-channels", publishChannelsController.listChannels);
mindsRoutes.post("/publish-channels", publishChannelsController.createChannel);
mindsRoutes.put("/publish-channels/:channelId", publishChannelsController.updateChannel);
mindsRoutes.delete("/publish-channels/:channelId", publishChannelsController.deleteChannel);

// Minds CRUD
mindsRoutes.get("/", mindsController.listMinds);
mindsRoutes.post("/", mindsController.createMind);
mindsRoutes.get("/:mindId", mindsController.getMind);
mindsRoutes.delete("/:mindId", mindsController.deleteMind);
mindsRoutes.put("/:mindId", mindsController.updateMind);
mindsRoutes.put("/:mindId/brain", mindsController.updateBrain);
mindsRoutes.get("/:mindId/versions", mindsController.listVersions);
mindsRoutes.post("/:mindId/versions/:versionId/publish", mindsController.publishVersion);

// Chat & Conversations
mindsRoutes.post("/:mindId/chat", chatController.chat);
mindsRoutes.post("/:mindId/chat/stream", chatController.chatStream);
mindsRoutes.get("/:mindId/conversations", chatController.listConversations);
mindsRoutes.get("/:mindId/conversations/:conversationId", chatController.getConversation);
mindsRoutes.patch("/:mindId/conversations/:conversationId", chatController.renameConversation);
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
mindsRoutes.post("/:mindId/skill-builder/chat", skillsController.skillBuilderChat);
mindsRoutes.post("/:mindId/skill-builder/chat/stream", skillsController.skillBuilderChatStream);
mindsRoutes.post("/:mindId/skills/regenerate-stale", skillsController.regenerateStaleNeurons);
mindsRoutes.post("/:mindId/skills", skillsController.createSkill);
mindsRoutes.get("/:mindId/skills/:skillId", skillsController.getSkill);
mindsRoutes.put("/:mindId/skills/:skillId", skillsController.updateSkill);
mindsRoutes.delete("/:mindId/skills/:skillId", skillsController.deleteSkill);
mindsRoutes.post("/:mindId/skills/:skillId/generate", skillsController.generateNeuron);
mindsRoutes.get("/:mindId/skills/:skillId/neuron", skillsController.getSkillNeuron);
mindsRoutes.get("/:mindId/skills/:skillId/analytics", skillsController.getSkillAnalytics);
mindsRoutes.post("/:mindId/skills/:skillId/run", workRunsController.triggerManualRun);
mindsRoutes.get("/:mindId/skills/:skillId/work-runs", workRunsController.listWorkRuns);
mindsRoutes.get("/:mindId/skills/:skillId/work-runs/:workRunId", workRunsController.getWorkRun);
mindsRoutes.post("/:mindId/skills/:skillId/work-runs/:workRunId/approve", workRunsController.approveWorkRun);
mindsRoutes.post("/:mindId/skills/:skillId/work-runs/:workRunId/reject", workRunsController.rejectWorkRun);
mindsRoutes.delete("/:mindId/skills/:skillId/work-runs/:workRunId", workRunsController.deleteWorkRun);

// Skill Upgrade Sessions
mindsRoutes.post("/:mindId/skills/:skillId/upgrade/sessions", skillUpgradeController.createSession);
mindsRoutes.get("/:mindId/skills/:skillId/upgrade/sessions", skillUpgradeController.listSessions);
mindsRoutes.get("/:mindId/skills/:skillId/upgrade/sessions/:sessionId", skillUpgradeController.getSession);
mindsRoutes.post("/:mindId/skills/:skillId/upgrade/sessions/:sessionId/chat/stream", skillUpgradeController.chatStream);
mindsRoutes.post("/:mindId/skills/:skillId/upgrade/sessions/:sessionId/trigger-reading/stream", skillUpgradeController.triggerReadingStream);
mindsRoutes.get("/:mindId/skills/:skillId/upgrade/sessions/:sessionId/proposals", skillUpgradeController.getProposals);
mindsRoutes.patch("/:mindId/skills/:skillId/upgrade/sessions/:sessionId/proposals/:proposalId", skillUpgradeController.updateProposal);
mindsRoutes.post("/:mindId/skills/:skillId/upgrade/sessions/:sessionId/compile", skillUpgradeController.startCompile);
mindsRoutes.get("/:mindId/skills/:skillId/upgrade/sessions/:sessionId/compile-status", skillUpgradeController.getCompileStatus);
mindsRoutes.delete("/:mindId/skills/:skillId/upgrade/sessions/:sessionId", skillUpgradeController.deleteSession);
mindsRoutes.post("/:mindId/skills/:skillId/upgrade/sessions/:sessionId/abandon", skillUpgradeController.abandonSession);
mindsRoutes.patch("/:mindId/skills/:skillId/upgrade/sessions/:sessionId", skillUpgradeController.updateSession);

// Portal key management (admin)
mindsRoutes.post("/:mindId/portal-key", portalController.generateMindPortalKey);
mindsRoutes.post("/:mindId/skills/:skillId/portal-key", portalController.generateSkillPortalKey);

// Test portals (admin — skips portal key, uses JWT auth)
mindsRoutes.post("/:mindId/test-portal", portalController.testMindPortal);
mindsRoutes.post("/:mindId/skills/:skillId/test-portal", portalController.testSkillPortal);

// Parenting
mindsRoutes.post("/:mindId/parenting/sessions", parentingController.createSession);
mindsRoutes.get("/:mindId/parenting/sessions", parentingController.listSessions);
mindsRoutes.get("/:mindId/parenting/sessions/:sessionId", parentingController.getSession);
mindsRoutes.post("/:mindId/parenting/sessions/:sessionId/chat/stream", parentingController.chatStream);
mindsRoutes.post("/:mindId/parenting/sessions/:sessionId/trigger-reading/stream", parentingController.triggerReadingStream);
mindsRoutes.get("/:mindId/parenting/sessions/:sessionId/proposals", parentingController.getProposals);
mindsRoutes.patch("/:mindId/parenting/sessions/:sessionId/proposals/:proposalId", parentingController.updateProposal);
mindsRoutes.post("/:mindId/parenting/sessions/:sessionId/compile", parentingController.startCompile);
mindsRoutes.get("/:mindId/parenting/sessions/:sessionId/compile-status", parentingController.getCompileStatus);
mindsRoutes.delete("/:mindId/parenting/sessions/:sessionId", parentingController.deleteSession);
mindsRoutes.post("/:mindId/parenting/sessions/:sessionId/abandon", parentingController.abandonSession);
mindsRoutes.patch("/:mindId/parenting/sessions/:sessionId", parentingController.updateSession);

// Platform Credentials
mindsRoutes.get("/:mindId/credentials", credentialsController.listCredentials);
mindsRoutes.post("/:mindId/credentials", credentialsController.createCredential);
mindsRoutes.put("/:mindId/credentials/:credentialId", credentialsController.updateCredential);
mindsRoutes.delete("/:mindId/credentials/:credentialId", credentialsController.deleteCredential);
mindsRoutes.post("/:mindId/credentials/:credentialId/revoke", credentialsController.revokeCredential);

// Status
mindsRoutes.get("/:mindId/status", syncController.getMindStatus);

export default mindsRoutes;
