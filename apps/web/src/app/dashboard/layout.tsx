import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { SIDEBAR_COLLAPSED_COOKIE, SIDEBAR_FAVORITES_COOKIE, parseCollapsedSections, parseFavorites } from '@/lib/sidebar';
import BalanceBadge from '@/components/BalanceBadge';
import UpdateBanner from '@/components/UpdateBanner';
import GridTaskCenter from '@/components/GridTaskCenter';
import ProjectSync from '@/components/ProjectSync';
import AccountMenu from '@/components/AccountMenu';
import { MobileNavButton, MobileNavProvider } from '@/components/MobileNav';
import { authEnabled } from '@/lib/auth-config';
import { allowedProjects, requireUser, resolveProjectForUser, subscriberLockedOut } from '@/lib/access';
import BudgetBanner from '@/modules/custos/BudgetBanner';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The middleware already rejects anonymous requests; this is the authoritative check.
  const user = await requireUser();
  const accountEmail = authEnabled() ? user.email : null;
  const cookieStore = await cookies();
  const collapsed = parseCollapsedSections(cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value);
  const favorites = parseFavorites(cookieStore.get(SIDEBAR_FAVORITES_COOKIE)?.value);
  // Each user has their own active business; subscribers only see the ones linked to their account.
  const activeProject = resolveProjectForUser(user);
  if (!activeProject) redirect('/sem-acesso');
  if (subscriberLockedOut(user, activeProject.id)) redirect('/assinatura-suspensa');
  const projects = allowedProjects(user);

  return (
    <MobileNavProvider>
    <div className="relative flex h-dvh overflow-hidden bg-[var(--nexo-bg)] text-[var(--nexo-text)] font-sans">
      <div className="nexo-beams" />
      <Sidebar initialCollapsed={collapsed} initialFavorites={favorites} projects={projects} activeProject={activeProject} role={user.role} />
      <ProjectSync projectId={activeProject.id} projectName={activeProject.name} />
      {/* isolate: keeps maps (Leaflet panes use z-index 400+) and popovers below the mobile drawer */}
      <div className="relative isolate flex-1 flex flex-col min-w-0 overflow-hidden">
        <UpdateBanner />
        <header className="h-14 border-b border-[var(--nexo-border)] bg-[rgba(3,5,8,.5)] backdrop-blur-xl flex items-center justify-end px-4 sm:px-6 shrink-0 gap-2 sm:gap-3">
          <MobileNavButton />
          <GridTaskCenter />
          {/* The DataForSEO balance is the platform's credit, not the subscriber's. */}
          {user.role === 'admin' && <BalanceBadge />}
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
