// 사용자 인터페이스 정의
export interface IUser {
  _id?: string;
  userId: string;       // 로그인 아이디
  password: string;     // bcrypt 해시값
  email: string;        // 비밀번호 찾기용 (필수)
  role: "admin" | "user";  // 사용자 역할
  registeredTeachers?: string[];  // 등록된 선생님 아이디 목록 (admin용)
  createdAt: Date;      // 생성 일시
}
