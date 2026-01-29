import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
} from "../controllers/boardController";

const router = Router();

// 모든 라우트에 authenticate 미들웨어 적용 (인증 필수)

// GET /api/board - 게시글 목록 조회 (페이지네이션 + 검색)
router.get("/", authenticate, getPosts);

// GET /api/board/:postId - 게시글 상세 조회 (조회수 +1)
router.get("/:postId", authenticate, getPostById);

// POST /api/board - 게시글 생성
router.post("/", authenticate, createPost);

// PUT /api/board/:postId - 게시글 수정 (작성자 본인 or 관리자)
router.put("/:postId", authenticate, updatePost);

// DELETE /api/board/:postId - 게시글 삭제 (작성자 본인 or 관리자)
router.delete("/:postId", authenticate, deletePost);

export default router;
