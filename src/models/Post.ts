// 게시글 인터페이스 정의
export interface IPost {
  _id?: string;
  title: string;           // 게시글 제목
  content: string;         // 게시글 내용
  authorId: string;        // 작성자 userId
  authorEmail: string;     // 작성자 이메일
  authorRole: string;      // 작성자 역할 (superadmin/admin/user)
  isNotice: boolean;       // 공지사항 여부 (superadmin 작성 시 true)
  views: number;           // 조회수
  createdAt: Date;         // 생성 일시
  updatedAt: Date;         // 수정 일시
}

// 댓글 인터페이스 정의
export interface IComment {
  _id?: string;
  postId: string;          // 게시글 ID
  content: string;         // 댓글 내용
  authorId: string;        // 작성자 userId
  authorRole: string;      // 작성자 역할
  createdAt: Date;         // 생성 일시
}
