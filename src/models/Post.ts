// 게시글 인터페이스 정의
export interface IPost {
  _id?: string;
  title: string;           // 게시글 제목
  content: string;         // 게시글 내용
  authorId: string;        // 작성자 userId
  authorEmail: string;     // 작성자 이메일
  views: number;           // 조회수
  createdAt: Date;         // 생성 일시
  updatedAt: Date;         // 수정 일시
}
