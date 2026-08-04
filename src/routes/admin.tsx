import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Calendar,
  CreditCard,
  DollarSign,
  History,
  LogOut,
  Plus,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import logo from "@/assets/bulk-bun-logo.jpeg";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createEmployeeFn,
  createExpenseFn,
  deleteEmployeeFn,
  deleteExpenseFn,
  getAdminMetricsFn,
  getAttendanceFn,
  getSalaryTransactionsFn,
  listEmployeesFn,
  listExpensesFn,
  logAttendanceFn,
  logSalaryTransactionFn,
} from "@/lib/admin.functions";
import { createUserFn, listUsersFn, toggleUserFn } from "@/lib/auth.functions";
import { useAuth } from "@/lib/use-auth";
import { EGP } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "لوحة الإدارة | Bulk Bun POS" },
      { name: "description", content: "لوحة الإدارة والمتابعة المالية للمطعم." },
    ],
  }),
  component: () => (
    <AuthGuard allowedRoles={["admin"]}>
      <AdminDashboard />
    </AuthGuard>
  ),
});

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const CATEGORY_LABELS = {
  rent: "الإيجار",
  utilities: "المرافق (غاز/كهرباء/مياه)",
  raw_materials: "خامات ومواد غذائية",
  marketing: "التسويق والدعاية",
  maintenance: "الصيانة والأعطال",
  salaries: "الرواتب والسلف",
  misc: "مصاريف أخرى نثرية",
};

const PAYMENT_LABELS = {
  cash: "كاش",
  vodafone: "فودافون كاش",
  instapay: "انستا باي",
  visa: "فيزا",
};

interface AdminMetrics {
  today: {
    sales: number;
    ordersCount: number;
    expenses: number;
    wasteCount: number;
    netProfit: number;
  };
  paymentMethods: Array<{ payment_method: string; value: number }>;
  salesTrend: Array<{ date: string; sales: number; cost: number }>;
  peakHours: Array<{ hour: string; value: number }>;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  salary_type: "monthly" | "daily" | "hourly";
  base_salary: number;
  active: number;
  created_at: string;
}

interface AttendanceLog {
  id: string;
  employee_id: string;
  date: string;
  status: "present" | "absent" | "excused";
  hours: number;
}

interface SalaryTransaction {
  id: string;
  employee_id: string;
  employee_name: string;
  amount: number;
  type: "advance" | "bonus" | "deduction" | "payout";
  date: string;
  notes: string | null;
}

interface Expense {
  id: string;
  category:
    "rent" | "utilities" | "raw_materials" | "marketing" | "maintenance" | "salaries" | "misc";
  amount: number;
  description: string | null;
  date: string;
}

interface UserAccount {
  id: string;
  username: string;
  role: "admin" | "cashier";
  name: string;
  active: number;
  created_at: string;
}

import { useCallback } from "react";

