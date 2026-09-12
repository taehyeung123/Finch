/**
 * 발행 업로드 계약 타입 — 서버(lib/publish/uploads.ts, publish/actions.ts)와 브라우저(upload-client·컴포저)가 같이 본다.
 * 런타임 코드가 없다(타입만) — 클라이언트가 server-only 모듈을 건드리지 않고 가져갈 수 있다.
 */
import type { PublishMime, PublishUploadKind } from "../publish-rules";

export interface PublishUploadRequest {
  /** image = 게시물 사진(브라우저가 구운 JPEG) · video = 게시물 영상(원본 MP4·MOV) · cover = 영상 목록 썸네일 JPEG */
  kind: PublishUploadKind;
  /** 원래 파일 이름 — 영상 확장자(mp4·mov) 판정에만 쓴다(사진·커버는 JPEG 로 굽는다) */
  name: string;
  /** 올릴 바이트 수 — PUT 할 Blob 의 size 그대로(확인 단계가 실제 크기가 이보다 크면 지운다) */
  size: number;
}

export type PublishUploadTicket =
  | {
      ok: true;
      /** 이 경로를 createPost 의 media[].path / coverPath 로 넘긴다 */
      path: string;
      /** 서명 업로드 URL(…/storage/v1/object/upload/sign/publish-media/{path}?token=…) — 여기에 원본 바이트를 PUT 한다 */
      uploadUrl: string;
      token: string;
      /** PUT 의 content-type — 이 값 그대로(버킷 허용 형식과 같아야 한다) */
      contentType: PublishMime;
      maxBytes: number;
      /** 토큰 만료(발급 + 2시간, 5분 여유를 뺐다) — 지나면 createPublishUploads 로 새로 받는다 */
      expiresAt: string;
    }
  | { ok: false; error: string };

/** 확인 결과 — retryable=false 면 서버가 이미 파일을 지웠다(다른 파일로 다시 올린다) */
export type FinalizeResult = { path: string; ok: true; bytes: number } | { path: string; ok: false; error: string; retryable: boolean };
