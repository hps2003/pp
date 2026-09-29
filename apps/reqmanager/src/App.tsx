import { useEffect, type ReactNode } from 'react'
import { ToastProvider, NoPermission, Loading } from './ui/kit.tsx'
import { Layout, navFor } from './ui/Layout.tsx'
import { match, navigate, useRoute } from './ui/router.tsx'
import { SessionProvider, useSession } from './ui/session.tsx'
import { Login } from './screens/Login.tsx'
import { Workbench } from './screens/Workbench.tsx'
import { ReqList } from './screens/ReqList.tsx'
import { ReqForm } from './screens/ReqForm.tsx'
import { ReqDetail } from './screens/ReqDetail.tsx'
import { ClientDetailScreen, ClientList } from './screens/Clients.tsx'
import { Reports } from './screens/Reports.tsx'
import { Accounts } from './screens/Accounts.tsx'
import { SystemStatus } from './screens/System.tsx'
import { Docs } from './screens/Docs.tsx'

function Redirect({ to, query }: { to: string; query?: Record<string, string> }) {
  useEffect(() => navigate(to, query, true), [to, query])
  return null
}

function Routes() {
  const { user, ready } = useSession()
  const route = useRoute()
  if (!ready) return <Loading />
  if (!user || route.path === '/login') {
    if (user && route.path === '/login') return <Redirect to={user.role === 'Admin' ? '/admin/users' : '/'} />
    if (!user && route.path !== '/login') {
      // 未登入存取任何頁面 → 登入後回到原本要看的頁面
      return <Redirect to="/login" query={{ returnTo: `${route.path}${Object.keys(route.query).length ? `?${new URLSearchParams(route.query)}` : ''}` }} />
    }
    return <Login />
  }

  const p = route.path
  const allowed = (prefix: string) => navFor(user).some(n => n.match(prefix))
  let page: ReactNode
  let m: Record<string, string> | null
  if (p === '/') page = user.role === 'Admin' ? <Redirect to="/admin/users" /> : <Workbench />
  else if (p === '/requirements') page = <ReqList />
  else if (p === '/requirements/new') page = user.role === 'Admin' ? <NoPermission /> : <ReqForm />
  else if ((m = match('/requirements/:id/edit', p))) page = <ReqForm id={m.id} />
  else if ((m = match('/requirements/:id', p))) page = <ReqDetail id={m.id} />
  else if (p === '/clients') page = allowed('/clients') ? <ClientList /> : <NoPermission />
  else if ((m = match('/clients/:id', p))) page = allowed('/clients') ? <ClientDetailScreen id={m.id} /> : <NoPermission />
  else if (p === '/reports') page = allowed('/reports') ? <Reports /> : <NoPermission />
  else if (p === '/admin/users') page = allowed('/admin') ? <Accounts /> : <NoPermission />
  else if (p === '/system') page = allowed('/system') ? <SystemStatus /> : <NoPermission />
  else if (p === '/docs') page = <Docs />
  else page = <NoPermission desc="找不到這個頁面。" />

  return (
    <Layout user={user}>
      <div key={p}>{page}</div>
    </Layout>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Routes />
      </SessionProvider>
    </ToastProvider>
  )
}
