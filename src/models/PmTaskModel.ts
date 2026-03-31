import { BaseModel } from "./BaseModel";

export class PmTaskModel extends BaseModel {
  protected static tableName = "pm_tasks";
  protected static jsonFields: string[] = [];
}