function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // استدعاء دوال السيرفر
  const fetchMetrics = useServerFn(getAdminMetricsFn);
  const fetchEmployees = useServerFn(listEmployeesFn);
  const addEmployee = useServerFn(createEmployeeFn);
  const removeEmployee = useServerFn(deleteEmployeeFn);

  const fetchAttendance = useServerFn(getAttendanceFn);
  const submitAttendance = useServerFn(logAttendanceFn);

  const fetchSalaryTx = useServerFn(getSalaryTransactionsFn);
  const addSalaryTx = useServerFn(logSalaryTransactionFn);

  const fetchExpenses = useServerFn(listExpensesFn);
  const addExpense = useServerFn(createExpenseFn);
  const removeExpense = useServerFn(deleteExpenseFn);

  const fetchUsers = useServerFn(listUsersFn);
  const addUser = useServerFn(createUserFn);
  const toggleUser = useServerFn(toggleUserFn);

  // الحالات المحلية
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [activeTab, setActiveTab] = useState("analytics");
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [salaryTxs, setSalaryTxs] = useState<SalaryTransaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // حضور اليوم
  const [attDate, setAttDate] = useState(new Date().toISOString().split("T")[0]!);

  // مدخلات النماذج
  const [newEmp, setNewEmp] = useState({ name: "", role: "", salaryType: "daily", baseSalary: "" });
  const [newTx, setNewTx] = useState({ employeeId: "", amount: "", type: "payout", notes: "" });
  const [newExp, setNewExp] = useState({ category: "misc", amount: "", description: "" });
  const [newUser, setNewUser] = useState({ name: "", username: "", password: "", role: "cashier" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [m, e, s, ex, u] = await Promise.all([
        fetchMetrics({}),
        fetchEmployees({}),
        fetchSalaryTx({}),
        fetchExpenses({}),
        fetchUsers({}),
      ]);
      setMetrics(m);
      setEmployees(e);
      setSalaryTxs(s);
      setExpenses(ex);
      setUsersList(u);
    } catch (err: unknown) {
      console.error("Failed to load admin dashboard data:", err);
      const error = err as Error;
      toast.error(error.message || "تعذر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [fetchMetrics, fetchEmployees, fetchSalaryTx, fetchExpenses, fetchUsers]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // تحميل الحضور عند تغيير التاريخ
  useEffect(() => {
    const loadAtt = async () => {
      try {
        const att = await fetchAttendance({ data: { date: attDate } });
        setAttendance(att);
      } catch (err) {
        setAttendance([]);
      }
    };
    void loadAtt();
  }, [attDate, fetchAttendance]);

  // تسليم النماذج
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmp.name.trim() || !newEmp.role.trim() || !newEmp.baseSalary) {
      toast.error("برجاء ملء جميع الحقول المطلوبة");
      return;
    }
    try {
      await addEmployee({
        data: {
          name: newEmp.name.trim(),
          role: newEmp.role.trim(),
          salaryType: newEmp.salaryType as "monthly" | "daily" | "hourly",
          baseSalary: Number(newEmp.baseSalary),
        },
      });
      toast.success("تم تسجيل الموظف بنجاح");
      setNewEmp({ name: "", role: "", salaryType: "daily", baseSalary: "" });
      void loadData();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "تعذر تسجيل الموظف");
    }
  };

  const handleAddSalaryTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTx.employeeId || !newTx.amount) {
      toast.error("برجاء ملء جميع الحقول");
      return;
    }
    try {
      await addSalaryTx({
        data: {
          employeeId: newTx.employeeId,
          amount: Number(newTx.amount),
          type: newTx.type as "advance" | "bonus" | "deduction" | "payout",
          notes: newTx.notes.trim() || undefined,
        },
      });
      toast.success("تم تسجيل العملية المالية");
      setNewTx({ employeeId: "", amount: "", type: "payout", notes: "" });
      void loadData();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "فشلت العملية");
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExp.amount) {
      toast.error("أدخل المبلغ");
      return;
    }
    try {
      await addExpense({
        data: {
          category: newExp.category as
            | "rent"
            | "utilities"
            | "raw_materials"
            | "marketing"
            | "maintenance"
            | "salaries"
            | "misc",
          amount: Number(newExp.amount),
          description: newExp.description.trim() || undefined,
        },
      });
      toast.success("تم تسجيل المصروف");
      setNewExp({ category: "misc", amount: "", description: "" });
      void loadData();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "فشلت العملية");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name.trim() || !newUser.username.trim() || !newUser.password.trim()) {
      toast.error("ملء جميع الحقول مطلوب");
      return;
    }
    try {
      await addUser({
        data: {
          name: newUser.name.trim(),
          username: newUser.username.trim().toLowerCase(),
          password: newUser.password.trim(),
          role: newUser.role as "admin" | "cashier",
        },
      });
      toast.success("تم إنشاء الحساب");
      setNewUser({ name: "", username: "", password: "", role: "cashier" });
      void loadData();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "تعذر إنشاء الحساب");
    }
  };

  const handleToggleUser = async (id: string, active: boolean) => {
    try {
      await toggleUser({ data: { id, active } });
      toast.success(active ? "تم تفعيل الحساب" : "تم تجميد الحساب");
      void loadData();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "تعذر تحديث الحساب");
    }
  };

  const handleLogAttendance = async (
    employeeId: string,
    status: "present" | "absent" | "excused",
  ) => {
    try {
      await submitAttendance({
        data: { employeeId, date: attDate, status, hours: status === "present" ? 8 : 0 },
      });
      toast.success("تم تحديث الحضور");
      const att = await fetchAttendance({ data: { date: attDate } });
      setAttendance(att);
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "فشل تسجيل الحضور");
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا البند المالي؟")) return;
    try {
      await removeExpense({ data: { id } });
      toast.success("تم حذف البند");
      void loadData();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "فشل الحذف");
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الموظف؟")) return;
    try {
      await removeEmployee({ data: { id } });
      toast.success("تم حذف الموظف");
      void loadData();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "فشل الحذف");
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("تم تسجيل الخروج");
    void navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-[#070d0b] text-foreground">
      {/* هيدر لوحة الإدارة */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-sidebar/95 px-4 py-3 backdrop-blur flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="شعار Bulk Bun"
            className="h-10 w-10 rounded-xl object-cover ring-2 ring-primary/40"
          />
          <div>
            <h1 className="text-base font-extrabold brand-gradient-text">لوحة الإدارة والمتابعة</h1>
            <p className="text-[10px] text-muted-foreground">أهلاً بك يا {user?.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs rounded-xl"
            onClick={() => void navigate({ to: "/" })}
          >
            شاشة الكاشير
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive h-9 w-9 rounded-xl hover:bg-destructive/10"
            onClick={handleLogout}
            title="تسجيل الخروج"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {loading && !metrics ? (
        <div className="flex h-[80vh] items-center justify-center">
          <div className="text-center space-y-3">
            <div className="h-10 w-10 border-4 border-primary border-t-transparent animate-spin rounded-full mx-auto"></div>
            <p className="text-xs text-muted-foreground">جاري تحميل البيانات...</p>
          </div>
        </div>
      ) : (
        <main className="max-w-7xl mx-auto p-4 space-y-6">
          {/* التبويبات الرئيسية */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="h-12 w-full justify-start gap-1 bg-[#0f1b17] border border-white/5 p-1 rounded-2xl overflow-x-auto">
              <TabsTrigger
                value="analytics"
                className="h-10 px-5 font-bold rounded-xl data-[state=active]:bg-primary"
              >
                المبيعات والتقارير
              </TabsTrigger>
              <TabsTrigger
                value="hr"
                className="h-10 px-5 font-bold rounded-xl data-[state=active]:bg-primary"
              >
                العمال والمرتبات
              </TabsTrigger>
              <TabsTrigger
                value="expenses"
                className="h-10 px-5 font-bold rounded-xl data-[state=active]:bg-primary"
              >
                دفتر المصاريف
              </TabsTrigger>
              <TabsTrigger
                value="users"
                className="h-10 px-5 font-bold rounded-xl data-[state=active]:bg-primary"
              >
                المستخدمين والصلاحيات
              </TabsTrigger>
            </TabsList>

            {/* 1. ANALYTICS TAB */}
            <TabsContent value="analytics" className="space-y-6 mt-4">
              {/* بطاقات المؤشرات اللحظية */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="مبيعات اليوم"
                  value={EGP(metrics?.today?.sales ?? 0)}
                  sub={`عدد الفواتير: ${metrics?.today?.ordersCount ?? 0}`}
                  icon={<DollarSign className="h-5 w-5 text-primary" />}
                />
                <MetricCard
                  title="أرباح اليوم الصافية (تقديرية)"
                  value={EGP(metrics?.today?.netProfit ?? 0)}
                  sub="شاملة خصم 35% تكلفة خامات"
                  icon={<Activity className="h-5 w-5 text-emerald-500" />}
                />
                <MetricCard
                  title="مصاريف اليوم"
                  value={EGP(metrics?.today?.expenses ?? 0)}
                  sub="رواتب، نثرية، خامات واردة"
                  icon={<Wallet className="h-5 w-5 text-amber-500" />}
                />
                <MetricCard
                  title="عدد حركات الهالك اليوم"
                  value={`${metrics?.today?.wasteCount ?? 0} حركة`}
                  sub="مكونات تالفة مسجلة من المطبخ"
                  icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
                />
              </div>

              {/* الرسوم البيانية التفاعلية */}
              <div className="grid gap-4 lg:grid-cols-3">
                {/* 1. خط المبيعات والأرباح */}
                <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur">
                  <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-primary" /> مبيعات وتكلفة الخامات (آخر 30
                    يوم)
                  </h3>
                  <div className="h-64">
                    {isMounted && metrics?.salesTrend?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={metrics?.salesTrend ?? []}>
                        <XAxis
                          dataKey="date"
                          stroke="#888888"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="#888888"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${v}`}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#0b1411", borderColor: "#22c55e" }}
                          labelClassName="text-xs"
                        />
                        <Line
                          type="monotone"
                          dataKey="sales"
                          name="المبيعات"
                          stroke="#10b981"
                          strokeWidth={3}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="cost"
                          name="تكلفة الخامات"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="3 3"
                          dot={false}
                        />
                      </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                        لا توجد بيانات بيع مسجلة لآخر 30 يوم
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. توزيع المدفوعات */}
                <div className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur flex flex-col">
                  <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" /> طرق الدفع المفضلة
                  </h3>
                  <div className="h-48 flex-1 relative">
                    {isMounted && metrics?.paymentMethods?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={metrics?.paymentMethods ?? []}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="payment_method"
                          >
                            {(metrics?.paymentMethods ?? []).map((_: unknown, index: number) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: "#0b1411" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-16">
                        لا توجد بيانات بيع مسجلة بعد
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center text-xs mt-3">
                    {metrics?.paymentMethods?.map((pm, idx) => (
                      <span key={pm.payment_method} className="flex items-center gap-1.5 font-bold">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        ></span>
                        {PAYMENT_LABELS[pm.payment_method as keyof typeof PAYMENT_LABELS] ||
                          pm.payment_method}
                        : {EGP(pm.value)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 3. أوقات الذروة */}
                <div className="lg:col-span-3 rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur">
                  <h3 className="text-sm font-extrabold mb-4 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> مبيعات ساعات الذروة (آخر 7 أيام)
                  </h3>
                  <div className="h-56">
                    {isMounted && metrics?.peakHours?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metrics?.peakHours ?? []}>
                          <XAxis
                            dataKey="hour"
                            stroke="#888888"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: "#0b1411" }} />
                          <Bar
                            dataKey="value"
                            name="المبيعات"
                            fill="#10b981"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-16">
                        لا توجد بيانات بيع مسجلة بعد
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* 2. HR & SALARIES TAB */}
            <TabsContent value="hr" className="space-y-6 mt-4">
              <div className="grid gap-6 lg:grid-cols-3">
                {/* إضافة موظف جديد */}
                <section className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                  <h2 className="text-sm font-extrabold flex items-center gap-2 text-primary">
                    <UserPlus className="h-4.5 w-4.5" /> إضافة عامل جديد
                  </h2>
                  <form onSubmit={handleAddEmployee} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">اسم الموظف</Label>
                      <Input
                        value={newEmp.name}
                        onChange={(e) => setNewEmp((p) => ({ ...p, name: e.target.value }))}
                        placeholder="أدخل الاسم الرباعي"
                        className="bg-[#050908] border-white/5 rounded-xl h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">
                        المسمى الوظيفي
                      </Label>
                      <Input
                        value={newEmp.role}
                        onChange={(e) => setNewEmp((p) => ({ ...p, role: e.target.value }))}
                        placeholder="شيف، كاشير، مساعد، عامل توصيل"
                        className="bg-[#050908] border-white/5 rounded-xl h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">نظام الراتب</Label>
                      <Select
                        value={newEmp.salaryType}
                        onValueChange={(salaryType) => setNewEmp((p) => ({ ...p, salaryType }))}
                      >
                        <SelectTrigger className="bg-[#050908] border-white/5 rounded-xl h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">راتب شهري ثابت</SelectItem>
                          <SelectItem value="daily">يومية ثابتة</SelectItem>
                          <SelectItem value="hourly">ساعي (بالساعة)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">
                        قيمة الراتب / اليومية (ج.م)
                      </Label>
                      <Input
                        type="number"
                        value={newEmp.baseSalary}
                        onChange={(e) => setNewEmp((p) => ({ ...p, baseSalary: e.target.value }))}
                        placeholder="الراتب الأساسي بالجنيه"
                        className="bg-[#050908] border-white/5 rounded-xl h-11"
                      />
                    </div>
                    <Button type="submit" className="w-full h-11 rounded-xl font-extrabold mt-2">
                      تسجيل الموظف
                    </Button>
                  </form>
                </section>

                {/* قائمة الموظفين وتسجيل حضور اليوم */}
                <section className="lg:col-span-2 rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                  <div className="flex justify-between items-center gap-3">
                    <h2 className="text-sm font-extrabold flex items-center gap-2 text-primary">
                      <Users className="h-4.5 w-4.5" /> الموظفين والحضور اليومي
                    </h2>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={attDate}
                        onChange={(e) => setAttDate(e.target.value)}
                        className="bg-[#050908] border-white/5 rounded-xl h-9 text-xs w-36"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[28rem]">
                      <thead>
                        <tr className="text-muted-foreground border-b border-white/5">
                          <th className="py-2 text-start">الاسم</th>
                          <th className="py-2 text-start">الوظيفة</th>
                          <th className="py-2 text-start">نظام الراتب</th>
                          <th className="py-2 text-start">الحضور ({attDate.slice(5)})</th>
                          <th className="py-2 text-end">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((emp) => {
                          const att = attendance.find((a) => a.employee_id === emp.id);
                          return (
                            <tr key={emp.id} className="border-b border-white/5">
                              <td className="py-3 font-bold">{emp.name}</td>
                              <td className="py-3">{emp.role}</td>
                              <td className="py-3 font-bold text-emerald-500">
                                {emp.base_salary} ج.م /{" "}
                                {emp.salary_type === "monthly"
                                  ? "شهر"
                                  : emp.salary_type === "daily"
                                    ? "يوم"
                                    : "ساعة"}
                              </td>
                              <td className="py-3">
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleLogAttendance(emp.id, "present")}
                                    className={cn(
                                      "px-2 py-1 rounded-lg font-bold border transition-colors text-[10px]",
                                      att?.status === "present"
                                        ? "bg-primary border-primary text-primary-foreground"
                                        : "bg-transparent border-white/5 text-muted-foreground hover:text-foreground",
                                    )}
                                  >
                                    حضر
                                  </button>
                                  <button
                                    onClick={() => handleLogAttendance(emp.id, "absent")}
                                    className={cn(
                                      "px-2 py-1 rounded-lg font-bold border transition-colors text-[10px]",
                                      att?.status === "absent"
                                        ? "bg-destructive border-destructive text-destructive-foreground"
                                        : "bg-transparent border-white/5 text-muted-foreground hover:text-foreground",
                                    )}
                                  >
                                    غاب
                                  </button>
                                </div>
                              </td>
                              <td className="py-3 text-end">
                                <button
                                  onClick={() => handleDeleteEmployee(emp.id)}
                                  className="text-destructive hover:text-destructive/80"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {!employees.length && (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-muted-foreground">
                              لا يوجد موظفين مسجلين بعد.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* تسجيل سلفة أو صرف راتب */}
                <section className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                  <h2 className="text-sm font-extrabold flex items-center gap-2 text-primary">
                    <Wallet className="h-4.5 w-4.5" /> معاملة مالية للعمال
                  </h2>
                  <form onSubmit={handleAddSalaryTx} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">اختر الموظف</Label>
                      <Select
                        value={newTx.employeeId}
                        onValueChange={(employeeId) => setNewTx((p) => ({ ...p, employeeId }))}
                      >
                        <SelectTrigger className="bg-[#050908] border-white/5 rounded-xl h-11">
                          <SelectValue placeholder="اختر الموظف" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">
                        نوع المعاملة
                      </Label>
                      <Select
                        value={newTx.type}
                        onValueChange={(type) => setNewTx((p) => ({ ...p, type }))}
                      >
                        <SelectTrigger className="bg-[#050908] border-white/5 rounded-xl h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="payout">صرف راتب (تسليم)</SelectItem>
                          <SelectItem value="advance">صرف سلفة (خصم مستقبلي)</SelectItem>
                          <SelectItem value="bonus">مكافأة إضافية</SelectItem>
                          <SelectItem value="deduction">خصم تأديب/جزاء</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">
                        المبلغ (ج.م)
                      </Label>
                      <Input
                        type="number"
                        value={newTx.amount}
                        onChange={(e) => setNewTx((p) => ({ ...p, amount: e.target.value }))}
                        placeholder="المبلغ بالجنيه"
                        className="bg-[#050908] border-white/5 rounded-xl h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">ملاحظات</Label>
                      <Input
                        value={newTx.notes}
                        onChange={(e) => setNewTx((p) => ({ ...p, notes: e.target.value }))}
                        placeholder="مثال: سلفة للأسبوع الثاني"
                        className="bg-[#050908] border-white/5 rounded-xl h-11"
                      />
                    </div>
                    <Button type="submit" className="w-full h-11 rounded-xl font-extrabold mt-2">
                      تسجيل الحركة المالية
                    </Button>
                  </form>
                </section>

                {/* الخط الزمني لمعاملات الموظفين الماليّة */}
                <section className="lg:col-span-2 rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                  <h2 className="text-sm font-extrabold flex items-center gap-2 text-primary">
                    <History className="h-4.5 w-4.5" /> سجل معاملات الموظفين الماليّة
                  </h2>
                  <div className="max-h-[360px] overflow-y-auto space-y-2 pe-1">
                    {salaryTxs.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex justify-between items-center bg-[#050908]/80 border border-white/5 rounded-xl p-3 text-xs"
                      >
                        <div>
                          <p className="font-extrabold text-foreground">{tx.employee_name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(tx.date).toLocaleString("ar-EG")}{" "}
                            {tx.notes ? `• ${tx.notes}` : ""}
                          </p>
                        </div>
                        <div className="text-end">
                          <span
                            className={cn(
                              "font-black text-sm",
                              tx.type === "payout" && "text-emerald-500",
                              tx.type === "advance" && "text-amber-500",
                              tx.type === "bonus" && "text-primary",
                              tx.type === "deduction" && "text-destructive",
                            )}
                          >
                            {tx.type === "payout"
                              ? "صرف راتب"
                              : tx.type === "advance"
                                ? "سلفة"
                                : tx.type === "bonus"
                                  ? "مكافأة"
                                  : "خصم"}{" "}
                            ({tx.amount} ج.م)
                          </span>
                        </div>
                      </div>
                    ))}
                    {!salaryTxs.length && (
                      <p className="text-center py-12 text-muted-foreground text-xs">
                        لا توجد حركات مالية مسجلة بعد.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </TabsContent>

            {/* 3. EXPENSES TAB */}
            <TabsContent value="expenses" className="space-y-6 mt-4">
              <div className="grid gap-6 lg:grid-cols-3">
                {/* إضافة مصروف جديد */}
                <section className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                  <h2 className="text-sm font-extrabold flex items-center gap-2 text-primary">
                    <Plus className="h-4.5 w-4.5" /> إضافة مصروف جديد
                  </h2>
                  <form onSubmit={handleAddExpense} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">التصنيف</Label>
                      <Select
                        value={newExp.category}
                        onValueChange={(category) => setNewExp((p) => ({ ...p, category }))}
                      >
                        <SelectTrigger className="bg-[#050908] border-white/5 rounded-xl h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="raw_materials">خامات ومواد غذائية</SelectItem>
                          <SelectItem value="rent">إيجار المقر</SelectItem>
                          <SelectItem value="utilities">المرافق (كهرباء/غاز/مياه)</SelectItem>
                          <SelectItem value="maintenance">الصيانة والتصليح</SelectItem>
                          <SelectItem value="marketing">التسويق والإعلانات</SelectItem>
                          <SelectItem value="salaries">الرواتب والعمال</SelectItem>
                          <SelectItem value="misc">مصاريف أخرى نثرية</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">
                        المبلغ (ج.م)
                      </Label>
                      <Input
                        type="number"
                        value={newExp.amount}
                        onChange={(e) => setNewExp((p) => ({ ...p, amount: e.target.value }))}
                        placeholder="المبلغ بالجنيه"
                        className="bg-[#050908] border-white/5 rounded-xl h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">
                        الوصف / التفاصيل
                      </Label>
                      <Input
                        value={newExp.description}
                        onChange={(e) => setNewExp((p) => ({ ...p, description: e.target.value }))}
                        placeholder="مثال: فاتورة كهرباء شهر يونيو"
                        className="bg-[#050908] border-white/5 rounded-xl h-11"
                      />
                    </div>
                    <Button type="submit" className="w-full h-11 rounded-xl font-extrabold mt-2">
                      تسجيل المصروف
                    </Button>
                  </form>
                </section>

                {/* كشف حساب المصاريف والتدفقات النقدية */}
                <section className="lg:col-span-2 rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                  <h2 className="text-sm font-extrabold flex items-center gap-2 text-primary">
                    <History className="h-4.5 w-4.5" /> دفتر المصاريف والتشغيل (Operating Ledger)
                  </h2>

                  <div className="max-h-[460px] overflow-y-auto space-y-2 pe-1">
                    {expenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="flex justify-between items-center bg-[#050908]/80 border border-white/5 rounded-xl p-3 text-xs"
                      >
                        <div>
                          <p className="font-extrabold text-foreground">
                            {CATEGORY_LABELS[exp.category as keyof typeof CATEGORY_LABELS]}
                            {exp.description ? ` — ${exp.description}` : ""}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(exp.date).toLocaleString("ar-EG")}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-sm text-destructive">
                            -{EGP(exp.amount)}
                          </span>
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="text-destructive/50 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {!expenses.length && (
                      <p className="text-center py-16 text-muted-foreground text-xs">
                        لا توجد مصاريف مسجلة بعد.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </TabsContent>

            {/* 4. USER MANAGEMENT TAB */}
            <TabsContent value="users" className="space-y-6 mt-4">
              <div className="grid gap-6 lg:grid-cols-3">
                {/* إضافة مستخدم جديد */}
                <section className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                  <h2 className="text-sm font-extrabold flex items-center gap-2 text-primary">
                    <UserPlus className="h-4.5 w-4.5" /> إنشاء مستخدم جديد
                  </h2>
                  <form onSubmit={handleAddUser} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">
                        الاسم بالكامل
                      </Label>
                      <Input
                        value={newUser.name}
                        onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                        placeholder="أدخل اسم الشخص"
                        className="bg-[#050908] border-white/5 rounded-xl h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">
                        اسم المستخدم (Username)
                      </Label>
                      <Input
                        value={newUser.username}
                        onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                        placeholder="مثال: ahmed_pos"
                        className="bg-[#050908] border-white/5 rounded-xl h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">كلمة المرور</Label>
                      <Input
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                        placeholder="أدخل كلمة مرور قوية"
                        className="bg-[#050908] border-white/5 rounded-xl h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">
                        صلاحية المستخدم
                      </Label>
                      <Select
                        value={newUser.role}
                        onValueChange={(role) => setNewUser((p) => ({ ...p, role }))}
                      >
                        <SelectTrigger className="bg-[#050908] border-white/5 rounded-xl h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cashier">كاشير (صلاحية البيع والطلبات فقط)</SelectItem>
                          <SelectItem value="admin">
                            مدير (صلاحية كاملة للإدارة والماليات)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full h-11 rounded-xl font-extrabold mt-2">
                      إنشاء الحساب المالي
                    </Button>
                  </form>
                </section>

                {/* قائمة مستخدمين النظام */}
                <section className="lg:col-span-2 rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                  <h2 className="text-sm font-extrabold flex items-center gap-2 text-primary">
                    <UserCheck className="h-4.5 w-4.5" /> مستخدمين النظام وصلاحيات الوصول
                  </h2>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[28rem]">
                      <thead>
                        <tr className="text-muted-foreground border-b border-white/5">
                          <th className="py-2 text-start">الاسم</th>
                          <th className="py-2 text-start">اسم المستخدم</th>
                          <th className="py-2 text-start">الصلاحية</th>
                          <th className="py-2 text-start">حالة الحساب</th>
                          <th className="py-2 text-end">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.map((u) => (
                          <tr key={u.id} className="border-b border-white/5">
                            <td className="py-3 font-bold">{u.name}</td>
                            <td className="py-3 font-bold text-primary">@{u.username}</td>
                            <td className="py-3">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-black",
                                  u.role === "admin"
                                    ? "bg-primary/20 text-primary"
                                    : "bg-blue-500/20 text-blue-400",
                                )}
                              >
                                {u.role === "admin" ? "مدير" : "كاشير"}
                              </span>
                            </td>
                            <td className="py-3">
                              <span
                                className={cn(
                                  "text-[10px] font-extrabold",
                                  u.active === 1 ? "text-emerald-500" : "text-destructive",
                                )}
                              >
                                {u.active === 1 ? "نشط" : "مجمد"}
                              </span>
                            </td>
                            <td className="py-3 text-end">
                              {u.username !== "admin" && (
                                <button
                                  onClick={() => handleToggleUser(u.id, u.active === 0)}
                                  className={cn(
                                    "text-xs px-2.5 py-1 rounded-lg border font-bold",
                                    u.active === 1
                                      ? "border-destructive/20 text-destructive hover:bg-destructive/10"
                                      : "border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10",
                                  )}
                                >
                                  {u.active === 1 ? "تجميد" : "تفعيل"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      )}
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}

function MetricCard({ title, value, sub, icon }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur shadow-lg flex justify-between items-start">
      <div className="space-y-1">
        <p className="text-xs font-bold text-muted-foreground">{title}</p>
        <p className="text-xl font-black text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </div>
      <div className="h-9 w-9 rounded-xl bg-[#0f1b17] border border-white/5 flex items-center justify-center shrink-0">
        {icon}
      </div>
    </div>
  );
}
