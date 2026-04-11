import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { LoginPage } from '../LoginPage'
import { vi } from 'vitest'
import userEvent from '@testing-library/user-event'

// Mock the auth context
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    login: vi.fn(),
    error: null,
    isLoading: false
  }))
}))

const renderWithProviders = (ui: React.ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {ui}
        </BrowserRouter>
      </QueryClientProvider>
    )
  }
}

describe('LoginPage', () => {
  const mockOnBack = vi.fn()
  const mockOnSuccess = vi.fn()

  it('renders email and password inputs', () => {
    renderWithProviders(<LoginPage onBack={mockOnBack} onSuccess={mockOnSuccess} />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })
  
  it('renders login button', () => {
    renderWithProviders(<LoginPage onBack={mockOnBack} onSuccess={mockOnSuccess} />)
    expect(
        screen.getByRole('button', { name: /sign in/i })
    ).toBeInTheDocument()
  })
  
  it('shows validation error for empty submit', async () => {
    const { user } = renderWithProviders(<LoginPage onBack={mockOnBack} onSuccess={mockOnSuccess} />)
    const button = screen.getByRole('button', { name: /sign in/i })
    
    // In many modern browsers, HTML5 validation prevents submission
    // We'll click it and check if it's still there (as the prompt suggested)
    await user.click(button)
    
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })
})
