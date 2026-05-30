import { useQueryClient } from "@tanstack/react-query";
import { useUser, USERS, type AppUser } from "@/contexts/user-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Check, LogOut } from "lucide-react";

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-sky-500",
  "bg-emerald-500",
];

export function UserSwitcher() {
  const { user, setUser, clearUser } = useUser();
  const queryClient = useQueryClient();

  if (!user) return null;

  function switchUser(next: AppUser) {
    if (next.id === user!.id) return;
    setUser(next);
    queryClient.invalidateQueries();
  }

  function handleSignOut() {
    queryClient.clear();
    clearUser();
  }

  const colorClass = AVATAR_COLORS[(user.id - 1) % AVATAR_COLORS.length];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 h-9 pr-3 pl-2">
          <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 ${colorClass}`}>
            {initials(user.name)}
          </span>
          <span className="text-sm font-medium">{user.name}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Switch profile</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {USERS.map((u, i) => (
          <DropdownMenuItem
            key={u.id}
            onClick={() => switchUser(u)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
              {initials(u.name)}
            </span>
            <span className="flex-1">{u.name}</span>
            {u.id === user.id && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="flex items-center gap-2 cursor-pointer text-muted-foreground"
        >
          <LogOut className="w-4 h-4" />
          <span>Back to profiles</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
