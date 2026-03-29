import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/**
 * Read JWT_SECRET lazily at call time so dotenv.config() has already run.
 * Top-level const would capture the value before dotenv loads .env (ESM hoisting).
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.");
  return secret;
}

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
  };
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  jwt.verify(token, getJwtSecret(), (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    req.user = user;
    next();
  });
};
