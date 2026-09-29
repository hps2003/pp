// Hash 路由：GitHub Pages 靜態部署不需伺服器設定。篩選條件保留在網址（AC-04B）。

import { useEffect, useState, type ReactNode, type MouseEvent } from 'react'

export interface Route {
  path: string
  query: Record<string, string>
}

function parse(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/'
  const [path, qs = ''] = hash.split('?')
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) }
}

export function href(path: string, query?: Record<string, string | undefined>): string {
  const qs = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => !!e[1])).toString()
  return `#${path}${qs ? `?${qs}` : ''}`
}

export function navigate(path: string, query?: Record<string, string | undefined>, replace = false) {
  const h = href(path, query)
  if (replace) window.history.replaceState(null, '', h)
  else window.location.hash = h
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const h = () => setRoute(parse())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  return route
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const keys: string[] = []
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}/?$`)
  const m = re.exec(path)
  return m ? Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) : null
}

export function Link({ to, query, children, className, onClick, title }: { to: string; query?: Record<string, string | undefined>; children: ReactNode; className?: string; onClick?: (e: MouseEvent) => void; title?: string }) {
  return (
    <a href={href(to, query)} className={className} onClick={onClick} title={title}>
      {children}
    </a>
  )
}
