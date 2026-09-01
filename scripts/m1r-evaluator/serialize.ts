/**
 * Deterministic, Prettier-clean JSON serialization for Gate 2 evidence artifacts.
 * Both the generator and the recompute/determinism test use this, so the committed
 * files are byte-identical to a fresh generation AND pass the repository Prettier check.
 */
import prettier from 'prettier'

export async function formatJsonFile(
  obj: unknown,
  absPath: string,
): Promise<string> {
  const options = (await prettier.resolveConfig(absPath)) ?? {}
  return prettier.format(JSON.stringify(obj, null, 2), {
    ...options,
    filepath: absPath,
  })
}
