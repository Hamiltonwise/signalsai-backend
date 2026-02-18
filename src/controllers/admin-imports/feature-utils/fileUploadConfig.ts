import multer from "multer";

/** Multer configuration — memory storage, 25 MB limit, accept all files */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
