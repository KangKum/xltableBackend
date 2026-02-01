import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { MongoClient, Db } from "mongodb";
import { IUser } from "../models/User";
import { generateToken } from "../utils/jwt";

// 이메일 발송을 위한 Nodemailer 설정
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD, // Gmail 앱 비밀번호
  },
});

// 임시 비밀번호 생성 함수 (8자리 영문+숫자)
const generateTempPassword = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

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
    if (password.length < 8) {
      res.status(400).json({ success: false, message: "비밀번호는 최소 8자 이상이어야 합니다." });
      return;
    }

    // role 검증: 회원가입으로는 admin(원장님) 또는 user(선생님)만 생성 가능
    // superadmin(관리자)은 .env에서 설정한 계정으로만 로그인 가능
    const validRoles = ["admin", "user"];
    const userRole = validRoles.includes(role) ? role : "user";

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

    // 슈퍼관리자 로그인 체크 (env에서 설정)
    const superadminId = process.env.ADMIN_USER_ID;
    const superadminPw = process.env.ADMIN_PASSWORD;
    if (superadminId && superadminPw && userId === superadminId && password === superadminPw) {
      const token = generateToken(userId, "superadmin");
      res.status(200).json({
        success: true,
        message: "로그인 성공",
        token,
        userId,
        email: "",
        role: "superadmin",
      });
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

// 비밀번호 재설정 (임시 비밀번호 이메일 발송)
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, email } = req.body;

    // 필수 필드 검증
    if (!userId || !email) {
      res.status(400).json({ success: false, message: "아이디와 이메일을 입력해주세요." });
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
    if (!user.email || user.email.toLowerCase() !== email.toLowerCase()) {
      res.status(403).json({ success: false, message: "이메일이 일치하지 않습니다." });
      return;
    }

    // 임시 비밀번호 생성
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 비밀번호 업데이트
    await usersCollection.updateOne({ userId }, { $set: { password: hashedPassword } });

    // 이메일 발송
    try {
      await transporter.sendMail({
        from: `"타임메이트" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: "[타임메이트] 임시 비밀번호 안내",
        html: `
          <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0ea5e9; margin-bottom: 20px;">타임메이트 임시 비밀번호 안내</h2>
            <p style="color: #374151; line-height: 1.6;">
              안녕하세요, <strong>${userId}</strong>님.<br><br>
              요청하신 임시 비밀번호를 안내해 드립니다.
            </p>
            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">임시 비밀번호</p>
              <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #0ea5e9; letter-spacing: 2px;">${tempPassword}</p>
            </div>
            <p style="color: #374151; line-height: 1.6;">
              로그인 후 반드시 비밀번호를 변경해 주세요.<br>
              본인이 요청하지 않았다면 이 메일을 무시해 주세요.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px;">
              이 메일은 타임메이트(timemate.co.kr)에서 자동 발송되었습니다.
            </p>
          </div>
        `,
      });

      res.status(200).json({ success: true, message: "등록된 이메일로 임시 비밀번호가 발송되었습니다." });
    } catch (emailError) {
      console.error("이메일 발송 오류:", emailError);
      // 이메일 발송 실패 시 비밀번호 롤백은 하지 않음 (이미 변경됨)
      res.status(500).json({ success: false, message: "이메일 발송에 실패했습니다. 관리자에게 문의해주세요." });
    }
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
    if (newPassword.length < 8) {
      res.status(400).json({ success: false, message: "새 비밀번호는 최소 8자 이상이어야 합니다." });
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

// 슈퍼관리자용 통계 조회
export const getSuperadminStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // 슈퍼관리자 권한 확인
    if (req.role !== "superadmin") {
      res.status(403).json({ success: false, message: "슈퍼관리자 권한이 필요합니다." });
      return;
    }

    const usersCollection = db.collection<IUser>("users");
    const schedulesCollection = db.collection("schedules");

    // 원장님 목록 (role: admin)
    const admins = await usersCollection
      .find({ role: "admin" })
      .project({ userId: 1, email: 1, createdAt: 1, _id: 0 })
      .toArray();

    // 선생님 목록 (role: user)
    const teachers = await usersCollection
      .find({ role: "user" })
      .project({ userId: 1, email: 1, createdAt: 1, _id: 0 })
      .toArray();

    // 원장님별 마지막 수정시간 조회
    const adminLastUpdates = await schedulesCollection.aggregate([
      {
        $group: {
          _id: "$userId",
          lastUpdated: { $max: "$updatedAt" },
          sheetCount: { $sum: 1 }
        }
      }
    ]).toArray();

    // 원장님 정보와 마지막 수정시간 병합
    const adminsWithLastUpdate = admins.map(admin => {
      const updateInfo = adminLastUpdates.find(u => u._id === admin.userId);
      return {
        ...admin,
        lastUpdated: updateInfo?.lastUpdated || null,
        sheetCount: updateInfo?.sheetCount || 0
      };
    });

    res.status(200).json({
      success: true,
      admins: adminsWithLastUpdate,
      teachers,
      totalAdmins: admins.length,
      totalTeachers: teachers.length
    });
  } catch (error) {
    console.error("슈퍼관리자 통계 조회 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 토큰 유효성 검증 (앱 시작 시 호출)
export const validateToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // authenticate 미들웨어를 통과했으면 토큰이 유효함
    const userId = req.userId;
    const role = req.role;

    if (!userId || !role) {
      res.status(401).json({ success: false, message: "유효하지 않은 토큰입니다." });
      return;
    }

    // superadmin은 DB에 없으므로 별도 처리
    if (role === "superadmin") {
      res.status(200).json({
        success: true,
        userId,
        role,
        email: "",
      });
      return;
    }

    // 사용자 정보 조회
    const usersCollection = db.collection<IUser>("users");
    const user = await usersCollection.findOne({ userId });

    if (!user) {
      res.status(401).json({ success: false, message: "사용자를 찾을 수 없습니다." });
      return;
    }

    res.status(200).json({
      success: true,
      userId: user.userId,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("토큰 검증 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 원장님(admin) 계정 생성 (슈퍼관리자 전용)
export const createAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    // 슈퍼관리자 권한 확인
    if (req.role !== "superadmin") {
      res.status(403).json({ success: false, message: "슈퍼관리자 권한이 필요합니다." });
      return;
    }

    const { userId, password, email } = req.body;

    // 필수 필드 검증
    if (!userId || !password || !email) {
      res.status(400).json({ success: false, message: "아이디, 비밀번호, 이메일을 모두 입력해주세요." });
      return;
    }

    // 비밀번호 길이 검증
    if (password.length < 8) {
      res.status(400).json({ success: false, message: "비밀번호는 최소 8자 이상이어야 합니다." });
      return;
    }

    // 아이디 중복 체크
    const usersCollection = db.collection<IUser>("users");
    const existingUser = await usersCollection.findOne({ userId });
    if (existingUser) {
      res.status(409).json({ success: false, message: "이미 존재하는 아이디입니다." });
      return;
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);

    // 새 admin 사용자 생성
    const newUser: IUser = {
      userId,
      password: hashedPassword,
      email,
      role: "admin",
      createdAt: new Date(),
    };

    await usersCollection.insertOne(newUser as any);

    res.status(201).json({ success: true, message: "원장님 계정이 생성되었습니다." });
  } catch (error) {
    console.error("원장님 계정 생성 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};
