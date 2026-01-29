import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { MongoClient, Db } from "mongodb";
import { IUser } from "../models/User";
import { generateToken } from "../utils/jwt";

// MongoDB 클라이언트 (server.ts에서 설정됨)
let db: Db;

export const setDatabase = (database: Db) => {
  db = database;
};

// 회원가입
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, password, email, role } = req.body;

    // 필수 필드 검증
    if (!userId || !password || !email) {
      res.status(400).json({ success: false, message: "아이디, 비밀번호, 이메일을 모두 입력해주세요." });
      return;
    }

    // 비밀번호 길이 검증
    if (password.length < 4) {
      res.status(400).json({ success: false, message: "비밀번호는 최소 4자 이상이어야 합니다." });
      return;
    }

    // role 검증 (admin 또는 user만 허용)
    const userRole = role === "admin" ? "admin" : "user";

    // 아이디 중복 체크
    const usersCollection = db.collection<IUser>("users");
    const existingUser = await usersCollection.findOne({ userId });
    if (existingUser) {
      res.status(409).json({ success: false, message: "이미 존재하는 아이디입니다." });
      return;
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);

    // 새 사용자 생성
    const newUser: IUser = {
      userId,
      password: hashedPassword,
      email,
      role: userRole,
      createdAt: new Date(),
    };

    await usersCollection.insertOne(newUser as any);

    res.status(201).json({ success: true, message: "회원가입이 완료되었습니다." });
  } catch (error) {
    console.error("회원가입 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 로그인
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, password } = req.body;

    // 필수 필드 검증
    if (!userId || !password) {
      res.status(400).json({ success: false, message: "아이디와 비밀번호를 입력해주세요." });
      return;
    }

    // 사용자 조회
    const usersCollection = db.collection<IUser>("users");
    const user = await usersCollection.findOne({ userId });
    if (!user) {
      res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
      return;
    }

    // 비밀번호 검증
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ success: false, message: "비밀번호가 일치하지 않습니다." });
      return;
    }

    // JWT 토큰 생성 (role 포함)
    const token = generateToken(userId, user.role || "user");

    res.status(200).json({
      success: true,
      message: "로그인 성공",
      token,
      userId: user.userId,
      email: user.email,
      role: user.role || "user",  // role 반환
    });
  } catch (error) {
    console.error("로그인 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 비밀번호 재설정
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, email, newPassword } = req.body;

    // 필수 필드 검증
    if (!userId || !email || !newPassword) {
      res.status(400).json({ success: false, message: "모든 필드를 입력해주세요." });
      return;
    }

    // 비밀번호 길이 검증
    if (newPassword.length < 4) {
      res.status(400).json({ success: false, message: "비밀번호는 최소 4자 이상이어야 합니다." });
      return;
    }

    // 사용자 조회
    const usersCollection = db.collection<IUser>("users");
    const user = await usersCollection.findOne({ userId });
    if (!user) {
      res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
      return;
    }

    // 이메일 확인
    if (!user.email || user.email !== email) {
      res.status(403).json({ success: false, message: "이메일이 일치하지 않습니다." });
      return;
    }

    // 새 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 비밀번호 업데이트
    await usersCollection.updateOne({ userId }, { $set: { password: hashedPassword } });

    res.status(200).json({ success: true, message: "비밀번호가 재설정되었습니다." });
  } catch (error) {
    console.error("비밀번호 재설정 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 비밀번호 변경 (로그인한 사용자)
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    // 필수 필드 검증
    if (!userId || !currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: "모든 필드를 입력해주세요." });
      return;
    }

    // 새 비밀번호 길이 검증
    if (newPassword.length < 4) {
      res.status(400).json({ success: false, message: "새 비밀번호는 최소 4자 이상이어야 합니다." });
      return;
    }

    // 사용자 조회
    const usersCollection = db.collection<IUser>("users");
    const user = await usersCollection.findOne({ userId });
    if (!user) {
      res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
      return;
    }

    // 현재 비밀번호 검증
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ success: false, message: "현재 비밀번호가 일치하지 않습니다." });
      return;
    }

    // 새 비밀번호가 현재 비밀번호와 같은지 확인
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      res.status(400).json({ success: false, message: "새 비밀번호는 현재 비밀번호와 달라야 합니다." });
      return;
    }

    // 새 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 비밀번호 업데이트
    await usersCollection.updateOne({ userId }, { $set: { password: hashedPassword } });

    res.status(200).json({ success: true, message: "비밀번호가 성공적으로 변경되었습니다." });
  } catch (error) {
    console.error("비밀번호 변경 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};
