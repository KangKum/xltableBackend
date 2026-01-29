import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";

// Request 타입 확장 (userId, role 추가)
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      role?: string;
    }
  }
}

// JWT 검증 미들웨어
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, message: "인증 토큰이 없습니다." });
      return;
    }

    const token = authHeader.split(" ")[1];

    // 토큰 검증
    const decoded = verifyToken(token);
    if (!decoded) {
      res.status(401).json({ success: false, message: "유효하지 않은 토큰입니다." });
      return;
    }

    // req에 userId, role 추가
    req.userId = decoded.userId;
    req.role = decoded.role;
    next();
  } catch (error) {
    console.error("인증 미들웨어 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};
