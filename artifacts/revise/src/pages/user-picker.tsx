import { useUser, USERS, type AppUser } from "@/contexts/user-context";

const AVATAR_COLORS = [
  { bg: "bg-violet-500", ring: "ring-violet-400", light: "bg-violet-100 text-violet-700" },
  { bg: "bg-sky-500",    ring: "ring-sky-400",    light: "bg-sky-100 text-sky-700" },
  { bg: "bg-emerald-500",ring: "ring-emerald-400",light: "bg-emerald-100 text-emerald-700" },
];

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function UserPicker() {
  const { setUser } = useUser();

  function pick(user: AppUser) {
    setUser(user);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Who's studying?</h1>
        <p className="text-muted-foreground mt-3 text-base">Pick your profile to open your library.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6">
        {USERS.map((user, i) => {
          const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
          return (
            <button
              key={user.id}
              onClick={() => pick(user)}
              className="group flex flex-col items-center gap-4 p-6 rounded-2xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-150 w-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div
                className={`w-20 h-20 rounded-full ${color.bg} flex items-center justify-center text-white text-2xl font-bold ring-4 ring-transparent group-hover:${color.ring} group-focus-visible:${color.ring} transition-all`}
              >
                {initials(user.name)}
              </div>
              <span className="text-base font-semibold text-foreground">{user.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
