import { constants as fsConstants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { publicAnswerCorpusApprovalSchema, type PublicAnswerCorpusApproval } from '@beyondwin/contracts';

export async function readPublicAnswerCorpusApproval(path: string): Promise<PublicAnswerCorpusApproval> {
  let file;
  try {
    file = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('public answer corpus approval must not be a symbolic link');
    }
    throw error;
  }
  try {
    const opened = await file.stat();
    const before = await lstat(path);
    if (
      !opened.isFile()
      || before.isSymbolicLink()
      || !before.isFile()
      || opened.nlink !== 1
      || before.nlink !== 1
      || opened.dev !== before.dev
      || opened.ino !== before.ino
      || (typeof process.getuid === 'function' && opened.uid !== process.getuid())
    ) {
      throw new Error('public answer corpus approval must be one regular owned single-link file');
    }
    const bytes = await file.readFile();
    const after = await lstat(path);
    if (
      after.isSymbolicLink()
      || !after.isFile()
      || after.nlink !== 1
      || after.dev !== opened.dev
      || after.ino !== opened.ino
    ) {
      throw new Error('public answer corpus approval inode changed while reading');
    }
    return publicAnswerCorpusApprovalSchema.parse(JSON.parse(bytes.toString('utf8')));
  } finally {
    await file.close();
  }
}
