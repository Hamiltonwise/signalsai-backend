import { Request, Response } from "express";
import { PublishChannelModel } from "../../models/PublishChannelModel";

/**
 * GET /publish-channels — list all publish channels
 */
export async function listChannels(
  _req: Request,
  res: Response
): Promise<any> {
  const channels = await PublishChannelModel.listAll();
  return res.json(channels);
}

/**
 * POST /publish-channels — create a publish channel
 */
export async function createChannel(
  req: Request,
  res: Response
): Promise<any> {
  const { name, webhook_url, description } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }
  if (!webhook_url || typeof webhook_url !== "string") {
    return res.status(400).json({ error: "webhook_url is required" });
  }

  const channel = await PublishChannelModel.create({
    name: name.trim(),
    webhook_url: webhook_url.trim(),
    description: description?.trim() || null,
  });

  return res.status(201).json(channel);
}

/**
 * PUT /publish-channels/:channelId — update a publish channel
 */
export async function updateChannel(
  req: Request,
  res: Response
): Promise<any> {
  const { channelId } = req.params;
  const { name, webhook_url, description, status } = req.body;

  const channel = await PublishChannelModel.findById(channelId);
  if (!channel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (webhook_url !== undefined) updates.webhook_url = webhook_url.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (status !== undefined) updates.status = status;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  await PublishChannelModel.updateById(channelId, updates);
  const updated = await PublishChannelModel.findById(channelId);
  return res.json(updated);
}

/**
 * DELETE /publish-channels/:channelId — delete a publish channel
 */
export async function deleteChannel(
  req: Request,
  res: Response
): Promise<any> {
  const { channelId } = req.params;

  const channel = await PublishChannelModel.findById(channelId);
  if (!channel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  await PublishChannelModel.deleteById(channelId);
  return res.json({ success: true });
}
