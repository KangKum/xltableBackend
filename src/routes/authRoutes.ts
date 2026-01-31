import { Router } from "express";
import { register, login, resetPassword, changePassword, verifyTeacher, saveRegisteredTeachers, getRegisteredTeachers, deleteAccount } from "../controllers/authController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// POST /api/auth/register - 회원가입
router.post("/register", register);

// POST /api/auth/login - 로그인
router.post("/login", login);

// POST /api/auth/reset-password - 비밀번호 재설정
router.post("/reset-password", resetPassword);

// POST /api/auth/change-password - 비밀번호 변경 (로그인한 사용자)
router.post("/change-password", changePassword);

// POST /api/auth/verify-teacher - 선생님 아이디 검증 (admin용)
router.post("/verify-teacher", authenticate, verifyTeacher);

// POST /api/auth/registered-teachers - 등록된 선생님 저장 (admin용)
router.post("/registered-teachers", authenticate, saveRegisteredTeachers);

// GET /api/auth/registered-teachers - 등록된 선생님 조회 (admin용)
router.get("/registered-teachers", authenticate, getRegisteredTeachers);

// DELETE /api/auth/delete-account - 회원 탈퇴
router.delete("/delete-account", authenticate, deleteAccount);

export default router;
