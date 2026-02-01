import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes";
import scheduleRoutes from "./routes/scheduleRoutes";
import boardRoutes from "./routes/boardRoutes";
import { setDatabase } from "./controllers/authController";
import { setScheduleDatabase } from "./controllers/scheduleController";
import { setBoardDatabase } from "./controllers/boardController";
import { createIndexes, createAdminAccount } from "./utils/initDatabase";

dotenv.config();

// 허용된 도메인 목록
const allowedOrigins = [
  "https://timemate.co.kr",
  "https://www.timemate.co.kr",
  "http://localhost:5177",  // 개발 서버
];

// CORS 설정
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // origin이 없는 경우 (같은 출처 요청 또는 서버 간 통신)
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS 정책에 의해 차단되었습니다."));
    }
  },
  credentials: true,
};

// 전역 Rate Limiting (분당 100회)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 100, // 최대 100회
  message: { success: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
  standardHeaders: true,
  legacyHeaders: false,
});

// 로그인/회원가입 Rate Limiting (분당 10회)
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 10, // 최대 10회
  message: { success: false, message: "로그인 시도가 너무 많습니다. 1분 후 다시 시도해주세요." },
  standardHeaders: true,
  legacyHeaders: false,
});

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI가 설정되어 있지 않습니다. .env를 확인하세요.");
}

// Connection Pooling 설정 (성능 최적화)
const client = new MongoClient(uri, {
  maxPoolSize: 500,        // 최대 연결 수 (기본값: 100)
  minPoolSize: 50,         // 최소 유휴 연결 수
  maxIdleTimeMS: 30000,    // 유휴 연결 타임아웃 (30초)
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
const app = express();

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" })); // JSON 파싱 (크기 제한)
app.use(globalLimiter); // 전역 Rate Limiting

let xltableCollection;

async function startServer() {
  try {
    await client.connect();
    console.log("MongoDB 연결 성공");

    const db = client.db("timemanager");
    xltableCollection = db.collection("xltable");

    // MongoDB 인덱스 초기화 (성능 최적화)
    await createIndexes(db);

    // 기본 관리자 계정 생성
    await createAdminAccount(db);

    // authController에 database 설정
    setDatabase(db);

    // scheduleController에 database 설정
    setScheduleDatabase(db);

    // boardController에 database 설정
    setBoardDatabase(db);

    // Auth 라우트 연결 (로그인/회원가입에 Rate Limiting 적용)
    app.use("/api/auth/login", authLimiter);
    app.use("/api/auth/register", authLimiter);
    app.use("/api/auth/reset-password", authLimiter);
    app.use("/api/auth", authRoutes);

    // Schedule 라우트 연결
    app.use("/api/schedules", scheduleRoutes);

    // Board 라우트 연결
    app.use("/api/board", boardRoutes);

    app.listen(4009, () => {
      console.log("🚀 Server running on http://localhost:4009");
    });
  } catch (err) {
    console.error("MongoDB 연결 실패:", err);
  }
}

startServer();
