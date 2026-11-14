import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StudioShell } from "@/components/StudioShell";
import { Input } from "@/components/ui/input";
import { api, errMsg } from "@/lib/api";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", designer: "Desainer", client: "Klien", pending: "Menunggu" };
const selectCls = "h-10 border border-paper/15 bg-ink px-3 text-sm text-paper outline-none focus:border-brass";

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("client");

  const load = async () => {
    try {
      const [u, i] = await Promise.all([api.get("/users"), api.get("/invites")]);
      setUsers(u.data.users);
      setRoles(u.data.roles);
      setInvites(i.data);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  useEffect(() => {
    load();
  }, []);

  const changeRole = async (uid: string, r: string) => {
    try {
      await api.patch(`/users/${uid}/role`, { role: r });
      toast.success("Peran diperbarui");
    } catch (e) {
      toast.error(errMsg(e));
    }
    load();
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/invites", { email, role });
      setEmail("");
      toast.success("Email didaftarkan");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const removeInvite = async (em: string) => {
    await api.delete(`/invites/${encodeURIComponent(em)}`);
    load();
  };

  return (
    <StudioShell title="Tim & Klien">
      <section className="mb-16 max-w-3xl">
        <p className="eyebrow mb-3 text-brass">Daftarkan email</p>
        <p className="mb-6 text-sm text-paper/55">Orang dengan email ini langsung mendapat peran yang dipilih saat pertama kali masuk. Klien lalu dihubungkan ke proyek di pengaturan proyek.</p>
        <form onSubmit={invite} className="flex flex-col gap-3 sm:flex-row">
          <Input type="email" required placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 flex-1" data-testid="invite-email-input" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls} data-testid="invite-role-select">
            {roles.filter((r) => r !== "pending").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <button className="eyebrow h-10 bg-brass px-6 text-ink transition-opacity hover:opacity-90" data-testid="invite-submit-btn">Daftarkan</button>
        </form>
        <div className="mt-6 divide-y divide-paper/10">
          {invites.map((i) => (
            <div key={i.email} className="flex items-center justify-between py-3 text-sm" data-testid={`invite-row-${i.email}`}>
              <span>{i.email}</span>
              <span className="flex items-center gap-4">
                <span className="eyebrow text-paper/45">{ROLE_LABEL[i.role]}</span>
                <button onClick={() => removeInvite(i.email)} className="text-paper/40 transition-colors hover:text-red-400" data-testid={`invite-delete-${i.email}`}><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl">
        <p className="eyebrow mb-6 text-brass">Pengguna yang sudah masuk</p>
        <div className="divide-y divide-paper/10 border-y border-paper/10">
          {users.map((u) => (
            <div key={u.user_id} className="grid items-center gap-3 py-4 sm:grid-cols-[1fr_auto]" data-testid={`user-row-${u.user_id}`}>
              <div>
                <p className="text-sm">{u.name || u.email}</p>
                <p className="text-xs text-paper/45">{u.email}</p>
              </div>
              <select value={u.role} onChange={(e) => changeRole(u.user_id, e.target.value)} className={selectCls} data-testid={`user-role-select-${u.user_id}`}>
                {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>
    </StudioShell>
  );
}
