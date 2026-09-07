import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const DEFAULT_FILE_OPERATIONS = { rename, rm, writeFile };

export async function writeJsonAtomic(target, value, fileOperations = DEFAULT_FILE_OPERATIONS) {
  const temporary = join(
    dirname(target),
    `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const contents = JSON.stringify(value);

  try {
    await fileOperations.writeFile(temporary, contents, 'utf8');
    await fileOperations.rename(temporary, target);
  } catch (error) {
    try {
      await fileOperations.rm(temporary, { force: true });
    } catch {
      // Preserve the write or rename error that made the operation fail.
    }
    throw error;
  }
}
