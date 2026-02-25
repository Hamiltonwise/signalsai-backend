import { Request, Response } from "express";
import { MindSkillModel } from "../../models/MindSkillModel";
import { MindSkillNeuronModel } from "../../models/MindSkillNeuronModel";
import * as skillsService from "./feature-services/service.minds-skills";

export async function listSkills(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const skills = await MindSkillModel.listByMind(mindId);
    return res.json({ success: true, data: skills });
  } catch (error: any) {
    console.error("[MINDS] Error listing skills:", error);
    return res.status(500).json({ error: "Failed to list skills" });
  }
}

export async function getSkill(req: Request, res: Response): Promise<any> {
  try {
    const { skillId } = req.params;
    const skill = await MindSkillModel.findById(skillId);
    if (!skill) return res.status(404).json({ error: "Skill not found" });
    return res.json({ success: true, data: skill });
  } catch (error: any) {
    console.error("[MINDS] Error getting skill:", error);
    return res.status(500).json({ error: "Failed to get skill" });
  }
}

export async function createSkill(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const { name, definition, outputSchema } = req.body;

    if (!name) return res.status(400).json({ error: "name is required" });

    const skill = await skillsService.createSkill(
      mindId,
      name,
      definition || "",
      outputSchema || null,
    );
    return res.json({ success: true, data: skill });
  } catch (error: any) {
    console.error("[MINDS] Error creating skill:", error);
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to create skill" });
  }
}

export async function updateSkill(req: Request, res: Response): Promise<any> {
  try {
    const { skillId } = req.params;
    const { name, definition, outputSchema } = req.body;

    const skill = await MindSkillModel.findById(skillId);
    if (!skill) return res.status(404).json({ error: "Skill not found" });

    await skillsService.updateSkill(skillId, {
      name,
      definition,
      output_schema: outputSchema,
    });

    const updated = await MindSkillModel.findById(skillId);
    return res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("[MINDS] Error updating skill:", error);
    return res.status(500).json({ error: "Failed to update skill" });
  }
}

export async function deleteSkill(req: Request, res: Response): Promise<any> {
  try {
    const { skillId } = req.params;
    const skill = await MindSkillModel.findById(skillId);
    if (!skill) return res.status(404).json({ error: "Skill not found" });

    await MindSkillModel.deleteById(skillId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[MINDS] Error deleting skill:", error);
    return res.status(500).json({ error: "Failed to delete skill" });
  }
}

export async function generateNeuron(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    const { skillId } = req.params;
    const neuron = await skillsService.generateNeuron(skillId);
    return res.json({ success: true, data: neuron });
  } catch (error: any) {
    console.error("[MINDS] Error generating neuron:", error);
    if (
      error.message?.includes("not found") ||
      error.message?.includes("no published") ||
      error.message?.includes("definition is required")
    ) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to generate neuron" });
  }
}

export async function getSkillNeuron(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    const { skillId } = req.params;
    const neuron = await MindSkillNeuronModel.findBySkill(skillId);
    if (!neuron) return res.status(404).json({ error: "Neuron not found" });
    return res.json({ success: true, data: neuron });
  } catch (error: any) {
    console.error("[MINDS] Error getting neuron:", error);
    return res.status(500).json({ error: "Failed to get neuron" });
  }
}

export async function getSkillAnalytics(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    const { skillId } = req.params;
    const analytics = await skillsService.getSkillAnalytics(skillId);
    return res.json({ success: true, data: analytics });
  } catch (error: any) {
    console.error("[MINDS] Error getting skill analytics:", error);
    return res.status(500).json({ error: "Failed to get analytics" });
  }
}

export async function suggestSkill(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    const { mindId } = req.params;
    const { hint } = req.body;

    if (!hint || !hint.trim()) {
      return res.status(400).json({ error: "hint is required" });
    }

    const suggestion = await skillsService.suggestSkill(mindId, hint.trim());
    return res.json({ success: true, data: suggestion });
  } catch (error: any) {
    console.error("[MINDS] Error suggesting skill:", error);
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to generate suggestion" });
  }
}
