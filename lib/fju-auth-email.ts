/** 登入與 Auth 使用的輔大雲端信箱網域（學號 + 此網域）。 */
export const FJU_EMAIL_DOMAIN = "@cloud.fju.edu.tw" as const;

export function fjuEmailFromStudentId(studentId: string): string {
  const id = studentId.trim();
  if (!id) {
    throw new Error("學號不可為空");
  }
  return `${id}${FJU_EMAIL_DOMAIN}`;
}
