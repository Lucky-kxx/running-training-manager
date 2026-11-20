import { useGetMyCoachedAthletesQuery } from '@/api/athlete';
import logoDarkSrc from '@/assets/logos/logo_dark.svg';
import logoWhiteSrc from '@/assets/logos/logo_white.svg';
import { CoachAthleteNav } from '@/components/coach-nav/coach-athlete-nav';
import { FinderButton } from '@/components/finder/finder-button';
import {
  PersonalThemePhoto,
  usePersonalTheme,
} from '@/components/personal-theme/personal-theme-provider';
import { contrastingText } from '@/components/personal-theme/photo-theme';
import { CollapsedAthleteMenu } from '@/components/sidebar/collapsed-athlete-menu';
import { NavMain } from '@/components/sidebar/nav-main';
import { NavUser } from '@/components/sidebar/nav-user';
import { SpaceSwitcher } from '@/components/sidebar/space-switcher';
import { SupportReminder } from '@/components/sidebar/support-reminder';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { useSpaceContext } from '@/contexts/space';
import { m } from '@/paraglide/messages';
import { getPath } from '@/routes/paths';
import {
  Activity,
  Calendar,
  CogIcon,
  MedalIcon,
  MessageCircle,
  NotebookPen,
  PieChart,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { ComponentProps, MouseEventHandler, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { UserRole } from '@openathlete/shared';

export function AppSidebar({
  onOpenCoach,
  ...props
}: ComponentProps<typeof Sidebar> & {
  onOpenCoach?: MouseEventHandler<HTMLButtonElement>;
}) {
  const { space } = useSpaceContext();
  const { data: athletes } = useGetMyCoachedAthletesQuery();
  const { resolvedTheme } = useTheme();
  const theme = usePersonalTheme()?.current;
  const darkSidebar = theme?.active
    ? contrastingText(theme.design.sidebar) === '#ffffff'
    : resolvedTheme === 'dark';
  const { isMobile, setOpenMobile, state } = useSidebar();
  const showAthleteSelector =
    space === 'COACH' && state === 'collapsed' && !isMobile;

  const handleLogoClick = () => {
    // Close sidebar on mobile when clicking logo
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  type SidebarItem = Parameters<typeof NavMain>[0]['items'][number];
  const sidebarNavigation = useMemo<SidebarItem[]>(() => {
    const aiSettings: SidebarItem = {
      title: m.ai_settings_tab(),
      url: `${getPath(['dashboard', 'settings'])}?tab=ai`,
      icon: Sparkles,
    };

    if (space === 'COACH') {
      const baseItems: SidebarItem[] = [
        {
          title: m.dashboard(),
          url: getPath(['dashboard', 'coach']),
          icon: PieChart,
          spaces: ['COACH'] as UserRole[],
        },
        {
          title: m.messages(),
          url: getPath(['dashboard', 'messages']),
          icon: MessageCircle,
          spaces: ['COACH'] as UserRole[],
        },
        aiSettings,
        {
          title: m.coach_notes(),
          url: getPath(['dashboard', 'notes']),
          icon: NotebookPen,
          spaces: ['COACH'] as UserRole[],
        },
      ];
      const athleteGroups: SidebarItem[] = (athletes || []).map((athlete) => ({
        title: athlete.user?.firstName + ' ' + athlete.user?.lastName,
        icon: User,
        spaces: ['COACH'] as UserRole[],
        items: [
          // {
          //   title: m.summary(),
          //   url: getPath(['dashboard', 'summary']) + `/${athlete.athleteId}`,
          //   icon: FileText,
          // },
          {
            title: m.calendar(),
            url: getPath(['dashboard', 'calendar']) + `/${athlete.athleteId}`,
            icon: Calendar,
          },
          {
            title: m.statistics(),
            url: getPath(['dashboard', 'statistics']) + `/${athlete.athleteId}`,
            icon: PieChart,
          },
          {
            title: m.records(),
            url: getPath(['dashboard', 'records']) + `/${athlete.athleteId}`,
            icon: MedalIcon,
          },
          {
            title: m.metrics(),
            url: getPath(['dashboard', 'metrics']) + `/${athlete.athleteId}`,
            icon: Activity,
          },
          {
            title: m.coach_notes(),
            url: getPath(['dashboard', 'notes']) + `/${athlete.athleteId}`,
            icon: NotebookPen,
          },
          {
            title: m.settings(),
            url: getPath(['dashboard', 'settings']) + `/${athlete.athleteId}`,
            icon: CogIcon,
          },
        ],
      })) as SidebarItem[];
      return [...baseItems, ...athleteGroups];
    }

    return [
      {
        title: m.calendar(),
        url: getPath(['dashboard', 'calendar']),
        icon: Calendar,
        spaces: ['ATHLETE'] as UserRole[],
      },
      {
        title: m.statistics(),
        url: getPath(['dashboard', 'statistics']),
        icon: PieChart,
        spaces: ['ATHLETE'] as UserRole[],
      },
      {
        title: m.records(),
        url: getPath(['dashboard', 'records']),
        icon: MedalIcon,
        spaces: ['ATHLETE'] as UserRole[],
      },
      {
        title: m.metrics(),
        url: getPath(['dashboard', 'metrics']),
        icon: Activity,
        spaces: ['ATHLETE'] as UserRole[],
      },
      {
        title: m.messages(),
        url: getPath(['dashboard', 'messages']),
        icon: MessageCircle,
        spaces: ['ATHLETE'] as UserRole[],
      },
      aiSettings,
      // Coaches would otherwise only find their dashboard in the space
      // switcher
      ...(athletes?.length
        ? [
            {
              title: m.coach_dashboard_nav(),
              url: getPath(['dashboard', 'coach']),
              icon: Users,
              spaces: ['ATHLETE'] as UserRole[],
            },
          ]
        : []),
    ];
  }, [athletes, space]);

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 px-0.5 py-1 w-full">
          <Link
            to={getPath(['dashboard'])}
            onClick={handleLogoClick}
            className="flex items-center justify-center gap-2 w-full min-w-0"
          >
            <img
              src={darkSidebar ? logoWhiteSrc : logoDarkSrc}
              alt={m.ui_logo_alt()}
              className="h-10 w-10"
            />
          </Link>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label={m.ui_close()}
              onClick={() => setOpenMobile(false)}
            >
              <X className="size-5" />
            </Button>
          )}
        </div>
        <SpaceSwitcher />
        <PersonalThemePhoto placement="sidebar" />
      </SidebarHeader>
      <SidebarContent>
        <FinderButton />
        {/* Athletes have their own list: one line each, with a search */}
        <NavMain items={sidebarNavigation.filter((item) => !item.items)}>
          {onOpenCoach && (
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-haspopup="dialog"
                className={isMobile ? 'min-h-11 text-base' : undefined}
                onClick={onOpenCoach}
                tooltip={m.training_coach_title()}
              >
                <Sparkles />
                <span>{m.training_coach_title()}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </NavMain>
        {showAthleteSelector ? (
          <CollapsedAthleteMenu
            athletes={sidebarNavigation.filter((item) => item.items)}
          />
        ) : (
          space === 'COACH' && (
            <CoachAthleteNav
              athletes={(athletes ?? []).map((athlete) => ({
                athleteId: athlete.athleteId,
                name: `${athlete.user?.firstName ?? ''} ${athlete.user?.lastName ?? ''}`.trim(),
              }))}
            />
          )
        )}
      </SidebarContent>
      <SidebarFooter>
        <SupportReminder />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
