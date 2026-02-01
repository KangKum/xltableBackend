import { Request, Response } from "express";
import { Db, ObjectId } from "mongodb";
import { IPost, IComment } from "../models/Post";
import { IUser } from "../models/User";

// MongoDB 클라이언트 (server.ts에서 설정됨)
let db: Db;

export const setBoardDatabase = (database: Db) => {
  db = database;
};

// 게시글 목록 조회 (페이지네이션 + 검색)
export const getPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";

    const postsCollection = db.collection<IPost>("posts");

    // 검색 쿼리 생성 (공지사항 제외)
    const normalQuery = search
      ? {
          isNotice: { $ne: true },
          $or: [
            { title: { $regex: search, $options: "i" } },
            { content: { $regex: search, $options: "i" } },
          ],
        }
      : { isNotice: { $ne: true } };

    // 공지사항은 첫 페이지에서만 표시
    let notices: IPost[] = [];
    if (page === 1) {
      const noticeQuery = search
        ? {
            isNotice: true,
            $or: [
              { title: { $regex: search, $options: "i" } },
              { content: { $regex: search, $options: "i" } },
            ],
          }
        : { isNotice: true };
      notices = await postsCollection
        .find(noticeQuery)
        .sort({ createdAt: -1 })
        .toArray() as IPost[];
    }

    // 전체 일반 게시글 수 조회 (페이지네이션용)
    const total = await postsCollection.countDocuments(normalQuery);

    // 일반 게시글 목록 조회 (페이지네이션)
    const skip = (page - 1) * limit;
    const normalPosts = await postsCollection
      .find(normalQuery)
      .sort({ createdAt: -1 })  // 최신 글 먼저 (내림차순)
      .skip(skip)
      .limit(limit)
      .toArray() as IPost[];

    // 공지사항을 앞에 붙임 (첫 페이지만)
    const posts = page === 1 ? [...notices, ...normalPosts] : normalPosts;

    res.status(200).json({
      success: true,
      posts,
      total: total + (page === 1 ? notices.length : 0),
      page,
      limit,
    });
  } catch (error) {
    console.error("게시글 목록 조회 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 게시글 상세 조회 (조회수 +1)
export const getPostById = async (req: Request, res: Response): Promise<void> => {
  try {
    const postId = req.params.postId as string;

    // ObjectId 유효성 검사
    if (!postId || !ObjectId.isValid(postId)) {
      res.status(400).json({ success: false, message: "유효하지 않은 게시글 ID입니다." });
      return;
    }

    const postsCollection = db.collection<IPost>("posts");

    // 게시글 조회
    const post = await postsCollection.findOne({ _id: new ObjectId(postId) } as any);

    if (!post) {
      res.status(404).json({ success: false, message: "게시글을 찾을 수 없습니다." });
      return;
    }

    // 조회수 증가
    await postsCollection.updateOne(
      { _id: new ObjectId(postId) } as any,
      { $inc: { views: 1 } }
    );

    // 업데이트된 게시글 다시 조회
    const updatedPost = await postsCollection.findOne({
      _id: new ObjectId(postId)
    } as any);

    res.status(200).json({
      success: true,
      post: updatedPost,
    });
  } catch (error) {
    console.error("게시글 상세 조회 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 게시글 생성
export const createPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, content } = req.body;
    const userId = req.userId;  // authMiddleware에서 설정됨
    const role = req.role;

    // 필수 필드 검증
    if (!title || !content) {
      res.status(400).json({ success: false, message: "제목과 내용을 입력해주세요." });
      return;
    }

    const postsCollection = db.collection<IPost>("posts");

    // ===== 도배방지 로직 (관리자 제외) =====
    if (role !== "superadmin") {
      const SPAM_PREVENTION_TIME = 60 * 1000; // 1분

      // 마지막 게시글 작성 시간 확인
      const lastPostArray = await postsCollection
        .find({ authorId: userId })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();

      if (lastPostArray.length > 0) {
        const lastPost = lastPostArray[0];
        const timeSinceLastPost = Date.now() - new Date(lastPost.createdAt).getTime();
        if (timeSinceLastPost < SPAM_PREVENTION_TIME) {
          res.status(429).json({
            success: false,
            message: "1분에 한 번만 글을 작성할 수 있습니다.",
          });
          return;
        }
      }
    }
    // ===== 도배방지 로직 끝 =====

    // superadmin은 DB에 없으므로 별도 처리
    let authorEmail = "";
    if (role !== "superadmin") {
      const usersCollection = db.collection<IUser>("users");
      const user = await usersCollection.findOne({ userId });

      if (!user) {
        res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
        return;
      }
      authorEmail = user.email;
    }

    // 새 게시글 생성
    const newPost: IPost = {
      title,
      content,
      authorId: userId!,
      authorEmail,
      authorRole: role || "user",
      isNotice: role === "superadmin",  // 관리자 글은 공지사항
      views: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await postsCollection.insertOne(newPost as any);

    res.status(201).json({
      success: true,
      message: "게시글이 생성되었습니다.",
      postId: result.insertedId.toString(),
    });
  } catch (error) {
    console.error("게시글 생성 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 게시글 수정 (작성자 본인 or 관리자)
export const updatePost = async (req: Request, res: Response): Promise<void> => {
  try {
    const postId = req.params.postId as string;
    const { title, content } = req.body;
    const userId = req.userId;
    const role = req.role;

    // ObjectId 유효성 검사
    if (!postId || !ObjectId.isValid(postId)) {
      res.status(400).json({ success: false, message: "유효하지 않은 게시글 ID입니다." });
      return;
    }

    // 필수 필드 검증
    if (!title || !content) {
      res.status(400).json({ success: false, message: "제목과 내용을 입력해주세요." });
      return;
    }

    const postsCollection = db.collection<IPost>("posts");

    // 게시글 조회
    const post = await postsCollection.findOne({ _id: new ObjectId(postId) } as any);

    if (!post) {
      res.status(404).json({ success: false, message: "게시글을 찾을 수 없습니다." });
      return;
    }

    // 권한 체크 (작성자 본인만 수정 가능)
    if (post.authorId !== userId) {
      res.status(403).json({ success: false, message: "본인의 글만 수정할 수 있습니다." });
      return;
    }

    // 게시글 수정
    await postsCollection.updateOne(
      { _id: new ObjectId(postId) } as any,
      {
        $set: {
          title,
          content,
          updatedAt: new Date(),
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "게시글이 수정되었습니다.",
    });
  } catch (error) {
    console.error("게시글 수정 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 게시글 삭제 (작성자 본인 or 관리자)
export const deletePost = async (req: Request, res: Response): Promise<void> => {
  try {
    const postId = req.params.postId as string;
    const userId = req.userId;
    const role = req.role;

    // ObjectId 유효성 검사
    if (!postId || !ObjectId.isValid(postId)) {
      res.status(400).json({ success: false, message: "유효하지 않은 게시글 ID입니다." });
      return;
    }

    const postsCollection = db.collection<IPost>("posts");

    // 게시글 조회
    const post = await postsCollection.findOne({ _id: new ObjectId(postId) } as any);

    if (!post) {
      res.status(404).json({ success: false, message: "게시글을 찾을 수 없습니다." });
      return;
    }

    // 권한 체크 (작성자 본인 or 관리자)
    if (post.authorId !== userId && role !== "superadmin") {
      res.status(403).json({ success: false, message: "권한이 없습니다." });
      return;
    }

    // 게시글 삭제
    await postsCollection.deleteOne({ _id: new ObjectId(postId) } as any);

    // 해당 게시글의 댓글도 모두 삭제
    const commentsCollection = db.collection("comments");
    await commentsCollection.deleteMany({ postId });

    res.status(200).json({
      success: true,
      message: "게시글이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("게시글 삭제 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// ===== 댓글 관련 API =====

// 댓글 목록 조회
export const getComments = async (req: Request, res: Response): Promise<void> => {
  try {
    const postId = req.params.postId as string;

    if (!postId || !ObjectId.isValid(postId)) {
      res.status(400).json({ success: false, message: "유효하지 않은 게시글 ID입니다." });
      return;
    }

    const commentsCollection = db.collection<IComment>("comments");
    const comments = await commentsCollection
      .find({ postId })
      .sort({ createdAt: 1 })  // 오래된 댓글 먼저
      .toArray();

    res.status(200).json({
      success: true,
      comments,
    });
  } catch (error) {
    console.error("댓글 목록 조회 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 댓글 생성
export const createComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const postId = req.params.postId as string;
    const { content } = req.body;
    const userId = req.userId;
    const role = req.role;

    if (!postId || !ObjectId.isValid(postId)) {
      res.status(400).json({ success: false, message: "유효하지 않은 게시글 ID입니다." });
      return;
    }

    if (!content || !content.trim()) {
      res.status(400).json({ success: false, message: "댓글 내용을 입력해주세요." });
      return;
    }

    // 게시글 존재 확인
    const postsCollection = db.collection<IPost>("posts");
    const post = await postsCollection.findOne({ _id: new ObjectId(postId) } as any);

    if (!post) {
      res.status(404).json({ success: false, message: "게시글을 찾을 수 없습니다." });
      return;
    }

    // 공지사항에는 댓글 불가
    if (post.isNotice) {
      res.status(403).json({ success: false, message: "공지사항에는 댓글을 작성할 수 없습니다." });
      return;
    }

    const commentsCollection = db.collection<IComment>("comments");

    // ===== 도배방지 로직 (관리자 제외) =====
    if (role !== "superadmin") {
      const SPAM_PREVENTION_TIME = 60 * 1000; // 1분

      const lastCommentArray = await commentsCollection
        .find({ authorId: userId })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();

      if (lastCommentArray.length > 0) {
        const lastComment = lastCommentArray[0];
        const timeSinceLastComment = Date.now() - new Date(lastComment.createdAt).getTime();
        if (timeSinceLastComment < SPAM_PREVENTION_TIME) {
          res.status(429).json({
            success: false,
            message: "1분에 한 번만 댓글을 작성할 수 있습니다.",
          });
          return;
        }
      }
    }
    // ===== 도배방지 로직 끝 =====

    const newComment: IComment = {
      postId,
      content: content.trim(),
      authorId: userId!,
      authorRole: role || "user",
      createdAt: new Date(),
    };

    const result = await commentsCollection.insertOne(newComment as any);

    res.status(201).json({
      success: true,
      message: "댓글이 등록되었습니다.",
      commentId: result.insertedId.toString(),
    });
  } catch (error) {
    console.error("댓글 생성 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 댓글 삭제 (작성자 본인 or 관리자)
export const deleteComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const commentId = req.params.commentId as string;
    const userId = req.userId;
    const role = req.role;

    if (!commentId || !ObjectId.isValid(commentId)) {
      res.status(400).json({ success: false, message: "유효하지 않은 댓글 ID입니다." });
      return;
    }

    const commentsCollection = db.collection<IComment>("comments");
    const comment = await commentsCollection.findOne({ _id: new ObjectId(commentId) } as any);

    if (!comment) {
      res.status(404).json({ success: false, message: "댓글을 찾을 수 없습니다." });
      return;
    }

    // 권한 체크 (작성자 본인 or 관리자)
    if (comment.authorId !== userId && role !== "superadmin") {
      res.status(403).json({ success: false, message: "권한이 없습니다." });
      return;
    }

    await commentsCollection.deleteOne({ _id: new ObjectId(commentId) } as any);

    res.status(200).json({
      success: true,
      message: "댓글이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("댓글 삭제 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};
