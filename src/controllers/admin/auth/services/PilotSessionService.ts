import jwt from "jsonwebtoken";
import { UserModel } from "../../../../models/UserModel";
import { GoogleConnectionModel } from "../../../../models/GoogleConnectionModel";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-in-prod";

export interface PilotSessionResult {
  token: string;
  googleAccountId: number | null;
  user: {
    id: number;
    email: string;
    name: string | null;
  };
}

export class PilotSessionService {
  static async generatePilotToken(
    userId: string,
    adminEmail: string
  ): Promise<PilotSessionResult> {
    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum)) {
      const error = new Error("Invalid user ID");
      error.name = "ValidationError";
      throw error;
    }

    const targetUser = await UserModel.findById(userIdNum);

    if (!targetUser) {
      const error = new Error("User not found");
      error.name = "NotFoundError";
      throw error;
    }

    const googleAccount = await GoogleConnectionModel.findByUserId(userIdNum);

    const pilotToken = jwt.sign(
      {
        userId: targetUser.id,
        email: targetUser.email,
        isPilot: true,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    console.log(
      `[ADMIN PILOT] Super Admin ${adminEmail} started pilot session for user ${targetUser.email}`
    );

    return {
      token: pilotToken,
      googleAccountId: googleAccount?.id || null,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
      },
    };
  }
}
