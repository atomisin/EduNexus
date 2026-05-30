import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

export const ProtectedRoute = ({ 
  children, 
  allowedRoles 
}: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth()
  
  if (isLoading && !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-subtle px-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-sm font-medium text-foreground">Restoring your learning workspace</p>
          <p className="text-xs leading-5 text-muted-foreground">
            EduNexus is reconnecting to your session so your dashboard can open cleanly.
          </p>
        </div>
      </div>
    )
  }
  
  if (!user) {
    return <Navigate to="/login" replace />
  }
  
  if (allowedRoles && (!user.role || !allowedRoles.includes(user.role))) {
    return <Navigate to="/" replace />
  }
  
  return <>{children}</>
}
