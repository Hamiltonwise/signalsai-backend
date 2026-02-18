import { Response } from "express";
import { Readable } from "stream";
import { getFromS3 } from "../../../utils/core/s3";

export function streamTextContent(res: Response, textContent: string): void {
  res.send(textContent);
}

export async function streamFromS3(
  res: Response,
  s3Key: string
): Promise<void> {
  const { body } = await getFromS3(s3Key);

  if (body instanceof Readable) {
    body.pipe(res);
    return;
  }

  const reader = (body as ReadableStream).getReader();
  const pump = async (): Promise<void> => {
    const { done, value } = await reader.read();
    if (done) {
      res.end();
      return;
    }
    res.write(value);
    return pump();
  };
  await pump();
}
