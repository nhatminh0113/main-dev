/** Lowercase, strip Vietnamese diacritics (including đ) for loose matching. */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

/** Key used to match `#Do-An_DevOps` against a project called "Đồ án DevOps". */
export function nameKey(value: string): string {
  return fold(value).replace(/[\s_-]+/g, '')
}
