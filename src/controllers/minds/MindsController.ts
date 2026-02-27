import { Request, Response } from "express";
import * as mindsCrud from "./feature-services/service.minds-crud";

export async function listMinds(_req: Request, res: Response): Promise<any> {
  try {
    const minds = await mindsCrud.listMinds();
    return res.json({ success: true, data: minds });
  } catch (error: any) {
    console.error("[MINDS] Error listing minds:", error);
    return res.status(500).json({ error: "Failed to list minds" });
  }
}

export async function getMind(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const mind = await mindsCrud.getMind(mindId);
    return res.json({ success: true, data: mind });
  } catch (error: any) {
    console.error("[MINDS] Error getting mind:", error);
    if (error.message === "Mind not found") {
      return res.status(404).json({ error: "Mind not found" });
    }
    return res.status(500).json({ error: "Failed to get mind" });
  }
}

export async function createMind(req: Request, res: Response): Promise<any> {
  try {
    const { name, personality_prompt } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const mind = await mindsCrud.createMind(name, personality_prompt || "");
    return res.status(201).json({ success: true, data: mind });
  } catch (error: any) {
    console.error("[MINDS] Error creating mind:", error);
    if (error.message?.includes("already exists")) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to create mind" });
  }
}

export async function deleteMind(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    await mindsCrud.deleteMind(mindId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[MINDS] Error deleting mind:", error);
    if (error.message === "Mind not found") {
      return res.status(404).json({ error: "Mind not found" });
    }
    if (error.message?.includes("sync run is in progress")) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to delete mind" });
  }
}

export async function updateMind(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const { name, personality_prompt } = req.body;
    const mind = await mindsCrud.updateMind(mindId, { name, personality_prompt });
    return res.json({ success: true, data: mind });
  } catch (error: any) {
    console.error("[MINDS] Error updating mind:", error);
    if (error.message === "Mind not found") {
      return res.status(404).json({ error: "Mind not found" });
    }
    if (error.message?.includes("already exists")) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to update mind" });
  }
}

export async function updateBrain(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const { brain_markdown } = req.body;
    if (!brain_markdown) return res.status(400).json({ error: "brain_markdown is required" });

    const result = await mindsCrud.updateBrain(mindId, brain_markdown);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("[MINDS] Error updating brain:", error);
    if (error.message === "Mind not found") {
      return res.status(404).json({ error: "Mind not found" });
    }
    if (error.message?.includes("exceeds maximum")) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to update brain" });
  }
}

export async function listVersions(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const versions = await mindsCrud.listVersions(mindId);
    return res.json({ success: true, data: versions });
  } catch (error: any) {
    console.error("[MINDS] Error listing versions:", error);
    return res.status(500).json({ error: "Failed to list versions" });
  }
}

export async function publishVersion(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, versionId } = req.params;
    await mindsCrud.publishVersion(mindId, versionId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[MINDS] Error publishing version:", error);
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to publish version" });
  }
}
