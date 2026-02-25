import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface IMindSkillNeuron {
  id: string;
  skill_id: string;
  mind_version_id: string;
  neuron_markdown: string;
  generated_at: Date;
}

export class MindSkillNeuronModel extends BaseModel {
  protected static tableName = "minds.mind_skill_neurons";

  static async findBySkill(
    skillId: string,
    trx?: QueryContext,
  ): Promise<IMindSkillNeuron | undefined> {
    return this.table(trx).where({ skill_id: skillId }).first();
  }

  static async upsert(
    skillId: string,
    versionId: string,
    markdown: string,
    trx?: QueryContext,
  ): Promise<IMindSkillNeuron> {
    const existing = await this.findBySkill(skillId, trx);
    if (existing) {
      await this.table(trx).where({ id: existing.id }).update({
        mind_version_id: versionId,
        neuron_markdown: markdown,
        generated_at: new Date(),
      });
      return { ...existing, mind_version_id: versionId, neuron_markdown: markdown, generated_at: new Date() };
    }
    const [row] = await this.table(trx)
      .insert({
        skill_id: skillId,
        mind_version_id: versionId,
        neuron_markdown: markdown,
        generated_at: new Date(),
      })
      .returning("*");
    return row;
  }

  static async deleteBySkill(
    skillId: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where({ skill_id: skillId }).del();
  }
}
