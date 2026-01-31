// 시간표 스케줄 인터페이스 정의

// 셀 데이터
export interface ICellData {
  text: string;
  bold?: boolean;
  lineThrough?: boolean;
  fontSize?: number;
  bgColor?: string;
}

// 병합 블록
export interface IMergedBlock {
  day: string;
  colIdx: number;
  startRow: number;
  endRow: number;
}

// 스케줄 문서 (MongoDB)
export interface IScheduleDocument {
  _id?: string;
  userId: string;              // 사용자 ID
  sheetName: string;           // 시트명 (고유 키)

  // ISheetSettings 필드
  title: string;
  numOfTeachers: string;
  selectedDays: string[];
  startTime: string;
  endTime: string;
  interval: string;
  teacherNames: string[];
  teacherUserIds: string[];    // 교사 아이디 배열 (teacherNames와 인덱스 매칭)
  dayDates?: Record<string, string>;  // 요일별 날짜 (예: {"월": "1/26", "화": "1/27"})

  // ISheetData 필드
  cellTexts: Record<string, ICellData>;
  mergedBlocks: IMergedBlock[];
  viewMode: "byDay" | "byTeacher";

  // 메타데이터
  createdAt: Date;
  updatedAt: Date;
}
