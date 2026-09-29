// S01 登入：只提供企業 SSO 登入，不在平台內設密碼（實際身分系統待 IT 確認，D-02）。
// 示範環境以「選擇公司帳號」模擬 SSO 回傳的身分。

import { useState } from 'react'
import { ApiFailure } from '../api/client.ts'
import { useQuery } from '../api/live.ts'
import { ROLE_LABEL } from '../domain/rules.ts'
import type { UserRef } from '../domain/types.ts'
import { Avatar, Button } from '../ui/kit.tsx'
import { navigate, useRoute } from '../ui/router.tsx'
import { useSession } from '../ui/session.tsx'

export function Login() {
  const { login, logoutReason } = useSession()
  const route = useRoute()
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const accounts = useQuery<(UserRef & { email: string })[]>(picking ? '/api/auth/accounts' : null)

  const choose = async (u: UserRef) => {
    setBusy(u.id)
    setError('')
    try {
      await login(u.id)
      // 若由通知連結進入，登入後回到原本要看的頁面（S01 註 3）
      const back = route.query.returnTo
      navigate(back && !back.startsWith('/login') ? back.split('?')[0] : u.role === 'Admin' ? '/admin/users' : '/', back?.includes('?') ? Object.fromEntries(new URLSearchParams(back.split('?')[1])) : undefined)
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : '登入失敗，請稍後再試')
      setPicking(false)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card" data-testid="login">
        <div className="login-mark">需</div>
        <h1>需求管理平台</h1>
        <p className="muted" style={{ margin: '6px 0 28px' }}>
          集中提交與追蹤產品需求
        </p>

        {logoutReason && !error && (
          <div className="banner neutral" style={{ marginBottom: 16, textAlign: 'left' }} role="status">
            {logoutReason}
          </div>
        )}
        {error && (
          <div className="banner danger" style={{ marginBottom: 16, textAlign: 'left' }} role="alert" data-testid="login-error">
            <div>
              <b>{error}</b>
              <div className="small">如有疑問請聯繫你的主管或 IT 服務台。</div>
            </div>
          </div>
        )}

        {!picking ? (
          <Button tone="primary" size="lg" block onClick={() => setPicking(true)} data-testid="sso-login">
            使用公司帳號登入
          </Button>
        ) : (
          <div className="stack" style={{ textAlign: 'left' }}>
            <div className="small muted">模擬企業 SSO：請選擇登入身分（正式環境將導向公司身分系統）</div>
            <div className="account-list" data-testid="account-list">
              {accounts.data === undefined && <div className="card-body muted">載入帳號…</div>}
              {accounts.data?.map(u => (
                <button key={u.id} onClick={() => choose(u)} disabled={!!busy} data-testid={`account-${u.id}`}>
                  <Avatar name={u.name} size="sm" />
                  <span style={{ flex: 1 }}>
                    <b>{u.name}</b>
                    <span className="small muted" style={{ display: 'block' }}>
                      {u.email}
                    </span>
                  </span>
                  <span className="chip gray">
                    {ROLE_LABEL[u.role]}
                    {u.manager ? '主管' : ''}
                  </span>
                  {u.status === '停用' && <span className="chip" style={{ background: '#fee4e2', color: '#b42318' }}>已停用</span>}
                </button>
              ))}
            </div>
            <Button tone="ghost" onClick={() => setPicking(false)}>
              取消
            </Button>
          </div>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '28px 0 16px' }} />
        <p className="small muted" style={{ margin: 0 }}>
          僅限公司內部員工使用
          <br />
          帳號或權限問題請聯繫 IT 服務台（分機 1234）
        </p>
      </div>
    </div>
  )
}
