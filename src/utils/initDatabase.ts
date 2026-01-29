import { Db } from "mongodb";
import bcrypt from "bcryptjs";
import { IUser } from "../models/User";

/**
 * MongoDB 인덱스 초기화
 * 서버 시작 시 1회 실행되어 성능 최적화에 필요한 인덱스를 생성합니다.
 */
export async function createIndexes(db: Db): Promise<void> {
  const schedulesCollection = db.collection("schedules");

  try {
    // 복합 인덱스: userId + sheetName (unique)
    // updateSchedule, deleteSchedule에서 사용
    await schedulesCollection.createIndex(
      { userId: 1, sheetName: 1 },
      { unique: true, name: "idx_userId_sheetName" }
    );

    // 단일 인덱스: userId
    // getAllSchedules에서 사용
    await schedulesCollection.createIndex(
      { userId: 1 },
      { name: "idx_userId" }
    );

    // 정렬용 인덱스: userId + createdAt
    // getAllSchedules의 sort({ createdAt: 1 })에서 사용
    await schedulesCollection.createIndex(
      { userId: 1, createdAt: 1 },
      { name: "idx_userId_createdAt" }
    );

    console.log("✅ MongoDB 인덱스 생성 완료");
  } catch (error) {
    // 인덱스가 이미 존재하는 경우 에러 무시
    if ((error as any).code === 85) {
      console.log("✅ MongoDB 인덱스가 이미 존재합니다.");
    } else {
      console.error("❌ MongoDB 인덱스 생성 실패:", error);
      throw error;
    }
  }
}

/**
 * 기본 관리자 계정 생성
 * 서버 시작 시 1회 실행되어 관리자 계정이 없으면 생성합니다.
 */
export async function createAdminAccount(db: Db): Promise<void> {
  try {
    const adminUserId = process.env.ADMIN_USER_ID || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin1234";
    const adminEmail = process.env.ADMIN_EMAIL || "admin@xltable.com";

    const usersCollection = db.collection<IUser>("users");

    // 관리자 계정이 이미 존재하는지 확인
    const existingAdmin = await usersCollection.findOne({ userId: adminUserId });

    if (existingAdmin) {
      console.log("✅ 관리자 계정이 이미 존재합니다.");
      return;
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // 관리자 계정 생성
    const adminUser: IUser = {
      userId: adminUserId,
      password: hashedPassword,
      email: adminEmail,
      role: "admin",
      createdAt: new Date(),
    };

    await usersCollection.insertOne(adminUser as any);

    console.log(`✅ 관리자 계정 생성 완료 (아이디: ${adminUserId})`);
  } catch (error) {
    console.error("❌ 관리자 계정 생성 실패:", error);
    throw error;
  }
}
