import { Job } from "bullmq";
import { buildPatientPathForOrg } from "../../services/patientpathBuild";

export interface PatientPathBuildJobData {
  orgId: number;
  placeId?: string;
}

export async function processPatientPathBuild(
  job: Job<PatientPathBuildJobData>
): Promise<void> {
  const { orgId } = job.data;
  console.log(`[MINDS-WORKER] Starting PatientPath build for org ${orgId}`);

  const success = await buildPatientPathForOrg(orgId);

  if (success) {
    console.log(`[MINDS-WORKER] PatientPath build complete for org ${orgId}`);
  } else {
    console.error(`[MINDS-WORKER] PatientPath build failed for org ${orgId}`);
  }
}
