import { ClerkProvider } from '@clerk/clerk-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined

// TODO(1.3-B): replace the placeholder VITE_CLERK_PUBLISHABLE_KEY with the
// real Clerk key and remove this conditional once auth is required.
const useClerk =
  PUBLISHABLE_KEY !== undefined && !PUBLISHABLE_KEY.includes('PLACEHOLDER')

const root = createRoot(document.getElementById('root')!)

if (useClerk && PUBLISHABLE_KEY) {
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    </StrictMode>,
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
