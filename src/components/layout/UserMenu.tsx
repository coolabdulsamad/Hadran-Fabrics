import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ChevronDown, LogOut, UserRound, ArrowLeftRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useSection } from "@/hooks/use-section";
import { RoleBadge } from "@/components/common/RoleBadge";
import { initials } from "@/lib/format";

/** Top-right user chip: identity, profile link and sign out. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const { canSwitch } = useSection();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Signed out. See you soon.");
      navigate("/login", { replace: true });
    } catch {
      toast.error("Could not sign out cleanly — local session cleared.");
      navigate("/login", { replace: true });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-full border border-transparent py-1 pl-1 pr-2 transition hover:border-gold-500/40 hover:bg-gold-50">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.fullName} className="h-9 w-9 rounded-full object-cover ring-1 ring-gold-500/40" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-gold-400">
              {initials(user.fullName)}
            </span>
          )}
          <span className="hidden text-left sm:block">
            <span className="block max-w-[140px] truncate text-sm font-semibold leading-tight text-navy-900">
              {user.fullName}
            </span>
            <span className="block text-[10px] uppercase tracking-wider text-gold-600">
              {user.staffCode ?? user.username}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-navy-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 border-gold-500/30">
        <DropdownMenuLabel className="flex flex-col gap-1.5 py-3">
          <span className="text-sm font-semibold text-navy-900">{user.fullName}</span>
          <span className="text-xs font-normal text-muted-foreground">@{user.username}</span>
          <RoleBadge role={user.role} className="mt-1 w-fit" />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2">
          <UserRound className="h-4 w-4 text-gold-600" />
          My Profile
        </DropdownMenuItem>
        {canSwitch && (
          <DropdownMenuItem onClick={() => navigate("/sections")} className="cursor-pointer gap-2">
            <ArrowLeftRight className="h-4 w-4 text-gold-600" />
            Switch Section
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer gap-2 text-red-600 focus:bg-red-50 focus:text-red-700"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
