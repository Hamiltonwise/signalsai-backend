import { MindModel, IMind } from "../../../models/MindModel";
import { MindVersionModel, IMindVersion } from "../../../models/MindVersionModel";
import { db } from "../../../database/connection";

const MAX_BRAIN_CHARACTERS = parseInt(
  process.env.MINDS_MAX_BRAIN_CHARACTERS || "50000",
  10
);
const BRAIN_WARN_THRESHOLD = MAX_BRAIN_CHARACTERS * 0.8;

export async function listMinds(): Promise<IMind[]> {
  return MindModel.listAll();
}

export async function getMind(mindId: string): Promise<IMind & { published_version?: IMindVersion }> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  let published_version: IMindVersion | undefined;
  if (mind.published_version_id) {
    published_version = await MindVersionModel.findById(mind.published_version_id);
  }

  return { ...mind, published_version };
}

export async function createMind(
  name: string,
  personalityPrompt: string
): Promise<IMind> {
  const existing = await MindModel.findByName(name);
  if (existing) throw new Error("A mind with this name already exists");

  return MindModel.create({ name, personality_prompt: personalityPrompt });
}

export async function updateMind(
  mindId: string,
  data: { name?: string; personality_prompt?: string }
): Promise<IMind> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  if (data.name && data.name !== mind.name) {
    const existing = await MindModel.findByName(data.name);
    if (existing) throw new Error("A mind with this name already exists");
  }

  await MindModel.updateById(mindId, data);
  return MindModel.findById(mindId);
}

export async function updateBrain(
  mindId: string,
  brainMarkdown: string,
  adminId?: string
): Promise<{ version: IMindVersion; warning?: string }> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  if (brainMarkdown.length > MAX_BRAIN_CHARACTERS) {
    throw new Error(
      `Brain content exceeds maximum size of ${MAX_BRAIN_CHARACTERS} characters (current: ${brainMarkdown.length}).`
    );
  }

  let warning: string | undefined;
  if (brainMarkdown.length > BRAIN_WARN_THRESHOLD) {
    warning = `Brain content is ${brainMarkdown.length} characters — approaching the ${MAX_BRAIN_CHARACTERS} limit.`;
  }

  const version = await db.transaction(async (trx) => {
    const v = await MindVersionModel.createVersion(mindId, brainMarkdown, adminId, trx);
    await MindModel.setPublishedVersion(mindId, v.id, trx);
    return v;
  });

  console.log(
    `[MINDS] Brain updated for mind ${mindId}: version ${version.version_number}, ${brainMarkdown.length} chars`
  );

  return { version, warning };
}

export async function listVersions(mindId: string): Promise<IMindVersion[]> {
  return MindVersionModel.listByMind(mindId);
}

export async function publishVersion(
  mindId: string,
  versionId: string
): Promise<void> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const version = await MindVersionModel.findById(versionId);
  if (!version) throw new Error("Version not found");
  if (version.mind_id !== mindId) throw new Error("Version does not belong to this mind");

  await MindModel.setPublishedVersion(mindId, versionId);
  console.log(`[MINDS] Published version ${version.version_number} for mind ${mindId}`);
}
