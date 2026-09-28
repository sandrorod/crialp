import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CompaniesPage } from '@/pages/CompaniesPage';
import { CompanyEditPage } from '@/pages/CompanyEditPage';
import { LandingPagesPage } from '@/pages/LandingPagesPage';
import { LandingPageEditorPage } from '@/pages/LandingPageEditorPage';
import { NewLandingPagePage } from '@/pages/NewLandingPagePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SalesPage } from '@/pages/SalesPage';
import { UsersPage } from '@/pages/UsersPage';
import './index.css';

const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      element: <AdminLayout />,
      children: [
        { path: '/', element: <DashboardPage /> },
        { path: '/empresas', element: <CompaniesPage /> },
        { path: '/empresas/:id', element: <CompanyEditPage /> },
        { path: '/landing-pages', element: <LandingPagesPage /> },
        { path: '/landing-pages/:id', element: <LandingPageEditorPage /> },
        { path: '/nova', element: <NewLandingPagePage /> },
        { path: '/configuracoes', element: <SettingsPage /> },
        { path: '/vendas', element: <SalesPage /> },
        { path: '/subusuarios', element: <UsersPage /> },
      ],
    },
  ],
  { basename: '/admin' },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors closeButton />
    </AuthProvider>
  </StrictMode>,
);
