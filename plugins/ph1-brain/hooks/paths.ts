// Pure path rules for the brain: no engine calls, so they are easy to test.

// Forward slashes, no trailing slash, lower case for Windows drive paths (case-insensitive there).
export function norm(p: string): string {
  let s = p.replace(/\\/g, '/').replace(/\/+/g, '/')
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return /^[a-zA-Z]:\//.test(s) ? s.toLowerCase() : s
}

export function isUnder(path: string, dir: string): boolean {
  const p = norm(path)
  const d = norm(dir)
  return p === d || p.startsWith(d + '/')
}

// Resolve a path that may be relative to the session's working directory.
export function resolve(path: string, cwd: string): string {
  const p = path.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(p) || p.startsWith('/')) return p
  return `${cwd.replace(/\\/g, '/').replace(/\/$/, '')}/${p}`
}

export function expandHome(p: string, home: string | undefined): string {
  if (!home || !(p === '~' || p.startsWith('~/') || p.startsWith('~\\'))) return p
  return home.replace(/\\/g, '/').replace(/\/$/, '') + p.slice(1).replace(/\\/g, '/')
}

// Shell commands that could change files: deleting, moving, renaming, writing or editing in place.
const DESTRUCTIVE =
  /(^|[\s;&|(])(rm|rmdir|del|erase|rd|mv|move|ren|rename|cp|copy|xcopy|robocopy|touch|truncate|tee|chmod|chown|Remove-Item|Move-Item|Rename-Item|Copy-Item|Set-Content|Add-Content|Clear-Content|Out-File|New-Item|ri|mi|rni|sc|ac)\b|sed\s+(-\w*i|--in-place)|>/i

// Does this shell command look like it changes something inside raw/?
export function touchesRaw(command: string, rawDir: string, cwd: string): boolean {
  if (!DESTRUCTIVE.test(command)) return false
  const cmd = command.replace(/\\/g, '/').toLowerCase()
  const raw = norm(rawDir).toLowerCase()
  if (cmd.includes(raw)) return true
  // A relative raw/ path, when the session is working inside the brain folder.
  const brain = raw.replace(/\/raw$/, '')
  if (isUnder(cwd, brain) && /(^|[\s"'=/])(\.\/)?raw(\/|\s|"|'|$)/.test(cmd)) return true
  return false
}

// Which raw files are new or changed since the last ingest?
export type RawFile = { path: string; mtimeMs: number }
export function newFiles(files: RawFile[], processed: Record<string, number>): RawFile[] {
  return files.filter(f => processed[f.path] === undefined || processed[f.path]! < f.mtimeMs)
}

// Files the librarian should ignore: our own README, hidden files, system clutter.
export function ignored(name: string): boolean {
  return name === 'README.txt' || name.startsWith('.') || name.startsWith('~$') || /^(thumbs\.db|desktop\.ini)$/i.test(name)
}
