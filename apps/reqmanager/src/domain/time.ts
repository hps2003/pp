// 日期規則（PRD 7.5／03 名詞定義）：時間以 UTC ISO 儲存、Asia/Taipei 顯示；
// 工作天 = 週一至週五。日期欄位（YYYY-MM-DD）以當日 23:59 台北時間為截止。

const TZ = 'Asia/Taipei'

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

/** ISO 時間 → 台北日期 YYYY-MM-DD */
export function taipeiDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return dateFmt.format(d)
}

export function taipeiTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: string, n: number): string {
  const d = parse(date)
  d.setUTCDate(d.getUTCDate() + n)
  return toStr(d)
}

export function isWorkingDay(date: string): boolean {
  const day = parse(date).getUTCDay()
  return day !== 0 && day !== 6
}

export function addWorkingDays(date: string, n: number): string {
  let cur = date
  let left = Math.abs(n)
  const step = n >= 0 ? 1 : -1
  while (left > 0) {
    cur = addDays(cur, step)
    if (isWorkingDay(cur)) left--
  }
  return cur
}

/** from 之後到 to（含）之間的工作天數；to 早於 from 時為負數 */
export function workingDaysBetween(from: string, to: string): number {
  if (from === to) return 0
  const sign = to > from ? 1 : -1
  let [a, b] = sign > 0 ? [from, to] : [to, from]
  let count = 0
  while (a < b) {
    a = addDays(a, 1)
    if (isWorkingDay(a)) count++
  }
  return count * sign
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000)
}

/** 顯示用：YYYY/MM/DD（PRD 10.1） */
export function fmtDate(date: string | undefined): string {
  if (!date) return '—'
  return date.slice(0, 10).replace(/-/g, '/')
}

export function fmtShort(date: string | undefined): string {
  if (!date) return '—'
  return date.slice(5, 10).replace('-', '/')
}

export function fmtDateTime(iso: string): string {
  return `${fmtShort(taipeiDate(iso))} ${taipeiTime(iso)}`
}

/** 相對時間：10 分鐘前／1 小時前／昨天 17:20／09/27 */
export function relTime(iso: string, now: Date = new Date()): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000
  if (diff < 60) return '剛剛'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`
  const today = taipeiDate(now)
  const day = taipeiDate(iso)
  if (day === today) return `${Math.floor(diff / 3600)} 小時前`
  if (day === addDays(today, -1)) return `昨天 ${taipeiTime(iso)}`
  return fmtShort(day)
}
