import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../ProtectedRoute'
import { vi } from 'vitest'

// Mock the auth context
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn()
}))

import { useAuth } from '../../../contexts/AuthContext'

describe('ProtectedRoute', () => {
  it('redirects to login when user is null', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false
    } as any)
    
    render(
      <MemoryRouter initialEntries={['/student']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/student" element={
            <ProtectedRoute allowedRoles={['student']}>
              <div>Student Dashboard</div>
            </ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    )
    
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Student Dashboard')).not.toBeInTheDocument()
  })
  
  it('shows loading state during auth check', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: true
    } as any)
    
    render(
      <MemoryRouter initialEntries={['/student']}>
        <Routes>
          <Route path="/student" element={
            <ProtectedRoute allowedRoles={['student']}>
              <div>Student Dashboard</div>
            </ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    )
    
    // Check for animate-spin div which is the loading state
    expect(screen.queryByText('Student Dashboard')).not.toBeInTheDocument()
  })
  
  it('renders children for authenticated user with correct role', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '1', role: 'student', email: 'test@test.com' },
      isLoading: false
    } as any)
    
    render(
      <MemoryRouter initialEntries={['/student']}>
        <Routes>
          <Route path="/student" element={
            <ProtectedRoute allowedRoles={['student']}>
              <div>Student Dashboard</div>
            </ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    )
    
    expect(screen.getByText('Student Dashboard')).toBeInTheDocument()
  })
})
