import { expect, test } from 'claude-code/testing'

import { expandHome, isUnder, newFiles, resolve, touchesRaw } from '../hooks/paths'

const RAW = 'C:/Users/rbongar/Videos/ph1-brain/raw'

test('Windows paths compare regardless of slashes and case', async () => {
  expect(isUnder('C:\\Users\\RBongar\\Videos\\ph1-brain\\raw\\notes.txt', RAW)).toBe(true)
  expect(isUnder('C:/Users/rbongar/Videos/ph1-brain/rawfiles/x', RAW)).toBe(false)
  expect(isUnder('C:/Users/rbongar/Videos/ph1-brain/wiki/index.md', RAW)).toBe(false)
  expect(expandHome('~/Videos/ph1-brain', 'C:\\Users\\rbongar')).toBe('C:/Users/rbongar/Videos/ph1-brain')
  expect(resolve('raw\\a.txt', 'C:\\Users\\rbongar\\Videos\\ph1-brain')).toBe('C:/Users/rbongar/Videos/ph1-brain/raw/a.txt')
})

test('commands that change raw/ are caught, reads are not', async () => {
  const project = 'C:/Projects/app'
  const brain = 'C:/Users/rbongar/Videos/ph1-brain'
  for (const cmd of [
    'Remove-Item C:\\Users\\rbongar\\Videos\\ph1-brain\\raw\\a.txt',
    'del "C:\\Users\\rbongar\\Videos\\ph1-brain\\raw\\a.txt"',
    'mv C:/Users/rbongar/Videos/ph1-brain/raw/a.txt C:/tmp/',
    'echo hi > C:/Users/rbongar/Videos/ph1-brain/raw/new.txt',
    "sed -i 's/a/b/' C:/Users/rbongar/Videos/ph1-brain/raw/a.txt",
  ]) expect(touchesRaw(cmd, RAW, project)).toBe(true)
  // Relative raw/ only counts when working inside the brain.
  expect(touchesRaw('rm raw/a.txt', RAW, brain)).toBe(true)
  expect(touchesRaw('rm raw/a.txt', RAW, project)).toBe(false)
  for (const cmd of ['ls C:/Users/rbongar/Videos/ph1-brain/raw', 'cat C:/Users/rbongar/Videos/ph1-brain/raw/a.txt', 'rm C:/Projects/app/tmp.txt']) {
    expect(touchesRaw(cmd, RAW, project)).toBe(false)
  }
})

test('new and changed raw files are detected', async () => {
  const files = [{ path: 'a.txt', mtimeMs: 10 }, { path: 'b.pdf', mtimeMs: 20 }, { path: 'c.md', mtimeMs: 30 }]
  expect(newFiles(files, { 'a.txt': 10, 'b.pdf': 5 }).map(f => f.path)).toEqual(['b.pdf', 'c.md'])
})
