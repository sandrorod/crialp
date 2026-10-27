import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { LoginPage, LoginRedirect } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CompaniesPage } from '@/pages/CompaniesPage';
import { CompanyEditPage } from '@/pages/CompanyEditPage';
import { LandingPagesPage } from '@/pages/LandingPagesPage';
import { LandingPageEditorPage } from '@/pages/LandingPageEditorPage';
import { NewLandingPagePage } from '@/pages/NewLandingPagePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SalesPage } from '@/pages/SalesPage';
import { UsersPage } from '@/pages/UsersPage';
import { ClientLevelsPage } from '@/pages/ClientLevelsPage';
import { SearchCompaniesPage } from '@/pages/SearchCompaniesPage';
import { DirectoryPage } from '@/pages/DirectoryPage';
import { MySitesPage } from '@/pages/MySitesPage';
import { initMonitoring, rootErrorHandlers } from '@/lib/monitoring';
import { CrmLayout } from '@/pages/crm/CrmLayout';
import { CrmCompaniesPage } from '@/pages/crm/CrmCompaniesPage';
import { CrmCompanyPage } from '@/pages/crm/CrmCompanyPage';
import { CrmWhatsAppPage } from '@/pages/crm/CrmWhatsAppPage';
import { CrmPipelinePage } from '@/pages/crm/CrmPipelinePage';
import { CrmTasksPage } from '@/pages/crm/CrmTasksPage';
import { CrmConnectionPage } from '@/pages/crm/CrmConnectionPage';
import './index.css';

// O login fica em /lps; o resto do painel continua em /admin
const onLogin = /^\/lps\/?$/.test(window.location.pathname);

const router = onLogin
  ? createBrowserRouter([{ path: '*', element: <LoginPage /> }], { basename: '/lps' })
  : createBrowserRouter(
      [
        { path: '/login', element: <LoginRedirect /> },
        {
          element: <AdminLayout />,
          children: [
            { path: '/', element: <DashboardPage /> },
            { path: '/empresas', element: <CompaniesPage /> },
            { path: '/empresas/:id', element: <CompanyEditPage /> },
            { path: '/landing-pages', element: <LandingPagesPage /> },
            { path: '/landing-pages/:id', element: <LandingPageEditorPage /> },
            { path: '/nova', element: <NewLandingPagePage /> },
            { path: '/buscar', element: <SearchCompaniesPage /> },
            { path: '/dentmap', element: <DirectoryPage key="dentmap" source="dentmap" /> },
            { path: '/doctoralia', element: <DirectoryPage key="doctoralia" source="doctoralia" /> },
            { path: '/configuracoes', element: <SettingsPage /> },
            { path: '/vendas', element: <SalesPage /> },
            { path: '/subusuarios', element: <UsersPage /> },
            { path: '/niveis-cliente', element: <ClientLevelsPage /> },
            { path: '/meus-sites', element: <MySitesPage /> },
            {
              path: '/crm',
              element: <CrmLayout />,
              children: [
                { index: true, element: <CrmCompaniesPage /> },
                { path: 'empresas/:id', element: <CrmCompanyPage /> },
                { path: 'whatsapp', element: <CrmWhatsAppPage /> },
                { path: 'funil', element: <CrmPipelinePage /> },
                { path: 'tarefas', element: <CrmTasksPage /> },
                { path: 'conexao', element: <CrmConnectionPage /> },
              ],
            },
          ],
        },
      ],
      { basename: '/admin' },
    );

initMonitoring();

createRoot(document.getElementById('root')!, rootErrorHandlers()).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors closeButton />
    </AuthProvider>
  </StrictMode>,
);
