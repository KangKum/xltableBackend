import { Request, Response } from "express";
import { Db, ObjectId } from "mongodb";
import { IPost } from "../models/Post";
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

    // 검색 쿼리 생성
    const query = search
      ? {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { content: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    // 전체 게시글 수 조회
    const total = await postsCollection.countDocuments(query);

    // 게시글 목록 조회 (페이지네이션)
    const skip = (page - 1) * limit;
    const posts = await postsCollection
      .find(query)
      .sort({ createdAt: -1 })  // 최신 글 먼저 (내림차순)
      .skip(skip)
      .limit(limit)
      .toArray();

    res.status(200).json({
      success: true,
      posts,
      total,
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

    // 필수 필드 검증
    if (!title || !content) {
      res.status(400).json({ success: false, message: "제목과 내용을 입력해주세요." });
      return;
    }

    // ===== 도배방지 로직 =====
    const SPAM_PREVENTION_TIME = 30 * 1000; // 30초
    const postsCollection = db.collection<IPost>("posts");

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
        const remainingTime = Math.ceil((SPAM_PREVENTION_TIME - timeSinceLastPost) / 1000);
        res.status(429).json({
          success: false,
          message: "짧은 시간 안에 다시 작성할 수 없습니다.",
        });
        return;
      }
    }
    // ===== 도배방지 로직 끝 =====

    // 사용자 이메일 조회
    const usersCollection = db.collection<IUser>("users");
    const user = await usersCollection.findOne({ userId });

    if (!user) {
      res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
      return;
    }

    // 새 게시글 생성 (postsCollection 재사용)
    const newPost: IPost = {
      title,
      content,
      authorId: userId!,
      authorEmail: user.email,
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

    // 권한 체크 (작성자 본인 or 관리자)
    if (post.authorId !== userId && role !== "admin") {
      res.status(403).json({ success: false, message: "권한이 없습니다." });
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
    if (post.authorId !== userId && role !== "admin") {
      res.status(403).json({ success: false, message: "권한이 없습니다." });
      return;
    }

    // 게시글 삭제
    await postsCollection.deleteOne({ _id: new ObjectId(postId) } as any);

    res.status(200).json({
      success: true,
      message: "게시글이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("게시글 삭제 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};
