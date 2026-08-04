import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Calendar,
  Clock,
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
  getDetailedReportsFn,
  getAttendanceFn,
  getSalaryTransactionsFn,
  listEmployeesFn,
  listExpensesFn,
  logAttendanceFn,
  logSalaryTransactionFn,
} from "@/lib/admin.functions";
import { createUserFn, listUsersFn, toggleUserFn, deleteUserFn, updateUserPasswordFn, deleteUserShiftsFn } from "@/lib/auth.functions";
import { listShiftsFn, deleteShiftFn } from "@/lib/shift.functions";
import { useAuth } from "@/lib/use-auth";
import { EGP } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
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
  const removeUser = useServerFn(deleteUserFn);
  const changeUserPassword = useServerFn(updateUserPasswordFn);
  const removeUserShifts = useServerFn(deleteUserShiftsFn);
  const fetchReports = useServerFn(getDetailedReportsFn);
  const fetchShifts = useServerFn(listShiftsFn);
  const removeShift = useServerFn(deleteShiftFn);

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
  const [shiftsList, setShiftsList] = useState<any[]>([]);
  const [reports, setReports] = useState<any>(null);
  const [reportDays, setReportDays] = useState(30);
  const [reportsLoading, setReportsLoading] = useState(false);
  
  // حالات تغيير الباسورد للمستخدمين
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [newPasswordVal, setNewPasswordVal] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  
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
      const [m, e, s, ex, u, sh] = await Promise.all([
        fetchMetrics({}),
        fetchEmployees({}),
        fetchSalaryTx({}),
        fetchExpenses({}),
        fetchUsers({}),
        fetchShifts({}),
      ]);
      setMetrics(m);
      setEmployees(e);
      setSalaryTxs(s);
      setExpenses(ex);
      setUsersList(u);
      setShiftsList(sh);
    } catch (err: unknown) {
      console.error("Failed to load admin dashboard data:", err);
      const error = err as Error;
      toast.error(error.message || "تعذر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [fetchMetrics, fetchEmployees, fetchSalaryTx, fetchExpenses, fetchUsers, fetchShifts]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const r = await fetchReports({ data: { days: reportDays } });
      setReports(r);
    } catch (err: unknown) {
      console.error("Failed to load reports:", err);
      const error = err as Error;
      toast.error(error.message || "تعذر تحميل التقارير");
    } finally {
      setReportsLoading(false);
    }
  }, [fetchReports, reportDays]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

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

  const handleDeleteUser = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستخدم نهائياً؟")) return;
    try {
      await removeUser({ data: { id } });
      toast.success("تم حذف المستخدم بنجاح");
      void loadData();
    } catch (err: any) {
      toast.error(err.message || "تعذر حذف المستخدم");
    }
  };

  const handleDeleteUserShifts = async (userId: string) => {
    if (!confirm("هل أنت متأكد من حذف سجل ورديات وتقارير هذا المستخدم بالكامل؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    try {
      await removeUserShifts({ data: { userId } });
      toast.success("تم حذف سجل الورديات والتقارير بنجاح");
      void loadData();
    } catch (err: any) {
      toast.error(err.message || "تعذر حذف سجل الورديات");
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswordVal.length < 6) {
      toast.error("كلمة المرور يجب ألا تقل عن 6 أحرف");
      return;
    }
    setPasswordSubmitting(true);
    try {
      await changeUserPassword({ data: { id: targetUserId, password: newPasswordVal } });
      toast.success("تم تغيير كلمة المرور بنجاح");
      setPasswordModalOpen(false);
      setNewPasswordVal("");
      setTargetUserId("");
    } catch (err: any) {
      toast.error(err.message || "تعذر تغيير كلمة المرور");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا السجل للوردية؟")) return;
    try {
      await removeShift({ data: { id } });
      toast.success("تم حذف سجل الوردية");
      void loadData();
    } catch (err: any) {
      toast.error(err.message || "تعذر حذف الوردية");
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
    void navigate({ to: "/admin/login" });
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
                value="reports"
                className="h-10 px-5 font-bold rounded-xl data-[state=active]:bg-primary"
              >
                التقارير التفصيلية 📊
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
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
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

            {/* 1.5. DETAILED REPORTS TAB */}
            <TabsContent value="reports" className="space-y-6 mt-4">
              {/* شريط الفلترة والأدوات */}
              <div className="flex flex-wrap justify-between items-center gap-4 bg-[#0b1411]/60 p-4 border border-white/5 rounded-2xl backdrop-blur">
                <div>
                  <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                    <BarChart2 className="h-4.5 w-4.5 text-primary" /> تقارير وتحليلات الأداء المتقدمة
                  </h2>
                  <p className="text-[10px] text-muted-foreground mt-0.5">تحليلات الأرباح والخسائر، تفاصيل المبيعات، ومعدلات الهلاك التشغيلي</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">الفترة الزمنية:</span>
                  <Select
                    value={String(reportDays)}
                    onValueChange={(v) => setReportDays(Number(v))}
                  >
                    <SelectTrigger className="bg-[#050908] border-white/5 rounded-xl h-10 w-44 text-xs font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">آخر 7 أيام (أسبوعي)</SelectItem>
                      <SelectItem value="30">آخر 30 يوم (شهري)</SelectItem>
                      <SelectItem value="90">آخر 90 يوم (ربع سنوي)</SelectItem>
                      <SelectItem value="365">آخر 365 يوم (سنوي)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {reportsLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="h-8 w-8 border-3 border-primary border-t-transparent animate-spin rounded-full mx-auto"></div>
                    <p className="text-xs text-muted-foreground">جاري إنشاء وتحليل التقارير...</p>
                  </div>
                </div>
              ) : reports ? (
                <>
                  {/* قائمة الربح والخسارة (P&L Ledger Cards) */}
                  <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                    <div className="rounded-2xl border border-white/5 bg-[#0b1411]/40 p-4 backdrop-blur-md shadow flex flex-col justify-between">
                      <p className="text-[10px] font-bold text-muted-foreground">إجمالي المبيعات (الإيرادات)</p>
                      <p className="text-lg font-black text-emerald-500 mt-2">{EGP(reports.financialSummary.revenue)}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">المبيعات المدفوعة للفترة</p>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-[#0b1411]/40 p-4 backdrop-blur-md shadow flex flex-col justify-between">
                      <p className="text-[10px] font-bold text-muted-foreground">تكلفة الخامات (COGS 35%)</p>
                      <p className="text-lg font-black text-rose-400 mt-2">-{EGP(reports.financialSummary.cogs)}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">تكلفة تحضير الطعام المقدرة</p>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-[#0b1411]/40 p-4 backdrop-blur-md shadow flex flex-col justify-between">
                      <p className="text-[10px] font-bold text-muted-foreground">الأجور ورواتب العمال</p>
                      <p className="text-lg font-black text-blue-400 mt-2">-{EGP(reports.financialSummary.salaries)}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">الرواتب، السلف والمكافآت</p>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-[#0b1411]/40 p-4 backdrop-blur-md shadow flex flex-col justify-between">
                      <p className="text-[10px] font-bold text-muted-foreground">المصاريف التشغيلية (OpEx)</p>
                      <p className="text-lg font-black text-amber-500 mt-2">-{EGP(reports.financialSummary.operational)}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">إيجارات، مرافق، صيانة ونثرية</p>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-primary/10 border-primary/25 p-4 backdrop-blur-md shadow flex flex-col justify-between col-span-2 md:col-span-1">
                      <p className="text-[10px] font-bold text-primary">صافي الأرباح التشغيلية</p>
                      <p className="text-xl font-black text-primary mt-2">{EGP(reports.financialSummary.netProfit)}</p>
                      <p className="text-[9px] text-primary/75 mt-1">
                        هامش الربح: {reports.financialSummary.revenue > 0 
                          ? ((reports.financialSummary.netProfit / reports.financialSummary.revenue) * 100).toFixed(1) 
                          : 0}%
                      </p>
                    </div>
                  </div>

                  {/* تفاصيل المبيعات والأصناف الأكثر طلباً */}
                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* الأصناف الـ 6 الأكثر طلباً */}
                    <div className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur">
                      <h3 className="text-xs font-black mb-4 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" /> الأصناف الـ 6 الأكثر طلباً ومبيعاً
                      </h3>
                      <div className="space-y-3.5">
                        {reports.topItems?.map((item: any, idx: number) => {
                          const maxQty = reports.topItems[0]?.total_qty || 1;
                          const percent = (item.total_qty / maxQty) * 100;
                          return (
                            <div key={item.name} className="space-y-1">
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-extrabold text-foreground">
                                  {idx + 1}. {item.name}
                                </span>
                                <span className="text-muted-foreground font-bold">
                                  {item.total_qty} طلبية ({EGP(item.total_sales)})
                                </span>
                              </div>
                              <div className="h-2 w-full bg-[#050908] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-500 to-primary rounded-full transition-all duration-500"
                                  style={{ width: `${percent}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                        {!reports.topItems?.length && (
                          <p className="text-xs text-muted-foreground text-center py-12">لا توجد مبيعات في هذه الفترة</p>
                        )}
                      </div>
                    </div>

                    {/* المبيعات حسب فئة المنيو */}
                    <div className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur flex flex-col justify-between">
                      <h3 className="text-xs font-black mb-4 flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-primary" /> مبيعات أقسام المنيو والوجبات
                      </h3>
                      <div className="h-48 relative flex items-center justify-center">
                        {isMounted && reports.categorySales?.length ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={reports.categorySales}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={65}
                                paddingAngle={3}
                                dataKey="value"
                                nameKey="category"
                              >
                                {reports.categorySales.map((_: any, index: number) => (
                                  <Cell
                                    key={`cell-rep-${index}`}
                                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                                  />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: "#0b1411" }} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-xs text-muted-foreground text-center">لا توجد بيانات بيع مسجلة بعد</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center text-[10px] mt-4">
                        {reports.categorySales?.map((cs: any, idx: number) => (
                          <span key={cs.category} className="flex items-center gap-1.5 font-bold">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                            ></span>
                            {cs.category}: {EGP(cs.value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* الهواك والتوصيات الإدارية */}
                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* تقرير الهالك التشغيلي */}
                    <div className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                      <h3 className="text-xs font-black text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> تقرير الهالك التشغيلي للمخزون
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground border-b border-white/5">
                              <th className="py-2 text-start">اسم المكون</th>
                              <th className="py-2 text-end">الكمية التالفة</th>
                              <th className="py-2 text-end">الحالة التشغيلية</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reports.wasteSummary?.map((w: any) => (
                              <tr key={w.id} className="border-b border-white/5">
                                <td className="py-2.5 font-extrabold text-foreground">{w.name}</td>
                                <td className="py-2.5 text-end font-bold text-destructive">
                                  {w.qty} {w.unit}
                                </td>
                                <td className="py-2.5 text-end">
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-destructive/10 text-destructive">
                                    فاقد تشغيلي
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {!reports.wasteSummary?.length && (
                              <tr>
                                <td colSpan={3} className="text-center py-12 text-muted-foreground text-xs">
                                  لا يوجد هالك مسجل في هذه الفترة (ممتاز!)
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* توصيات وتحليلات ذكية */}
                    <div className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                      <h3 className="text-xs font-black text-primary flex items-center gap-2">
                        <Activity className="h-4 w-4" /> توصيات إدارية وتحليلات ذكية للفرع
                      </h3>
                      <div className="space-y-3 text-xs leading-relaxed">
                        <div className="bg-[#050908]/50 border border-white/5 rounded-xl p-3 flex gap-2">
                          <span className="text-primary text-base select-none">💡</span>
                          <div>
                            <p className="font-extrabold text-foreground">تحليل المبيعات والأقسام</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              أقسام المنيو الأكثر تحقيقاً للدخل هي قسم ({reports.categorySales?.sort((a: any, b: any) => b.value - a.value)[0]?.category || "السندوتشات"}) بنسبة تزيد عن{" "}
                              {reports.categorySales?.length 
                                ? ((reports.categorySales?.sort((a: any, b: any) => b.value - a.value)[0]?.value / (reports.financialSummary.revenue || 1)) * 100).toFixed(0) 
                                : 0}%.
                              يرجى التركيز على تحسين جودة هذا القسم وتحديث أصنافه دورياً.
                            </p>
                          </div>
                        </div>

                        <div className="bg-[#050908]/50 border border-white/5 rounded-xl p-3 flex gap-2">
                          <span className="text-primary text-base select-none">🚨</span>
                          <div>
                            <p className="font-extrabold text-foreground">الرقابة والتحكم بالهالك</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {reports.wasteSummary?.length > 0 
                                ? `تم تسجيل هالك لعدد ${reports.wasteSummary.length} مكونات. يرجى توجيه الشيفات لضبط استهلاك المكونات وتقنين أحجام الوجبات لخفض نسب الفاقد.` 
                                : "لم يتم تسجيل أي هالك تشغيلي للمخزون في هذه الفترة، وهذا يدل على ضبط ممتاز لاستخدام المواد الخام."}
                            </p>
                          </div>
                        </div>

                        <div className="bg-[#050908]/50 border border-white/5 rounded-xl p-3 flex gap-2">
                          <span className="text-primary text-base select-none">💳</span>
                          <div>
                            <p className="font-extrabold text-foreground">مراقبة السيولة الدفعية</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              تأكد من تسوية الحسابات الرقمية والـ Instapay بشكل يومي لمنع تراكم المستحقات وضمان توافر سيولة كافية للمصروفات النثرية اليومية للمطعم.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* سجل الورديات والدرج */}
                  <div className="rounded-2xl border border-white/5 bg-[#0b1411]/60 p-4 backdrop-blur space-y-4">
                    <h3 className="text-xs font-black text-primary flex items-center gap-2">
                      💼 سجل الورديات وجرد درج النقدية الكاشير
                    </h3>
                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b border-white/5">
                            <th className="py-2 text-start">الكاشير</th>
                            <th className="py-2 text-start">تاريخ البدء</th>
                            <th className="py-2 text-start">تاريخ الإقفال</th>
                            <th className="py-2 text-end">المبلغ الافتتاحي</th>
                            <th className="py-2 text-end">المتوقع بالدرج</th>
                            <th className="py-2 text-end">الفعلي بالدرج</th>
                            <th className="py-2 text-end">العجز / الزيادة</th>
                            <th className="py-2 text-end">ملاحظات الجرد</th>
                            <th className="py-2 text-end">إجراء</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shiftsList.map((s: any) => {
                            const diff = s.difference ?? 0;
                            return (
                              <tr key={s.id} className="border-b border-white/5">
                                <td className="py-2.5 font-extrabold text-foreground">{s.user_name}</td>
                                <td className="py-2.5 text-muted-foreground">
                                  {new Date(s.opened_at).toLocaleString("ar-EG", { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-2.5 text-muted-foreground">
                                  {s.closed_at 
                                    ? new Date(s.closed_at).toLocaleString("ar-EG", { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                    : <span className="text-primary font-bold">وردية مفتوحة 🟢</span>
                                  }
                                </td>
                                <td className="py-2.5 text-end font-bold">{EGP(s.opening_cash)}</td>
                                <td className="py-2.5 text-end font-bold text-muted-foreground">{EGP(s.expected_cash)}</td>
                                <td className="py-2.5 text-end font-bold">
                                  {s.closed_at ? EGP(s.actual_cash ?? 0) : "-"}
                                </td>
                                <td className="py-2.5 text-end">
                                  {s.closed_at ? (
                                    <span className={cn(
                                      "font-black text-xs",
                                      diff < 0 ? "text-destructive" : diff > 0 ? "text-amber-500" : "text-emerald-500"
                                    )}>
                                      {diff === 0 ? "متطابق" : EGP(diff)}
                                    </span>
                                  ) : "-"}
                                </td>
                                <td className="py-2.5 text-end text-[10px] text-muted-foreground max-w-[8rem] truncate" title={s.notes || ""}>
                                  {s.notes || "-"}
                                </td>
                                <td className="py-2.5 text-end">
                                  <button
                                    onClick={() => handleDeleteShift(s.id)}
                                    className="text-destructive/50 hover:text-destructive transition-colors p-1"
                                    title="حذف هذا السجل"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {!shiftsList.length && (
                            <tr>
                              <td colSpan={9} className="text-center py-12 text-muted-foreground">
                                لا توجد ورديات مسجلة بعد.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-16 text-muted-foreground text-xs">فشل تحميل بيانات التقارير</div>
              )}
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

                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b border-white/5">
                          <th className="py-2 text-start">الاسم</th>
                          <th className="py-2 text-start hidden sm:table-cell">الوظيفة</th>
                          <th className="py-2 text-start">الراتب / اليومية</th>
                          <th className="py-2 text-start">الحضور ({attDate.slice(5)})</th>
                          <th className="py-2 text-end">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((emp) => {
                          const att = attendance.find((a) => a.employee_id === emp.id);
                          return (
                            <tr key={emp.id} className="border-b border-white/5">
                              <td className="py-3 font-bold">
                                <div>{emp.name}</div>
                                <div className="text-[10px] text-muted-foreground font-normal sm:hidden mt-0.5">{emp.role}</div>
                              </td>
                              <td className="py-3 hidden sm:table-cell">{emp.role}</td>
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

                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b border-white/5">
                          <th className="py-2 text-start">الاسم</th>
                          <th className="py-2 text-start hidden sm:table-cell">اسم المستخدم</th>
                          <th className="py-2 text-start">الصلاحية</th>
                          <th className="py-2 text-start">حالة الحساب</th>
                          <th className="py-2 text-end">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.map((u) => (
                          <tr key={u.id} className="border-b border-white/5">
                            <td className="py-3 font-bold">
                              <div>{u.name}</div>
                              <div className="text-[10px] text-primary font-bold sm:hidden mt-0.5">@{u.username}</div>
                            </td>
                            <td className="py-3 font-bold text-primary hidden sm:table-cell">@{u.username}</td>
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
                            <td className="py-3 text-end flex justify-end items-center gap-1.5 flex-wrap">
                              {u.username !== "admin" && (
                                <>
                                  <button
                                    onClick={() => handleToggleUser(u.id, u.active === 0)}
                                    className={cn(
                                      "text-[10px] px-2 py-1 rounded-lg border font-bold transition-all",
                                      u.active === 1
                                        ? "border-destructive/20 text-destructive hover:bg-destructive/10"
                                        : "border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10",
                                    )}
                                  >
                                    {u.active === 1 ? "تجميد" : "تفعيل"}
                                  </button>

                                  <button
                                    onClick={() => {
                                      setTargetUserId(u.id);
                                      setNewPasswordVal("");
                                      setPasswordModalOpen(true);
                                    }}
                                    title="تغيير كلمة المرور"
                                    className="p-1 rounded-lg bg-[#050908]/40 border border-white/5 text-muted-foreground hover:text-primary transition-colors"
                                  >
                                    <Key className="h-3.5 w-3.5" />
                                  </button>

                                  <button
                                    onClick={() => handleDeleteUserShifts(u.id)}
                                    title="حذف الورديات والسجلات"
                                    className="p-1 rounded-lg bg-[#050908]/40 border border-white/5 text-muted-foreground hover:text-amber-500 transition-colors"
                                  >
                                    <History className="h-3.5 w-3.5" />
                                  </button>

                                  <button
                                    onClick={() => handleDeleteUser(u.id)}
                                    title="حذف الحساب نهائياً"
                                    className="p-1 rounded-lg bg-[#050908]/40 border border-white/5 text-muted-foreground hover:text-destructive transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
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

      {/* نافذة تغيير كلمة المرور للمستخدم */}
      <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
        <DialogContent className="max-w-sm bg-[#0b1411] border-white/5 rounded-3xl text-right p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-primary flex items-center gap-2 justify-end">
              تغيير كلمة المرور للمستخدم 🔑
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleChangePasswordSubmit} className="space-y-4 my-2 text-right">
            <div className="space-y-2 text-start">
              <label className="text-xs font-bold text-muted-foreground pr-1 block text-right">
                كلمة المرور الجديدة (6 أحرف على الأقل)
              </label>
              <Input
                type="password"
                required
                value={newPasswordVal}
                onChange={(e) => setNewPasswordVal(e.target.value)}
                placeholder="أدخل كلمة المرور الجديدة"
                className="bg-[#050908] border-white/5 rounded-2xl h-11 text-right text-xs"
              />
            </div>

            <DialogFooter className="mt-6 flex flex-row gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPasswordModalOpen(false)}
                className="h-11 rounded-2xl font-bold text-xs"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={passwordSubmitting}
                className="h-11 rounded-2xl font-black text-xs bg-primary text-primary-foreground hover:bg-primary/90 flex-1"
              >
                {passwordSubmitting ? (
                  <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent animate-spin rounded-full mx-auto"></div>
                ) : (
                  "حفظ كلمة المرور"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
