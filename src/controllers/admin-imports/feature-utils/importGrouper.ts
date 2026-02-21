import { IAlloroImport } from "../../../models/website-builder/AlloroImportModel";

export interface GroupedImport {
  filename: string;
  display_name: string;
  type: string;
  published_version: number | null;
  latest_version: number;
  version_count: number;
  status: string;
  updated_at: Date;
  created_at: Date;
  id: string;
}

/** Group imports by filename for the list view */
export function groupImportsByFilename(
  imports: IAlloroImport[]
): GroupedImport[] {
  const grouped: Record<
    string,
    {
      filename: string;
      display_name: string;
      type: string;
      versions: IAlloroImport[];
    }
  > = {};

  for (const row of imports) {
    if (!grouped[row.filename]) {
      grouped[row.filename] = {
        filename: row.filename,
        display_name: row.display_name,
        type: row.type,
        versions: [],
      };
    }
    grouped[row.filename].versions.push(row);
  }

  return Object.values(grouped).map((g) => {
    const published = g.versions.find(
      (v: IAlloroImport) => v.status === "published"
    );
    return {
      filename: g.filename,
      display_name: g.display_name,
      type: g.type,
      published_version: published?.version || null,
      latest_version: g.versions[0]?.version || 0,
      version_count: g.versions.length,
      status: published ? "published" : g.versions[0]?.status,
      updated_at: g.versions[0]?.updated_at,
      created_at: g.versions[g.versions.length - 1]?.created_at,
      id: published?.id || g.versions[0]?.id,
    };
  });
}
