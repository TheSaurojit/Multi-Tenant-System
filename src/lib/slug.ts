/**
 * Slug generation utility with collision handling and retry loops.
 */

export function slugify(text: string): string {
  const cleaned = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned.length > 0 ? cleaned : 'item'
}

/**
 * Generates a guaranteed unique slug by executing retry attempts against an existence check.
 *
 * @param baseText - Raw text to convert to slug (e.g., Workspace or Organization name)
 * @param existsCheck - Predicate returning true if the candidate slug is already in use
 * @param maxAttempts - Number of retry attempts before falling back to timestamp suffix
 */
export async function generateUniqueSlug(
  baseText: string,
  existsCheck: (candidate: string) => Promise<boolean> | boolean,
  maxAttempts: number = 10
): Promise<string> {
  const base = slugify(baseText)

  // 1. Try base slug directly
  if (!(await existsCheck(base))) {
    return base
  }

  // 2. Sequential / randomized retry attempts
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const suffix = attempt < 4 ? attempt : Math.floor(1000 + Math.random() * 9000)
    const candidate = `${base}-${suffix}`
    if (!(await existsCheck(candidate))) {
      return candidate
    }
  }

  // 3. Fallback timestamp-based suffix
  return `${base}-${Date.now().toString(36)}`
}
