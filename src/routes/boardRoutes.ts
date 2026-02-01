import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  getComments,
  createComment,
  deleteComment,
} from "../controllers/boardController";

const router = Router();

// 선생님(user) 접근 제한 미들웨어
const blockUserRole = (req: Request, res: Response, next: NextFunction): void => {
  if (req.role === "user") {
    res.status(403).json({ success: false, message: "게시판 접근 권한이 없습니다." });
    return;
  }
  next();
};

// 모든 라우트에 authenticate + blockUserRole 미들웨어 적용

// GET /api/board - 게시글 목록 조회 (페이지네이션 + 검색)
router.get("/", authenticate, blockUserRole, getPosts);

// GET /api/board/:postId - 게시글 상세 조회 (조회수 +1)
router.get("/:postId", authenticate, blockUserRole, getPostById);

// POST /api/board - 게시글 생성
router.post("/", authenticate, blockUserRole, createPost);

// PUT /api/board/:postId - 게시글 수정 (작성자 본인)
router.put("/:postId", authenticate, blockUserRole, updatePost);

// DELETE /api/board/:postId - 게시글 삭제 (작성자 본인 or 관리자)
router.delete("/:postId", authenticate, blockUserRole, deletePost);

// ===== 댓글 라우트 =====

// GET /api/board/:postId/comments - 댓글 목록 조회
router.get("/:postId/comments", authenticate, blockUserRole, getComments);

// POST /api/board/:postId/comments - 댓글 생성
router.post("/:postId/comments", authenticate, blockUserRole, createComment);

// DELETE /api/board/comments/:commentId - 댓글 삭제
router.delete("/comments/:commentId", authenticate, blockUserRole, deleteComment);

export default router;
