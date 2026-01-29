import { Router } from "express";
import {
  getAllSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "../controllers/scheduleController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// GET /api/schedules - 사용자의 모든 시간표 조회
router.get("/", getAllSchedules);

// POST /api/schedules - 새 시간표 생성
router.post("/", createSchedule);

// PUT /api/schedules/:sheetName - 시간표 업데이트
router.put("/:sheetName", updateSchedule);

// DELETE /api/schedules/:sheetName - 시간표 삭제
router.delete("/:sheetName", deleteSchedule);

export default router;
