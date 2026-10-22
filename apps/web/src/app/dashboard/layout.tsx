import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { SIDEBAR_COLLAPSED_COOKIE, SIDEBAR_FAVORITES_COOKIE, parseCollapsedSections, parseFavorites } from '@/lib/sidebar';
import BalanceBadge from '@/components/BalanceBadge';
import UpdateBanner from '@/components/UpdateBanner';
import GridTaskCenter from '@/components/GridTaskCenter';
import ProjectSync from '@/components/ProjectSync';
import AccountMenu from '@/components/AccountMenu';
import { MobileNavButton, MobileNavProvider } from '@/components/MobileNav';
import { getSession } from '@/lib/auth';
import { authEnabled } from '@/lib/auth-config';
import { getActiveProject, getProjects } from '@/lib/db';
import BudgetBanner from '@/modules/custos/BudgetBanner';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The middleware already rejects anonymous requests; this is the authoritative check and gives us the email.
  let accountEmail: string | null = null;
  if (authEnabled()) {
    const session = await getSession(await headers());
    if (!session) redirect('/login');
    accountEmail = session.user.email;
  }
  const cookieStore = await cookies();
  const collapsed = parseCollapsedSections(cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value);
  const favorites = parseFavorites(cookieStore.get(SIDEBAR_FAVORITES_COOKIE)?.value);
  const activeProject = getActiveProject();
  const projects = getProjects();

  return (
    <MobileNavProvider>
    <div className="relative flex h-dvh overflow-hidden bg-[var(--nexo-bg)] text-[var(--nexo-text)] font-sans">
      <div className="nexo-beams" />
      <Sidebar initialCollapsed={collapsed} initialFavorites={favorites} projects={projects} activeProject={activeProject} />
      <ProjectSync projectId={activeProject.id} projectName={activeProject.name} />
      {/* isolate: keeps maps (Leaflet panes use z-index 400+) and popovers below the mobile drawer */}
      <div className="relative isolate flex-1 flex flex-col min-w-0 overflow-hidden">
        <UpdateBanner />
        <header className="h-14 border-b border-[var(--nexo-border)] bg-[rgba(3,5,8,.5)] backdrop-blur-xl flex items-center justify-end px-4 sm:px-6 shrink-0 gap-2 sm:gap-3">
          <MobileNavButton />
          <GridTaskCenter />
          <BalanceBadge />
          {accountEmail && <AccountMenu email={accountEmail} />}
        </header>
        <BudgetBanner projectId={activeProject.id} />

        <div className="flex-1 overflow-hidden">
          <main className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
    </MobileNavProvider>
  );
}
