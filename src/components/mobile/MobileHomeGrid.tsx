import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { useUser } from '@/context/user/UserContext';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useSettingsSafe } from '@/context/settings/SettingsContext';
import { getWorkflowMenuGroups, MenuGroup } from '@/navigation/menu';
import { useMemo } from 'react';
import { DEFAULT_MENU_PREFERENCES } from '@/types/user-preferences';

interface GridCard {
  id: string;
  title: string;
  icon: LucideIcon;
  path: string;
  isPinned?: boolean;
}

interface MobileHomeGridProps {
  className?: string;
  greeting?: string;
  userName?: string;
}

export function MobileHomeGrid({ className, greeting, userName }: MobileHomeGridProps) {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const { roles } = useAppContext();
  const { checkPermission, hasAnyRole, canManageRoles } = useAuthorization();
  const { isSuperAdmin } = useSuperAdmin();
  const settings = useSettingsSafe();
  
  const displayName = userName || currentUser?.name || 'User';
  const displayGreeting = greeting || getGreeting();

  const isAdmin = hasAnyRole(['admin']);
  const perms = useMemo(() => ({
    dashboard: true,
    projects: checkPermission('projects', 'read') || isAdmin || hasAnyRole(['ict']),
    mmp: checkPermission('mmp', 'read') || isAdmin || hasAnyRole(['ict']),
    monitoringPlan: checkPermission('mmp', 'read') || isAdmin || hasAnyRole(['ict']),
    siteVisits: checkPermission('site_visits', 'read') || isAdmin || hasAnyRole(['ict']),
    archive: checkPermission('reports', 'read') || isAdmin,
    fieldTeam: checkPermission('users', 'read') || isAdmin,
    fieldOpManager: checkPermission('site_visits', 'update') || isAdmin || hasAnyRole(['fom']),
    dataVisibility: checkPermission('reports', 'read') || isAdmin,
    reports: checkPermission('reports', 'read') || isAdmin,
    users: checkPermission('users', 'read') || isAdmin || hasAnyRole(['ict']),
    roleManagement: canManageRoles() || isAdmin,
    settings: checkPermission('settings', 'read') || isAdmin,
    financialOperations: checkPermission('finances', 'update') || checkPermission('finances', 'approve') || isAdmin || hasAnyRole(['financialAdmin']),
  }), [checkPermission, hasAnyRole, canManageRoles, isAdmin]);

  const visibleCards = useMemo(() => {
    const defaultRole = currentUser?.role || 'dataCollector';
    const menuPrefs = settings?.menuPreferences || DEFAULT_MENU_PREFERENCES;
    
    const menuGroups = getWorkflowMenuGroups(
      roles || [],
      defaultRole,
      perms,
      isSuperAdmin,
      menuPrefs
    );

    const cards: GridCard[] = [];
    menuGroups.forEach((group: MenuGroup) => {
      group.items.forEach(item => {
        cards.push({
          id: item.id,
          title: item.title,
          icon: item.icon,
          path: item.url,
          isPinned: item.isPinned
        });
      });
    });

    return cards.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });
  }, [roles, currentUser?.role, perms, isSuperAdmin, settings?.menuPreferences]);

  const handleCardPress = (card: GridCard) => {
    hapticPresets.buttonPress();
    navigate(card.path);
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="px-4 py-4">
        <p className="text-sm text-black/60 dark:text-white/60" data-testid="text-greeting">
          {displayGreeting},
        </p>
        <h1 className="text-xl font-bold text-black dark:text-white" data-testid="text-username">
          {displayName}
        </h1>
      </div>

      <div className="flex-1 px-3 pb-4 overflow-y-auto">
        <div className="grid grid-cols-3 gap-3">
          {visibleCards.map((card, index) => (
            <GridCardItem
              key={card.id}
              card={card}
              index={index}
              onPress={() => handleCardPress(card)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface GridCardItemProps {
  card: GridCard;
  index: number;
  onPress: () => void;
}

function GridCardItem({ card, index, onPress }: GridCardItemProps) {
  const Icon = card.icon;
  
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ 
        delay: index * 0.03,
        duration: 0.2,
        ease: 'easeOut'
      }}
      whileTap={{ scale: 0.95 }}
      onClick={onPress}
      className={cn(
        "flex flex-col items-center justify-center",
        "aspect-square rounded-xl",
        "bg-black dark:bg-white",
        "text-white dark:text-black",
        "shadow-sm",
        "transition-all duration-200",
        "active:shadow-none",
        "min-h-[90px]"
      )}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-center justify-center w-10 h-10 mb-2">
        <Icon className="w-7 h-7" strokeWidth={1.5} />
      </div>
      <span className="text-xs font-medium text-center px-1 leading-tight">
        {card.title}
      </span>
    </motion.button>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default MobileHomeGrid;
