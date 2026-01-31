import { Request, Response } from "express";
import { Db } from "mongodb";
import { IScheduleDocument } from "../models/Schedule";

// MongoDB 데이터베이스 (server.ts에서 설정됨)
let db: Db;

export const setScheduleDatabase = (database: Db) => {
  db = database;
};

// 사용자의 모든 시간표 조회
export const getAllSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId; // authMiddleware에서 설정됨
    const role = req.role; // authMiddleware에서 설정됨

    if (!userId) {
      res.status(401).json({ success: false, message: "인증되지 않은 사용자입니다." });
      return;
    }

    const schedulesCollection = db.collection<IScheduleDocument>("schedules");
    let schedules;

    if (role === "admin") {
      // 원장: 본인이 생성한 모든 시트 조회
      schedules = await schedulesCollection
        .find({ userId })
        .sort({ createdAt: 1 })
        .toArray();
    } else {
      // 교사: teacherUserIds에 본인 userId가 포함된 시트만 조회
      schedules = await schedulesCollection
        .find({ teacherUserIds: userId })
        .sort({ createdAt: 1 })
        .toArray();
    }

    res.status(200).json({
      success: true,
      data: schedules,
    });
  } catch (error) {
    console.error("시간표 조회 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 새 시간표 생성
export const createSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const role = req.role;
    const { sheetName, settings, data } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: "인증되지 않은 사용자입니다." });
      return;
    }

    // 권한 확인: admin만 생성 가능
    if (role !== "admin") {
      res.status(403).json({ success: false, message: "시간표 생성 권한이 없습니다." });
      return;
    }

    // 필수 필드 검증
    if (!sheetName || !settings || !data) {
      res.status(400).json({ success: false, message: "필수 필드가 누락되었습니다." });
      return;
    }

    const schedulesCollection = db.collection<IScheduleDocument>("schedules");

    // 중복 sheetName 확인
    const existingSchedule = await schedulesCollection.findOne({ userId, sheetName });
    if (existingSchedule) {
      res.status(409).json({ success: false, message: "이미 존재하는 시트명입니다." });
      return;
    }

    // 중복 title 확인 (대소문자 무시)
    const normalizedTitle = settings.title.trim().toLowerCase();
    const duplicateTitle = await schedulesCollection.findOne({
      userId,
      title: { $regex: new RegExp(`^${normalizedTitle}$`, "i") },
    });

    if (duplicateTitle) {
      res.status(409).json({
        success: false,
        message: "이미 같은 이름의 시간표가 존재합니다.",
      });
      return;
    }

    // teacherUserIds 초기화
    const numTeachers = parseInt(settings.numOfTeachers);
    const teacherUserIds = Array(numTeachers).fill("");

    // 새 스케줄 문서 생성
    const newSchedule: IScheduleDocument = {
      userId,
      sheetName,
      title: settings.title,
      numOfTeachers: settings.numOfTeachers,
      selectedDays: settings.selectedDays,
      startTime: settings.startTime,
      endTime: settings.endTime,
      interval: settings.interval,
      teacherNames: settings.teacherNames,
      teacherUserIds,
      dayDates: settings.dayDates || {},
      cellTexts: data.cellTexts || {},
      mergedBlocks: data.mergedBlocks || [],
      viewMode: data.viewMode || "byDay",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await schedulesCollection.insertOne(newSchedule as any);

    res.status(201).json({
      success: true,
      message: "시간표가 생성되었습니다.",
    });
  } catch (error) {
    console.error("시간표 생성 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 시간표 업데이트
export const updateSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const role = req.role;
    const { sheetName } = req.params;
    const { settings, data } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: "인증되지 않은 사용자입니다." });
      return;
    }

    // 권한 확인: 교사는 수정 불가
    if (role === "user") {
      res.status(403).json({ success: false, message: "시간표 수정 권한이 없습니다." });
      return;
    }

    // 필수 필드 검증
    if (!settings || !data) {
      res.status(400).json({ success: false, message: "필수 필드가 누락되었습니다." });
      return;
    }

    const schedulesCollection = db.collection<IScheduleDocument>("schedules");

    // 스케줄 존재 확인
    const existingSchedule = await schedulesCollection.findOne({ userId, sheetName });
    if (!existingSchedule) {
      res.status(404).json({ success: false, message: "시간표를 찾을 수 없습니다." });
      return;
    }

    // 업데이트할 필드
    const updateFields = {
      title: settings.title,
      numOfTeachers: settings.numOfTeachers,
      selectedDays: settings.selectedDays,
      startTime: settings.startTime,
      endTime: settings.endTime,
      interval: settings.interval,
      teacherNames: settings.teacherNames,
      teacherUserIds: settings.teacherUserIds || existingSchedule.teacherUserIds,
      dayDates: settings.dayDates || existingSchedule.dayDates || {},
      cellTexts: data.cellTexts || {},
      mergedBlocks: data.mergedBlocks || [],
      viewMode: data.viewMode || "byDay",
      updatedAt: new Date(),
    };

    await schedulesCollection.updateOne(
      { userId, sheetName },
      { $set: updateFields }
    );

    res.status(200).json({
      success: true,
      message: "시간표가 저장되었습니다.",
    });
  } catch (error) {
    console.error("시간표 업데이트 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 시간표 삭제
export const deleteSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const role = req.role;
    const { sheetName } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: "인증되지 않은 사용자입니다." });
      return;
    }

    // 권한 확인: admin만 삭제 가능
    if (role !== "admin") {
      res.status(403).json({ success: false, message: "시간표 삭제 권한이 없습니다." });
      return;
    }

    const schedulesCollection = db.collection<IScheduleDocument>("schedules");

    // 스케줄 존재 확인
    const existingSchedule = await schedulesCollection.findOne({ userId, sheetName });
    if (!existingSchedule) {
      res.status(404).json({ success: false, message: "시간표를 찾을 수 없습니다." });
      return;
    }

    await schedulesCollection.deleteOne({ userId, sheetName });

    res.status(200).json({
      success: true,
      message: "시간표가 삭제되었습니다.",
    });
  } catch (error) {
    console.error("시간표 삭제 오류:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};
