import type { AuthUser } from '~~/shared/domain/types'
import { isLocalAuthBypassUser } from '~~/shared/domain/auth'

const CACHED_USER_KEY = 'morti-auth-user'

interface OtpRequestResponse {
  otpId: string
  expiresAt: string
}

interface AuthResponse {
  user: AuthUser
}

function loadCachedUser(): AuthUser | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY)
    return raw ? JSON.parse(raw) as AuthUser : null
  }
  catch {
    return null
  }
}

function saveCachedUser(user: AuthUser | null) {
  if (!import.meta.client) return
  if (user) localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(CACHED_USER_KEY)
}

function isEmailVerified(user: AuthUser | null): boolean {
  return !!user && (user.verified === true || user.email_validated_at.length > 0)
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => loadCachedUser())
  const loading = useState<boolean>('auth-loading', () => false)
  const refreshStarted = useState<boolean>('auth-refresh-started', () => false)
  const ready = useState<boolean>('auth-ready', () => refreshStarted.value)

  const isAuthed = computed(() => !!user.value?.id)
  const isVerified = computed(() => isEmailVerified(user.value))
  const isLocalBypass = computed(() => isLocalAuthBypassUser(user.value))
  const isCloudAuthed = computed(() => isAuthed.value && isVerified.value && !isLocalBypass.value)

  async function refreshUser(): Promise<AuthUser | null> {
    loading.value = true
    ready.value = false
    try {
      const res = await $fetch<{ user: AuthUser | null }>('/api/auth/me')
      user.value = res.user
      saveCachedUser(res.user)
      return res.user
    }
    catch {
      user.value = null
      saveCachedUser(null)
      return null
    }
    finally {
      loading.value = false
      ready.value = true
    }
  }

  async function waitUntilReady(): Promise<void> {
    if (!import.meta.client || ready.value) return
    await new Promise<void>((resolve) => {
      const stop = watch(ready, (isReady) => {
        if (!isReady) return
        stop()
        resolve()
      }, { flush: 'sync' })
      if (ready.value) {
        stop()
        resolve()
      }
    })
  }

  if (import.meta.client && !refreshStarted.value) {
    refreshStarted.value = true
    void refreshUser()
  }

  async function requestOtp(email: string): Promise<OtpRequestResponse> {
    const trimmed = email.trim()
    if (!trimmed) throw new Error('Enter your email address.')
    return await $fetch<OtpRequestResponse>('/api/auth/otp/request', {
      method: 'POST',
      body: { email: trimmed },
    })
  }

  async function authWithOtp(otpId: string, code: string): Promise<AuthResponse> {
    const res = await $fetch<AuthResponse>('/api/auth/otp/verify', {
      method: 'POST',
      body: { otpId, code },
    })
    user.value = res.user
    ready.value = true
    saveCachedUser(res.user)
    return res
  }

  async function requestVerification(email: string) {
    return await requestOtp(email)
  }

  async function signOut() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    }
    finally {
      saveCachedUser(null)
      user.value = null
      ready.value = true
      await navigateTo('/')
    }
  }

  return {
    user,
    loading,
    ready,
    isAuthed,
    isVerified,
    isLocalBypass,
    isCloudAuthed,
    refreshUser,
    waitUntilReady,
    requestOtp,
    authWithOtp,
    requestVerification,
    signOut,
  }
}
