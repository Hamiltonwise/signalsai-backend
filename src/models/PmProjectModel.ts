import { BaseModel } from "./BaseModel";

export class PmProjectModel extends BaseModel {
  protected static tableName = "pm_projects";
  protected static jsonFields: string[] = [];
}
