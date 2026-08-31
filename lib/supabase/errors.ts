/**
 * PostgREST 오류 판별 — «아직 없는 것»과 «고장난 것»을 가른다.
 *
 * 이 구분이 왜 필요한가: 마이그레이션이 아직 안 들어간 표를 조회하면 오류가 나는데,
 * 그걸 «조회 실패»로 다루면 화면이 전원에게 「상태 확인 실패」를 띄운다.
 * 실제로는 아직 열리지 않은 기능일 뿐이라 사용자가 할 일이 없다.
 */

export interface PgError {
  code?: string;
  message?: string;
}

/**
 * 표가 없다.
 *
 * ⚠️ **PostgREST 는 `42P01`(Postgres 의 undefined_table)을 그대로 내보내지 않는다.**
 * 스키마 캐시에서 먼저 걸러 `PGRST205` 를 낸다 —
 * 실측(2026-09-01): `{"code":"PGRST205","message":"Could not find the table 'public.x' in the schema cache"}`.
 * 처음에 `42P01` 만 보고 짰다가 조건이 영영 안 걸리는 코드를 쓸 뻔했다.
 * 42P01 도 함께 본다 — RPC 안에서 나면 그쪽 코드로 올라온다.
 */
export function isMissingTableError(error: PgError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const msg = error.message ?? "";
  return /could not find the table/i.test(msg) || /relation .* does not exist/i.test(msg);
}
