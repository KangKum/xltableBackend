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

// 선생님 아이디 검증 (role이 "user"인 계정인지 확인)
export const verifyTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teacherId } = req.body;

    // 필수 필드 검증
    if (!teacherId) {
      res.status(400).json({ success: false, verified: false, message: "선생님 아이디를 입력해주세요." });
      return;
    }

    // 요청한 사용자가 admin인지 확인
    if (req.role !== "admin") {
      res.status(403).json({ success: false, verified: false, message: "권한이 없습니다." });
      return;
    }

    // 선생님 계정 조회
    const usersCollection = db.collection<IUser>("users");
    const teacher = await usersCollection.findOne({ userId: teacherId });

    if (!teacher) {
      res.status(404).json({ success: false, verified: false, message: "존재하지 않는 아이디입니다." });
      return;
    }

    // role이 "user"인지 확인 (선생님은 user role)
    if (teacher.role !== "user") {
      res.status(400).json({ success: false, verified: false, message: "선생님 계정이 아닙니다." });
      return;
    }

    res.status(200).json({ success: true, verified: true, message: "인증되었습니다." });
  } catch (error) {
    console.error("선생님 검증 오류:", error);
    res.status(500).json({ success: false, verified: false, message: "서버 오류가 발생했습니다." });
  }
};

// 등록된 선생님 목록 저장
export const saveRegisteredTeachers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teachers } = req.body;
    const adminUserId = req.userId;

    // 요청한 사용자가 admin인지 확인
    if (req.role !== "admin") {
      res.status(403).json({ success: false, message: "권한이 없습니다." });
      return;
    }

    // teachers가 배열인지 확인
    if (!Array.isArray(teachers)) {
      res.status(400).json({ success: false, message: "잘못된 요청 형식입니다." });
      return;
    }

    // admin 계정에 registeredTeachers 업데이트
    const usersCollection = db.collection<IUser>("users");
    await usersCollection.updateOne(
      { userId: adminUserId },
      { $set: { registeredTeachers: teachers } }
    );

    res.status(200).json({ success: true, message: "저장되었습니다." });
  } catch (error) {
    console.error("선생님 목록 저장 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 등록된 선생님 목록 조회
export const getRegisteredTeachers = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminUserId = req.userId;

    // 요청한 사용자가 admin인지 확인
    if (req.role !== "admin") {
      res.status(403).json({ success: false, message: "권한이 없습니다." });
      return;
    }

    // admin 계정에서 registeredTeachers 조회
    const usersCollection = db.collection<IUser>("users");
    const admin = await usersCollection.findOne({ userId: adminUserId });

    if (!admin) {
      res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
      return;
    }

    res.status(200).json({
      success: true,
      teachers: admin.registeredTeachers || [],
    });
  } catch (error) {
    console.error("선생님 목록 조회 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 회원 탈퇴
export const deleteAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, password } = req.body;
    const requestUserId = req.userId;

    // 필수 필드 검증
    if (!userId || !password) {
      res.status(400).json({ success: false, message: "아이디와 비밀번호를 입력해주세요." });
      return;
    }

    // 본인 확인 (토큰의 userId와 요청의 userId가 일치하는지)
    if (requestUserId !== userId) {
      res.status(403).json({ success: false, message: "본인의 계정만 탈퇴할 수 있습니다." });
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

    // 사용자 삭제
    await usersCollection.deleteOne({ userId });

    res.status(200).json({ success: true, message: "회원 탈퇴가 완료되었습니다." });
  } catch (error) {
    console.error("회원 탈퇴 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};
