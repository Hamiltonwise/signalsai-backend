import fs from "fs";
import { promisify } from "util";
import { getLogFilePath } from "../feature-utils/logFileConfig";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

export interface LogFileData {
  logs: string[];
  total_lines: number;
  log_type: string;
  file_exists: boolean;
}

export class LogFileError extends Error {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "LogFileError";
    this.code = code;
  }
}

export async function readLogFile(
  logType: string,
  maxLines: number
): Promise<LogFileData> {
  const logFilePath = getLogFilePath(logType);

  if (!fs.existsSync(logFilePath)) {
    return {
      logs: [],
      total_lines: 0,
      log_type: logType,
      file_exists: false,
    };
  }

  const content = await readFile(logFilePath, "utf-8");
  const allLines = content.split("\n");
  const latestLines = allLines.slice(-maxLines);

  return {
    logs: latestLines,
    total_lines: allLines.length,
    log_type: logType,
    file_exists: true,
  };
}

export async function clearLogFile(logType: string): Promise<{ fileExisted: boolean }> {
  const logFilePath = getLogFilePath(logType);

  if (!fs.existsSync(logFilePath)) {
    return { fileExisted: false };
  }

  await writeFile(logFilePath, "");
  return { fileExisted: true };
}
