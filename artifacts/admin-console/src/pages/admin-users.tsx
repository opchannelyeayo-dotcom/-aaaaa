import { useState } from "react";
import { Redirect } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  type AdminAccount,
  type AdminRole,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const ROLE_OPTIONS: { value: AdminRole; label: string; description: string }[] = [
  { value: "super_admin", label: "超級管理員", description: "全權編輯、發布、刪除、帳號管理" },
  { value: "reviewer", label: "內容審核員", description: "可編輯與審核內容，不可發布或刪除" },
  { value: "viewer", label: "只讀使用者", description: "僅能查詢資料與報表" },
];

export function AdminUsers() {
  const { username: currentUsername, role } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: listAdminUsers,
    enabled: role === "super_admin",
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "viewer" as AdminRole, displayName: "" });

  const createMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: () => {
      toast.success("已新增帳號");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setForm({ username: "", password: "", role: "viewer", displayName: "" });
      setShowForm(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "新增失敗"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Parameters<typeof updateAdminUser>[1] }) =>
      updateAdminUser(id, updates),
    onSuccess: () => {
      toast.success("已更新");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "更新失敗"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => {
      toast.success("已刪除帳號");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "刪除失敗"),
  });

  const handleCreate = () => {
    if (!form.username.trim()) {
      toast.error("帳號不可為空");
      return;
    }
    if (form.password.length < 8) {
      toast.error("密碼至少需 8 碼");
      return;
    }
    createMutation.mutate({
      username: form.username.trim(),
      password: form.password,
      role: form.role,
      displayName: form.displayName.trim() || null,
    });
  };

  if (role !== "super_admin") {
    return <Redirect to="/" />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">使用者管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            超級管理員可全權編輯與發布；內容審核員可審核與修正文案；只讀使用者僅能查詢資料與報表。
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4 mr-2" /> 新增帳號
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>新增帳號</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">帳號</label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">密碼（至少 8 碼）</label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">顯示名稱</label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">角色</label>
                <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Button disabled={createMutation.isPending} onClick={handleCreate}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              建立帳號
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {data?.users.map((user: AdminAccount) => (
          <Card key={user.id}>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{user.displayName || user.username}</span>
                  <span className="text-xs text-muted-foreground">@{user.username}</span>
                  <Badge variant={user.active ? "default" : "outline"}>
                    {user.active ? "啟用中" : "已停用"}
                  </Badge>
                  {user.username === currentUsername && <Badge variant="secondary">目前登入</Badge>}
                </div>
                <CardDescription>
                  {ROLE_OPTIONS.find((r) => r.value === user.role)?.description}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={user.role}
                  onChange={(e) =>
                    updateMutation.mutate({ id: user.id, updates: { role: e.target.value as AdminRole } })
                  }
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateMutation.mutate({ id: user.id, updates: { active: !user.active } })}
                >
                  {user.active ? "停用" : "啟用"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (!window.confirm(`確定要刪除帳號 ${user.username} 嗎？`)) return;
                    deleteMutation.mutate(user.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
