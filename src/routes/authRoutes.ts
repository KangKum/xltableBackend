import { Router } from "express";
import { register, login, resetPassword, changePassword } from "../controllers/authController";

const router = Router();

// POST /api/auth/register - 회원가입
router.post("/register", register);

// POST /api/auth/login - 로그인
router.post("/login", login);

// POST /api/auth/reset-password - 비밀번호 재설정
router.post("/reset-password", resetPassword);

// POST /api/auth/change-password - 비밀번호 변경 (로그인한 사용자)
router.post("/change-password", changePassword);

export default router;
