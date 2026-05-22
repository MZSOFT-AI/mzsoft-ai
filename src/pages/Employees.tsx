import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp, 
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { Employee, Project, ProjectPayment } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { 
  Users, 
  Plus, 
  Search, 
  Phone, 
  Briefcase, 
  DollarSign, 
  Calendar, 
  Trash2, 
  Edit2, 
  Wallet, 
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
  ShieldCheck,
  Building,
  Activity,
  UserCheck,
  UserX,
  FileDown,
  Sparkles,
  Paperclip,
  Eye,
  Check,
  X,
  Users2
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import Modal from '../components/ui/Modal';
import { toast } from 'react-hot-toast';
import { cn, formatCurrency } from '../lib/utils';
import { excelService } from '../services/excelService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend,
  AreaChart,
  Area
} from 'recharts';

// Extra interface elements to fully enrich state
interface AttendanceData {
  id?: string;
  employeeId: string;
  employeeName: string;
  projectId?: string;
  projectName?: string;
  date: string;
  checkIn: string;
  checkOut: string;
  hoursWorked: number;
  overtime: number;
  delayMinutes: number;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
}

interface LeaveRequest {
  id?: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  type: 'annual' | 'sick' | 'special' | 'other';
  days: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  comments?: string;
}

interface LogData {
  id?: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  details: string;
  timestamp: any;
}

const Employees: React.FC = () => {
  const { isAdmin, user, userData } = useAuth();
  const { settings } = useSettings();
  
  // App active roles
  const isSuperadmin = (userData?.role as string) === 'superadmin';
  const isSystemAdmin = isSuperadmin || (userData?.role as string) === 'admin' || (userData?.role as string) === 'manager';
  const isRH = (userData?.role as string) === 'rh' || isSystemAdmin;
  const isComptable = (userData?.role as string) === 'comptable' || isSystemAdmin;
  
  // Real-time Firestore sync states
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<ProjectPayment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceData[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [logs, setLogs] = useState<LogData[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'roster' | 'attendance' | 'leaves' | 'payroll' | 'documents' | 'audit'>('dashboard');
  
  // Filters & searches
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterContract, setFilterContract] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [filterHireDateStart, setFilterHireDateStart] = useState('');
  const [filterHireDateEnd, setFilterHireDateEnd] = useState('');

  // Multi-purpose selected elements
  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);
  const [profileViewEmp, setProfileViewEmp] = useState<any | null>(null);

  // Modal open states
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'employees' | 'leaves' | 'payments' | 'attendance' | 'documents'; name: string } | null>(null);

  // Forms state
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    role: '',
    salaryBasis: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'fixed' | 'project',
    rate: 0,
    isActive: true,
    matricule: '',
    
    // Personal details
    birthDate: '',
    gender: 'M' as 'M' | 'F',
    address: '',
    nationality: 'Algérienne',
    idNumber: '',
    familyStatus: 'Célibataire' as 'Célibataire' | 'Marié' | 'Divorcé' | 'Veuf',
    emergencyContact: '',
    
    // Professional details
    department: 'Exploitation',
    service: 'Technique',
    hireDate: format(new Date(), 'yyyy-MM-dd'),
    contractType: 'CDI' as 'CDI' | 'CDD' | 'Interim' | 'Stage',
    status: 'active' as 'active' | 'suspended' | 'resigned' | 'archived',
    manager: '',
    accessLevel: 'employee' as 'admin' | 'rh' | 'comptable' | 'employee',
    assignedProjects: [] as string[],

    // Default payroll fields
    baseSalary: 0,
    bonusesDefault: 0,
    allowancesDefault: 0,
    deductionsDefault: 0,
    
    photoBase64: '',
    documents: [] as Array<{ name: string; type: string; fileBase64: string; addedAt: string }>
  });

  const [attendanceForm, setAttendanceForm] = useState({
    employeeId: '',
    projectId: '',
    projectName: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    checkIn: '08:00',
    checkOut: '17:00',
    status: 'present' as 'present' | 'absent' | 'late' | 'excused',
    notes: ''
  });

  const [leaveForm, setLeaveForm] = useState({
    employeeId: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    type: 'annual' as 'annual' | 'sick' | 'special' | 'other',
    reason: '',
    comments: ''
  });

  const [salaryForm, setSalaryForm] = useState({
    employeeId: '',
    projectId: '', // Assign payroll to a selected project or administration
    month: format(new Date(), 'yyyy-MM'),
    baseSalary: '',
    bonuses: '',
    allowances: '',
    deductions: '',
    paymentMethod: 'cash',
    notes: ''
  });

  // Unique matricule auto key generator
  const getNextMatricule = (list: any[]) => {
    const year = new Date().getFullYear();
    const count = list.length + 1;
    const padded = String(count).padStart(4, '0');
    return `EMP-${year}-${padded}`;
  };

  // Log system modifications helper
  const saveAuditLog = async (action: string, entity: string, details: string) => {
    try {
      await addDoc(collection(db, 'employeeLogs'), {
        userId: user?.uid || 'Unknown',
        userName: userData?.displayName || user?.displayName || 'Utilisateur',
        action,
        entity,
        details,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Audit log error", e);
    }
  };

  // Firestore real-time sub-collection connections
  useEffect(() => {
    const unsubEmployees = onSnapshot(query(collection(db, 'employees'), orderBy('name')), (snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
    });

    const unsubPayments = onSnapshot(query(collection(db, 'employeePayments'), orderBy('date', 'desc')), (snap) => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectPayment)));
    });

    const unsubAttendance = onSnapshot(query(collection(db, 'employeeAttendance'), orderBy('date', 'desc')), (snap) => {
      setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceData)));
    });

    const unsubLeaves = onSnapshot(query(collection(db, 'employeeLeaves'), orderBy('startDate', 'desc')), (snap) => {
      setLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
    });

    const unsubLogs = onSnapshot(query(collection(db, 'employeeLogs'), orderBy('timestamp', 'desc')), (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as LogData)));
      setLoading(false);
    });

    return () => {
      unsubEmployees();
      unsubProjects();
      unsubPayments();
      unsubAttendance();
      unsubLeaves();
      unsubLogs();
    };
  }, []);

  // Sync access permissions automatically - check if current user is an employee only
  const matchedEmployee = employees.find(e => e.email && e.email.toLowerCase() === user?.email?.toLowerCase());
  const isEmployeeOnly = !isSystemAdmin && !isRH && !isComptable;

  useEffect(() => {
    if (isEmployeeOnly && matchedEmployee) {
      // Force view of self profile only
      setProfileViewEmp(matchedEmployee);
    }
  }, [isEmployeeOnly, matchedEmployee]);

  // HR metrics calculation
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.isActive && e.status === 'active').length;
  const suspendedEmployees = employees.filter(e => e.status === 'suspended').length;
  const resignedEmployees = employees.filter(e => e.status === 'resigned').length;

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayAttendance = attendance.filter(a => a.date === todayStr);
  const presentToday = todayAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
  const absentToday = todayAttendance.filter(a => a.status === 'absent').length;

  const activeLeaves = leaves.filter(l => l.status === 'approved' && todayStr >= l.startDate && todayStr <= l.endDate);
  const onLeaveToday = activeLeaves.length;

  // New employees this month
  const currentMonthStart = format(new Date(), 'yyyy-MM-01');
  const newHiresThisMonth = employees.filter(e => e.hireDate && e.hireDate >= currentMonthStart).length;

  // Combined real payroll elements sums
  const totalBaseSalaryPayroll = employees.reduce((sum, e) => sum + (Number(e.baseSalary) || Number(e.rate) || 0), 0);
  const totalPayrollPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // Recharts payroll and attendance data parsing
  const getPayrollChartData = () => {
    const monthlyTotals: { [key: string]: number } = {};
    payments.forEach(p => {
      const payDate = (p.date as any)?.toDate ? (p.date as any).toDate() : new Date(p.date as any);
      const yearMonth = format(payDate, 'yyyy-MM');
      monthlyTotals[yearMonth] = (monthlyTotals[yearMonth] || 0) + p.amount;
    });

    const sortedMonths = Object.keys(monthlyTotals).sort().slice(-6);
    return sortedMonths.map(m => ({
      name: format(new Date(m + "-02"), 'MMM yyyy', { locale: fr }),
      Masse: monthlyTotals[m]
    }));
  };

  const getContractStatusData = () => {
    const counts: { [key: string]: number } = {};
    employees.forEach(e => {
      const contract = e.contractType || 'CDI';
      counts[contract] = (counts[contract] || 0) + 1;
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  };

  const COLORS = ['#0274be', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

  // Add or Edit Employee Submit handler
  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedName = `${employeeForm.lastName || ''} ${employeeForm.firstName || ''}`.trim() || employeeForm.name;
    if (!combinedName) return toast.error("Le nom et le prénom de l'employé sont requis");

    try {
      const matriculeStr = employeeForm.matricule || getNextMatricule(employees);
      const data = {
        ...employeeForm,
        name: combinedName,
        matricule: matriculeStr,
        rate: Number(employeeForm.rate) || 0,
        baseSalary: Number(employeeForm.baseSalary) || Number(employeeForm.rate) || 0,
        bonusesDefault: Number(employeeForm.bonusesDefault) || 0,
        allowancesDefault: Number(employeeForm.allowancesDefault) || 0,
        deductionsDefault: Number(employeeForm.deductionsDefault) || 0,
        updatedAt: serverTimestamp()
      };

      if (selectedEmp) {
        await updateDoc(doc(db, 'employees', selectedEmp.id!), data);
        await saveAuditLog('MODIFICATION', 'employees', `Mise à jour des informations de l'employé ${combinedName} (Code: ${matriculeStr})`);
        toast.success('Fiche de l\'employé mise à jour');
      } else {
        await addDoc(collection(db, 'employees'), {
          ...data,
          createdAt: serverTimestamp()
        });
        await saveAuditLog('AJOUT', 'employees', `Recrutement d'un nouvel employé: ${combinedName} (Code: ${matriculeStr})`);
        toast.success('Nouvel employé recruté avec succès');
      }
      setIsEmployeeModalOpen(false);
      resetEmployeeForm();
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde sur Firebase');
    }
  };

  // Set up Employee profile for editing
  const handleEditEmployeeClick = (emp: any) => {
    setSelectedEmp(emp);
    setEmployeeForm({
      name: emp.name || '',
      firstName: emp.firstName || '',
      lastName: emp.lastName || '',
      phone: emp.phone || '',
      email: emp.email || '',
      role: emp.role || '',
      salaryBasis: emp.salaryBasis || 'monthly',
      rate: Number(emp.rate) || 0,
      isActive: emp.isActive !== undefined ? emp.isActive : true,
      matricule: emp.matricule || '',
      birthDate: emp.birthDate || '',
      gender: emp.gender || 'M',
      address: emp.address || '',
      nationality: emp.nationality || 'Algérienne',
      idNumber: emp.idNumber || '',
      familyStatus: emp.familyStatus || 'Célibataire',
      emergencyContact: emp.emergencyContact || '',
      department: emp.department || 'Exploitation',
      service: emp.service || 'Technique',
      hireDate: emp.hireDate || format(new Date(), 'yyyy-MM-dd'),
      contractType: emp.contractType || 'CDI',
      status: emp.status || 'active',
      manager: emp.manager || '',
      accessLevel: emp.accessLevel || 'employee',
      assignedProjects: emp.assignedProjects || [],
      baseSalary: Number(emp.baseSalary) || Number(emp.rate) || 0,
      bonusesDefault: Number(emp.bonusesDefault) || 0,
      allowancesDefault: Number(emp.allowancesDefault) || 0,
      deductionsDefault: Number(emp.deductionsDefault) || 0,
      photoBase64: emp.photoBase64 || '',
      documents: emp.documents || []
    });
    setIsEmployeeModalOpen(true);
  };

  // Handle deletion safely with clear auditing log
  const requestDelete = (id: string, type: 'employees' | 'leaves' | 'payments' | 'attendance' | 'documents', name: string) => {
    setDeleteTarget({ id, type, name });
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      const { id, type, name } = deleteTarget;
      
      if (type === 'employees') {
        await deleteDoc(doc(db, 'employees', id));
        await saveAuditLog('SUPPRESSION', 'employees', `Suppression définitive du dossier de l'employé: ${name}`);
        toast.success(`Dossier employé de ${name} supprimé définitivement`);
      } else if (type === 'leaves') {
        await deleteDoc(doc(db, 'employeeLeaves', id));
        await saveAuditLog('SUPPRESSION', 'leaves', `Suppression de la demande de congé de l'employé: ${name}`);
        toast.success(`Demande de congé de ${name} annulée`);
      } else if (type === 'payments') {
        await deleteDoc(doc(db, 'employeePayments', id));
        
        // Find and delete the corresponding expense linked to this payment
        try {
          const expenseSnap = await getDocs(query(collection(db, 'expenses'), where('paymentId', '==', id)));
          for (const d of expenseSnap.docs) {
            await deleteDoc(doc(db, 'expenses', d.id));
          }
        } catch (err) {
          console.error("Erreur de nettoyage de l'expense liée", err);
        }

        await saveAuditLog('SUPPRESSION', 'payments', `Annulation du versement de salaire de ${name}`);
        toast.success(`Paiement de salaire annulé et dépenses associées supprimées`);
      } else if (type === 'attendance') {
        await deleteDoc(doc(db, 'employeeAttendance', id));
        await saveAuditLog('SUPPRESSION', 'attendance', `Suppression de la fiche de pointage de ${name}`);
        toast.success(`Fiche de pointage supprimée`);
      } else if (type === 'documents') {
        // Remove document from employee sub documents index
        const updatedDocs = (profileViewEmp?.documents || []).filter((d: any) => d.name !== name);
        await updateDoc(doc(db, 'employees', profileViewEmp.id), {
          documents: updatedDocs
        });
        setProfileViewEmp({ ...profileViewEmp, documents: updatedDocs });
        await saveAuditLog('SUPPRESSION', 'documents', `Suppression du document ${name} de l'employé: ${profileViewEmp.name}`);
        toast.success(`Document ${name} retiré`);
      }

      setIsDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      toast.error('Erreur lors du traitement de la suppression');
    }
  };

  // Attendance Clock pointer manual checkin/checkout logic
  const handleAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendanceForm.employeeId) return toast.error("Veuillez sélectionner un employé");

    try {
      const emp = employees.find(e => e.id === attendanceForm.employeeId);
      
      // Calculate working stats
      const [inH, inM] = attendanceForm.checkIn.split(':').map(Number);
      const [outH, outM] = attendanceForm.checkOut.split(':').map(Number);
      
      let minutesWorked = (outH * 60 + outM) - (inH * 60 + inM);
      const hoursWorked = Number((Math.max(0, minutesWorked) / 60).toFixed(2));
      
      // Delay compared to standard 08:00 start
      const standardStartMinutes = 8 * 60;
      const actualStartMinutes = inH * 60 + inM;
      const delayMinutes = Math.max(0, actualStartMinutes - standardStartMinutes);
      
      // Overtime past 9 hours (standard 8hs shift + 1h lunch)
      const overtime = Math.max(0, hoursWorked - 8);

      const data: any = {
        employeeId: attendanceForm.employeeId,
        employeeName: emp?.name || 'Inconnu',
        projectId: attendanceForm.projectId || '',
        projectName: attendanceForm.projectName || '',
        date: attendanceForm.date,
        checkIn: attendanceForm.checkIn,
        checkOut: attendanceForm.checkOut,
        hoursWorked,
        delayMinutes,
        overtime,
        status: attendanceForm.status,
        notes: attendanceForm.notes
      };

      // Check if duplicate for same date
      const duplicate = attendance.find(a => a.employeeId === data.employeeId && a.date === data.date);
      if (duplicate) {
        await updateDoc(doc(db, 'employeeAttendance', duplicate.id!), data as any);
        await saveAuditLog('MODIFICATION', 'attendance', `Pointage de ${data.employeeName} pour le ${data.date} mis à jour`);
        toast.success("Pointage de l'employé mis à jour");
      } else {
        await addDoc(collection(db, 'employeeAttendance'), data as any);
        await saveAuditLog('AJOUT', 'attendance', `Nouveau pointage de ${data.employeeName} enregistré pour le ${data.date}`);
        toast.success("Pointage enregistré avec succès");
      }

      setIsAttendanceModalOpen(false);
      setAttendanceForm({
        employeeId: '',
        projectId: '',
        projectName: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        checkIn: '08:00',
        checkOut: '17:00',
        status: 'present',
        notes: ''
      });
    } catch (e) {
      toast.error("Erreur de pointage");
    }
  };

  // Smart one-click automatic checkin check for today
  const handleQuickClockIn = async (emp: any) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const existing = attendance.find(a => a.employeeId === emp.id && a.date === today);

    if (existing) {
      if (existing.checkOut) {
        toast.error(`${emp.name} est déjà pointé pour toute la journée aujourd'hui.`);
        return;
      }
      // Clock out
      const currentHour = format(new Date(), 'HH:mm');
      const [inH, inM] = existing.checkIn.split(':').map(Number);
      const [outH, outM] = currentHour.split(':').map(Number);
      const minutesWorked = (outH * 60 + outM) - (inH * 60 + inM);
      const hoursWorked = Number((Math.max(0, minutesWorked) / 60).toFixed(2));
      const overtime = Math.max(0, hoursWorked - 8);

      try {
        await updateDoc(doc(db, 'employeeAttendance', existing.id!), {
          checkOut: currentHour,
          hoursWorked,
          overtime,
          updatedAt: serverTimestamp()
        });
        await saveAuditLog('MODIFICATION', 'attendance', `Départ rapide automatique de ${emp.name} à ${currentHour}`);
        toast.success(`${emp.name} pointé en sortie à ${currentHour} !`);
      } catch (e) {
        toast.error("Échec du pointage de sortie");
      }
    } else {
      // Clock in
      const currentHour = format(new Date(), 'HH:mm');
      const startH = Number(currentHour.split(':')[0]);
      const startM = Number(currentHour.split(':')[1]);
      const delayMinutes = Math.max(0, (startH * 60 + startM) - (8 * 60));
      const statusType = delayMinutes > 15 ? 'late' : 'present';

      try {
        await addDoc(collection(db, 'employeeAttendance'), {
          employeeId: emp.id,
          employeeName: emp.name,
          date: today,
          checkIn: currentHour,
          checkOut: '',
          hoursWorked: 0,
          overtime: 0,
          delayMinutes,
          status: statusType,
          notes: 'Pointage rapide système',
          createdAt: serverTimestamp()
        });
        await saveAuditLog('AJOUT', 'attendance', `Arrivée rapide automatique de ${emp.name} à ${currentHour}`);
        toast.success(`${emp.name} pointé à l'arrivée à ${currentHour} (${statusType === 'late' ? 'En retard' : 'À temps'}) !`);
      } catch (e) {
        toast.error("Échec de pointage automatique");
      }
    }
  };

  // Leave approval & request submit handlings
  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.employeeId) return toast.error("Veuillez sélectionner un employé");

    try {
      const emp = employees.find(e => e.id === leaveForm.employeeId);
      const days = differenceInDays(new Date(leaveForm.endDate), new Date(leaveForm.startDate)) + 1;

      if (days <= 0) return toast.error("La date de départ doit précéder la date de fin");

      await addDoc(collection(db, 'employeeLeaves'), {
        employeeId: leaveForm.employeeId,
        employeeName: emp?.name || 'Inconnu',
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        type: leaveForm.type,
        days,
        reason: leaveForm.reason,
        comments: leaveForm.comments || '',
        status: 'pending',
        createdAt: serverTimestamp()
      });

      await saveAuditLog('AJOUT', 'leaves', `Nouvelle demande de congé déposée par ${emp?.name} du ${leaveForm.startDate} au ${leaveForm.endDate}`);
      toast.success("Demande de congé enregistrée avec succès");
      setIsLeaveModalOpen(false);
      setLeaveForm({
        employeeId: '',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: format(new Date(), 'yyyy-MM-dd'),
        type: 'annual',
        reason: '',
        comments: ''
      });
    } catch (e) {
      toast.error("Erreur de soumission");
    }
  };

  const updateLeaveStatus = async (leaveId: string, status: 'approved' | 'rejected', comment?: string) => {
    try {
      const targetLeave = leaves.find(l => l.id === leaveId);
      await updateDoc(doc(db, 'employeeLeaves', leaveId), {
        status,
        comments: comment || `Décision prise le ${format(new Date(), 'dd/MM/yyyy')}`
      });
      await saveAuditLog('MODIFICATION', 'leaves', `Demande de congé de ${targetLeave?.employeeName} ${status === 'approved' ? 'acceptée' : 'refusée'}`);
      toast.success(`Le congé a été ${status === 'approved' ? 'approuvé' : 'refusé'} avec succès`);
    } catch (e) {
      toast.error("Impossible de mettre à jour le statut");
    }
  };

  // Salary automatic calculator based on points/attendance logs & remuneration rates
  const getCalculatedSalaryInfo = (empId: string, projId: string, month: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return { baseCalculated: 0, reason: "Employé introuvable", daysPresent: 0, hoursWorked: 0 };
    
    const monthStr = month || format(new Date(), 'yyyy-MM');
    const monthAttendance = attendance.filter(a => a.employeeId === empId && a.date?.startsWith(monthStr));
    
    const daysPresent = monthAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
    const hoursWorked = monthAttendance.reduce((sum, a) => sum + (Number(a.hoursWorked) || 0), 0);
    
    let baseCalculated = Number(emp.rate) || Number(emp.baseSalary) || 0;
    let reason = "Salaire de base forfaitaire";

    if (emp.salaryBasis === 'daily') {
      baseCalculated = daysPresent * (Number(emp.rate) || 0);
      reason = `Rémunération journalière (${daysPresent} jours présents * ${emp.rate} DA/jour)`;
    } else if (emp.salaryBasis === 'weekly') {
      const weeksWorked = daysPresent / 6;
      baseCalculated = Math.round(weeksWorked * (Number(emp.rate) || 0));
      reason = `Rémunération hebdomadaire (${daysPresent} jours de présence, soit ~${weeksWorked.toFixed(1)} sem. * ${emp.rate} DA/semaine)`;
    } else if (emp.salaryBasis === 'project') {
      if (projId && projId !== 'office') {
        const projAttendance = monthAttendance.filter(a => a.projectId === projId);
        const projDays = projAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
        baseCalculated = projDays * (Number(emp.rate) || 0);
        reason = `Rémunération par chantier (${projDays} présences actives sur ce chantier * ${emp.rate} DA/jour)`;
      } else {
        baseCalculated = daysPresent * (Number(emp.rate) || 0);
        reason = `Rémunération par chantier (Global : ${daysPresent} jours présents * ${emp.rate} DA/jour - sélectionnez un chantier spécifique pour filtrer)`;
      }
    } else if (emp.salaryBasis === 'monthly') {
      baseCalculated = Number(emp.rate) || Number(emp.baseSalary) || 0;
      reason = `Rémunération mensuelle standard (forfaitaire)`;
    }

    return { baseCalculated, reason, daysPresent, hoursWorked };
  };

  // Salary verification, calculation, payment logs registering
  const handleOpenSalaryModal = (emp: any) => {
    const monthStr = format(new Date(), 'yyyy-MM');
    const existingPayslip = payments.find(p => p.employeeId === emp.id && format(new Date(p.date as any), 'yyyy-MM') === monthStr);
    
    // Auto calculate initial values
    const { baseCalculated, reason } = getCalculatedSalaryInfo(emp.id, 'office', monthStr);
    
    setSalaryForm({
      employeeId: emp.id,
      projectId: 'office', // Default is administration/office general
      month: monthStr,
      baseSalary: String(baseCalculated),
      bonuses: String(emp.bonusesDefault || 0),
      allowances: String(emp.allowancesDefault || 0),
      deductions: String(emp.deductionsDefault || 0),
      paymentMethod: 'cash',
      notes: existingPayslip ? `⚠️ Salaire déjà réglé pour ce mois. ${reason}` : reason
    });
    setSelectedEmp(emp);
    setIsSalaryModalOpen(true);
  };

  const handleSalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryForm.employeeId) return;

    try {
      const emp = employees.find(e => e.id === salaryForm.employeeId);
      const base = Number(salaryForm.baseSalary) || 0;
      const bonus = Number(salaryForm.bonuses) || 0;
      const allow = Number(salaryForm.allowances) || 0;
      const deduct = Number(salaryForm.deductions) || 0;
      const netCalculated = base + bonus + allow - deduct;

      // Assign to project if selected, else general paie administration
      let projId = 'OFFICE-MAIN';
      let projName = 'Administration Générale (Paie)';
      
      if (salaryForm.projectId && salaryForm.projectId !== 'office') {
        const matchingProj = projects.find(p => p.id === salaryForm.projectId);
        projId = salaryForm.projectId;
        projName = matchingProj ? matchingProj.name : 'Chantier Assigné';
      }

      // Add payments receipt database entry
      const paymentData = {
        employeeId: salaryForm.employeeId,
        employeeName: emp?.name || 'Inconnu',
        projectId: projId,
        projectName: projName,
        amount: netCalculated,
        date: new Date(salaryForm.month + "-28"),
        type: 'salary' as const,
        paymentMethod: salaryForm.paymentMethod as any,
        notes: `Salaire Basé sur mode [${emp?.salaryBasis?.toUpperCase() || 'MENSUEL'}]. Calcul de base: ${base} | Primes: ${bonus} | Ind: ${allow} | Ret: ${deduct}. Obs: ${salaryForm.notes}`,
        createdBy: user?.uid || '',
        createdByName: userData?.displayName || user?.displayName || 'Gestionnaire Paie',
        createdAt: serverTimestamp(),
        
        // Detailed salary breakdown for Payslip exports
        salaryBreakdown: {
          base,
          bonus,
          allow,
          deduct,
          netCalculated,
          monthCode: salaryForm.month
        }
      };

      const paymentRef = await addDoc(collection(db, 'employeePayments'), paymentData);
      
      // Automatic accounting integration: register payment as general expense inside standard 'expenses' collection
      try {
        const expenseData = {
          category: 'SALAIRES & INDEMNITES',
          reason: `Paiement ${paymentData.type === 'salary' ? 'Salaire' : 'Acompte'} - ${paymentData.employeeName} (${salaryForm.month}) - ${projName}`,
          amount: netCalculated,
          userId: user?.uid || 'system',
          userName: userData?.displayName || user?.displayName || 'Gestionnaire Paie',
          createdAt: serverTimestamp(),
          date: serverTimestamp(),
          paymentId: paymentRef.id, // linked reference for deletions
          projectId: projId !== 'OFFICE-MAIN' ? projId : '' // assign as project cost if applicable!
        };
        await addDoc(collection(db, 'expenses'), expenseData);
      } catch (err) {
        console.error("Erreur d'intégration automatique comptable :", err);
      }

      await saveAuditLog('AJOUT', 'payments', `Fiche éditée & versement validé pour ${emp?.name} [Période ${salaryForm.month}] (${netCalculated} DA) affecté à ${projName}`);
      toast.success("Paiement enregistré, bulletin édité, et comptabilité synchronisée !");
      setIsSalaryModalOpen(false);
    } catch (e) {
      toast.error("Erreur de traitement du versement");
    }
  };

  // Base64 document attachment selector handler
  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (uploadEvent) => {
      const base64Data = uploadEvent.target?.result as string;
      if (!base64Data) return;

      const newDoc = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        fileBase64: base64Data,
        addedAt: format(new Date(), 'yyyy-MM-dd HH:mm')
      };

      try {
        const updatedDocs = [...(profileViewEmp?.documents || []), newDoc];
        await updateDoc(doc(db, 'employees', profileViewEmp.id), {
          documents: updatedDocs
        });
        setProfileViewEmp({ ...profileViewEmp, documents: updatedDocs });
        await saveAuditLog('AJOUT', 'documents', `Nouveau document attaché (${file.name}) pour l'employé ${profileViewEmp.name}`);
        toast.success("Document importé et archivé en sécurité");
      } catch (err) {
        toast.error("Impossible d'associer le document");
      }
    };
    reader.readAsDataURL(file);
  };

  // Corporate PDF generator for payslip (A4 clean sheet)
  const generatePayslipPDF = (payRecord: any) => {
    const doc = new jsPDF() as any;
    const emp = employees.find(e => e.id === payRecord.employeeId) || profileViewEmp;

    const breakdown = payRecord.salaryBreakdown || {
      base: payRecord.amount,
      bonus: 0,
      allow: 0,
      deduct: 0,
      netCalculated: payRecord.amount,
      monthCode: format(new Date(payRecord.date as any), 'yyyy-MM')
    };

    // Header Frame
    doc.setFillColor(2, 116, 190); // Astra Blue
    doc.rect(0, 0, 210, 36, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text(settings?.name?.toUpperCase() || 'ASTRA ERP & POS', 15, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(220, 235, 255);
    doc.text(settings?.slogan || 'SYSTÈME RH & COMPTABILITÉ DOUBLE ENTRÉE', 15, 29);

    // Document title header inside sheet
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(16);
    doc.text('BULLETIN DE PAIE SIMPLIFIÉ', 15, 52);
    
    // Grid alignment parameters
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Matricule : ${emp?.matricule || 'EMP-TEMP'}`, 15, 61);
    doc.text(`Nom de l'Employé : ${emp?.name || payRecord.employeeName}`, 15, 67);
    doc.text(`Fonction / Poste : ${emp?.role || '-'}`, 15, 73);
    doc.text(`Département / Service : ${emp?.department || 'Exploitation'}`, 15, 79);

    doc.text(`Période : ${breakdown.monthCode}`, 130, 61);
    doc.text(`Date de Paiement : ${format((payRecord.date as any)?.toDate ? (payRecord.date as any).toDate() : new Date(payRecord.date), 'dd MMMM yyyy', { locale: fr })}`, 130, 67);
    doc.text(`Méthode : ${payRecord.paymentMethod?.toUpperCase() || 'ESPECES'}`, 130, 73);
    doc.text(`ID Réf : #${payRecord.id?.slice(-8).toUpperCase()}`, 130, 79);

    // Decorative line separator
    doc.setDrawColor(220, 225, 230);
    doc.setLineWidth(0.5);
    doc.line(15, 87, 195, 87);

    // Financial Breakdown autoTable
    autoTable(doc, {
      startY: 92,
      head: [['Rubriques de Paie', 'Part Salariale (+) (DA)', 'Retenues (-) (DA)']],
      body: [
        ['Salaire de Base de Référence', formatCurrency(breakdown.base), '0.00'],
        ['Indemnités de Mission & Déplacement', formatCurrency(breakdown.allow), '0.00'],
        ['Primes de Rendement exceptionnelles', formatCurrency(breakdown.bonus), '0.00'],
        ['Retenues Administratives & Avances perçues', '0.00', formatCurrency(breakdown.deduct)],
        ['Total Rémunérations bruts', formatCurrency(breakdown.base + breakdown.allow + breakdown.bonus), formatCurrency(breakdown.deduct)]
      ],
      headStyles: { fillColor: [2, 116, 190] },
      theme: 'grid',
      styles: { fontSize: 8.5, fontStyle: 'bold' }
    });

    const netY = (doc as any).lastAutoTable.finalY + 14;

    // Highlights Box for Net Salary Paid
    doc.setFillColor(246, 248, 251);
    doc.rect(15, netY, 180, 20, 'F');
    doc.setDrawColor(2, 116, 190);
    doc.setLineWidth(1);
    doc.line(15, netY, 15, netY + 20); // Thick Astra blue bar prefix

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(25, 30, 35);
    doc.text('NET À PAYER DIRECTEMENT (DA) :', 20, netY + 12);
    
    doc.setFontSize(15);
    doc.setTextColor(2, 116, 190);
    doc.text(`${formatCurrency(breakdown.netCalculated)} DA`, 115, netY + 12.5);

    // Signature Area
    const signY = netY + 42;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Signature de l\'Employé', 25, signY);
    doc.text('Le Directeur Général (Cachet & Signature)', 115, signY);

    doc.setDrawColor(200, 205, 210);
    doc.setLineWidth(0.4);
    doc.rect(20, signY + 4, 60, 22);
    doc.rect(115, signY + 4, 70, 22);

    // Page number bottom footer
    doc.setFontSize(7.5);
    doc.setTextColor(165, 175, 185);
    doc.text(`Édité électroniquement via Astra ERP - Document certifié conforme pour la période ${breakdown.monthCode}`, 15, 287);

    doc.save(`Fiche_De_Paie_${emp?.name?.replace(/\s+/g, '_')}_${breakdown.monthCode}.pdf`);
    toast.success("Impression PDF lancée avec succès !");
  };

  // Comprehensive HR PDF report builder
  const handleExportHRPDF = () => {
    const doc = new jsPDF();
    
    doc.setFillColor(2, 116, 190);
    doc.rect(0, 0, 210, 36, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('RAPPORT AUDIT RH COMPLET - ASTRA ERP', 15, 22);
    doc.setFontSize(10);
    doc.setTextColor(220, 235, 255);
    doc.text(`Document Administratif édité à la date du ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 15, 29);

    doc.setTextColor(25, 30, 35);
    doc.setFontSize(12);
    doc.text('1. SYNTHÈSE STATISTIQUE DE L\'EFFECTIF', 15, 48);

    autoTable(doc, {
      startY: 52,
      head: [['Métrique RH', 'Valeur', 'Observations']],
      body: [
        ['Total effectif recensé', `${totalEmployees} employés`, 'Dossiers actifs'],
        ['Personnel opérationnel actif', `${activeEmployees} présents`, 'En poste au quotidien'],
        ['Taux d\'absentéisme ce jour', `${absentToday > 0 ? ((absentToday / totalEmployees) * 100).toFixed(1) : 0}%`, 'Indice de ponctualité global'],
        ['Masse budgétaire brute de base', `${formatCurrency(totalBaseSalaryPayroll)} DA`, 'Consommation mensuelle hors charges variables']
      ],
      headStyles: { fillColor: [2, 116, 190] },
      theme: 'grid'
    });

    doc.setFontSize(12);
    doc.text('2. CLASSEMENT DES SALARIÉS ET CONTRACTUELS', 15, (doc as any).lastAutoTable.finalY + 12);

    const personnelRows = employees.map(emp => [
      emp.matricule || '-',
      emp.name,
      emp.role,
      emp.department || 'Non assigné',
      emp.contractType || 'CDI',
      emp.isActive ? 'ACTIF' : 'INACTIF',
      `${formatCurrency(emp.baseSalary || emp.rate)} DA`
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 16,
      head: [['Matricule', 'Nom complet', 'Poste', 'Département', 'Contrat', 'Statut', 'Salaire']],
      body: personnelRows,
      headStyles: { fillColor: [71, 85, 105] },
      theme: 'striped'
    });

    doc.save(`Audit_RH_Consolide_${format(new Date(), 'yyyyMMdd')}.pdf`);
    toast.success("Rapport d'audit RH PDF exporté !");
  };

  // Reset helper
  const resetEmployeeForm = () => {
    setSelectedEmp(null);
    setEmployeeForm({
      name: '',
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      role: '',
      salaryBasis: 'monthly',
      rate: 0,
      isActive: true,
      matricule: '',
      birthDate: '',
      gender: 'M',
      address: '',
      nationality: 'Algérienne',
      idNumber: '',
      familyStatus: 'Célibataire',
      emergencyContact: '',
      department: 'Exploitation',
      service: 'Technique',
      hireDate: format(new Date(), 'yyyy-MM-dd'),
      contractType: 'CDI',
      status: 'active',
      manager: '',
      accessLevel: 'employee',
      assignedProjects: [],
      baseSalary: 0,
      bonusesDefault: 0,
      allowancesDefault: 0,
      deductionsDefault: 0,
      photoBase64: '',
      documents: []
    });
  };

  // Advanced listings filtering
  const filteredEmployeesList = employees.filter(emp => {
    const matchesSearch = emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.role?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.matricule?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDep = filterDepartment === 'all' || emp.department === filterDepartment;
    
    // Status filter: by default 'all' hides archived employees unless 'archived' is specifically requested
    let matchesStatus = true;
    if (filterStatus === 'all') {
      matchesStatus = emp.status !== 'archived';
    } else if (filterStatus === 'active') {
      matchesStatus = emp.isActive && emp.status !== 'archived';
    } else if (filterStatus === 'inactive') {
      matchesStatus = !emp.isActive && emp.status !== 'archived';
    } else {
      matchesStatus = emp.status === filterStatus;
    }

    const matchesContract = filterContract === 'all' || emp.contractType === filterContract;
    
    // Project filter (matches of assignedProjects array)
    const matchesProj = filterProject === 'all' || 
                        (emp.assignedProjects && emp.assignedProjects.includes(filterProject));
    
    // Hire date period filter
    const hireDateStr = emp.hireDate || '';
    const matchesPeriod = (!filterHireDateStart || hireDateStr >= filterHireDateStart) && 
                          (!filterHireDateEnd || hireDateStr <= filterHireDateEnd);

    return matchesSearch && matchesDep && matchesStatus && matchesContract && matchesProj && matchesPeriod;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 pb-20">
      
      {/* Dynamic Header Block */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden shadow-xs">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0274be]/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#0274be]/10 text-[#0274be] flex items-center justify-center">
            <Users size={24} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
              {isEmployeeOnly ? "Mon Espace Collaborateur" : "Cabinet & Administration RH"}
            </h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">
              {isEmployeeOnly ? "Gérez vos informations, congés et accédez à vos fiches de paie" : "Espace centralisé de suivi des pointages, fiches de paies et carrières"}
            </p>
          </div>
        </div>
        
        {/* Dynamic Action Buttons depending on role */}
        {!isEmployeeOnly && (
          <div className="flex flex-wrap gap-2 relative z-10">
            <Button 
              variant="outline" 
              onClick={handleExportHRPDF} 
              className="border-slate-200 font-extrabold uppercase text-[11px] h-10 px-4"
            >
              <FileDown size={14} className="mr-1.5" /> Rapport HR PDF
            </Button>
            {isRH && (
              <Button 
                onClick={() => { resetEmployeeForm(); setIsEmployeeModalOpen(true); }} 
                className="bg-[#0274be] text-white hover:bg-[#015a94] font-extrabold uppercase text-[11px] h-10 px-4 transition-transform hover:-translate-y-0.5"
              >
                <Plus size={14} className="mr-1.5" /> Recruter Salarié
              </Button>
            )}
            {isRH && (
              <Button 
                onClick={() => setIsAttendanceModalOpen(true)} 
                className="bg-slate-700 hover:bg-slate-800 text-white font-extrabold uppercase text-[11px] h-10 px-4"
              >
                <Clock size={14} className="mr-1.5" /> Enregistrer Pointage
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Unified Tab Nav bar */}
      <div className="flex overflow-x-auto gap-1 border-b border-slate-200 pb-px scrollbar-none">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: Activity, show: !isEmployeeOnly },
          { id: 'roster', label: isEmployeeOnly ? 'Mon Profil' : 'Effectif & Profils', icon: Users2, show: true },
          { id: 'attendance', label: 'Présences & Heures', icon: Clock, show: true },
          { id: 'leaves', label: 'Demandes de Congés', icon: Calendar, show: true },
          { id: 'payroll', label: 'Salaires & Bulletins', icon: DollarSign, show: isComptable || isEmployeeOnly },
          { id: 'documents', label: 'Banque de Fichiers', icon: FileText, show: isEmployeeOnly },
          { id: 'audit', label: 'Journal des Suppressions', icon: ShieldCheck, show: isSuperadmin }
        ].map(tab => tab.show && (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "px-4 py-3 border-b-2 text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap shrink-0",
              activeTab === tab.id 
                ? "border-[#0274be] text-[#0274be] bg-white" 
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            )}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: DASHBOARD STATS */}
      {activeTab === 'dashboard' && !isEmployeeOnly && (
        <div className="space-y-6">
          {/* Quick Metrics Lineup */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Total Effectif</span>
              <span className="text-2xl font-black text-[#0274be] block mt-1">{totalEmployees}</span>
              <span className="text-[7.5px] font-bold text-slate-500 block mt-1">Dossiers ouverts</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Salariés Actifs</span>
              <span className="text-2xl font-black text-emerald-600 block mt-1">{activeEmployees}</span>
              <span className="text-[7.5px] font-bold text-slate-500 block mt-1">En service</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Présents ce jour</span>
              <span className="text-2xl font-black text-blue-600 block mt-1">{presentToday}</span>
              <span className="text-[7.5px] font-bold text-slate-500 block mt-1">{totalEmployees - presentToday} restants</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Actifs En Congé</span>
              <span className="text-2xl font-black text-amber-500 block mt-1">{onLeaveToday}</span>
              <span className="text-[7.5px] font-bold text-slate-500 block mt-1">Départs validés</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Nouveaux ce mois</span>
              <span className="text-2xl font-black text-fuchsia-600 block mt-1">+{newHiresThisMonth}</span>
              <span className="text-[7.5px] font-bold text-slate-500 block mt-1">Intégrations</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Masse de Base Est.</span>
              <span className="text-lg font-black text-slate-800 block mt-1.5 truncate">{formatCurrency(totalBaseSalaryPayroll)} DA</span>
              <span className="text-[7.5px] font-bold text-slate-500 block mt-0.5">Budget mensuel</span>
            </div>
          </div>

          {/* Graphical charts rows */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">Évolution historique de la masse salariale (Paiements)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={getPayrollChartData()}>
                    <defs>
                      <linearGradient id="colorMasse" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0274be" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#0274be" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <Tooltip formatter={(value) => `${value} DA`} />
                    <Area type="monotone" dataKey="Masse" stroke="#0274be" fillOpacity={1} fill="url(#colorMasse)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">Répartition par types de contrats</h3>
                <div className="h-48 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getContractStatusData()}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {getContractStatusData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                {getContractStatusData().map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span>{item.name} : {item.value} personnels</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Real-Time Notification Center */}
          <div className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-6">
            <h3 className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-2 mb-4">
              <Activity size={16} className="text-amber-600" /> Notifications et Alertes Administratives Automatiques
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Alert: Leaves to approve */}
              {leaves.some(l => l.status === 'pending') && (
                <div className="bg-white p-3 rounded-xl border border-amber-200 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-amber-500" />
                    <span className="text-[10px] font-black uppercase text-slate-700">Demandes de congés à approuver ({leaves.filter(l => l.status === 'pending').length})</span>
                  </div>
                  <button onClick={() => setActiveTab('leaves')} className="text-amber-600 hover:underline text-[9px] font-black uppercase tracking-wider">Inspecter</button>
                </div>
              )}
              {/* Alert: High absenteeism or late check ins */}
              {attendance.some(a => a.date === todayStr && a.status === 'late') && (
                <div className="bg-white p-3 rounded-xl border border-rose-200 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2">
                    <UserX size={16} className="text-rose-500" />
                    <span className="text-[10px] font-black uppercase text-slate-700">Retards enregistrés aujourd'hui ({attendance.filter(a => a.date === todayStr && a.status === 'late').length})</span>
                  </div>
                  <button onClick={() => setActiveTab('attendance')} className="text-[#0274be] hover:underline text-[9px] font-black uppercase tracking-wider">Consulter</button>
                </div>
              )}
              {/* Alert: Happy birth days */}
              {employees.some(e => e.birthDate && e.birthDate.slice(5) === format(new Date(), 'MM-dd')) && (
                <div className="bg-white p-3 rounded-xl border border-emerald-200 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-emerald-500 animate-bounce" />
                    <span className="text-[10px] font-black uppercase text-slate-700">Aujourd'hui, c'est l'anniversaire d'un collaborateur ! 🎉</span>
                  </div>
                  <button onClick={() => setActiveTab('roster')} className="text-emerald-600 hover:underline text-[9px] font-black uppercase tracking-wider">Voir personnel</button>
                </div>
              )}
              {/* General active indicator status */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#0274be]" />
                  <span className="text-[10px] font-black uppercase text-slate-700">Coffre-fort documents chiffré</span>
                </div>
                <span className="text-[8px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">100% SÉCURISÉ</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EFFECTIF PERSONNEL DIRECTORY */}
      {activeTab === 'roster' && (
        <div className="space-y-6">
          {isEmployeeOnly ? (
            /* Individual employee profile card view if single employee user */
            profileViewEmp ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row gap-6 items-center border-b border-slate-100 pb-6">
                  <div className="w-24 h-24 rounded-full bg-slate-100 border border-slate-200/80 overflow-hidden flex items-center justify-center shrink-0">
                    {profileViewEmp.photoBase64 ? (
                      <img src={profileViewEmp.photoBase64} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-black text-[#0274be]">{profileViewEmp.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="text-center md:text-left">
                    <h2 className="text-xl font-black text-slate-800 uppercase">{profileViewEmp.name}</h2>
                    <p className="text-xs font-bold text-[#0274be] uppercase tracking-wider">{profileViewEmp.role} (Code: {profileViewEmp.matricule})</p>
                    <div className="flex gap-2 justify-center md:justify-start mt-3">
                      <Badge className="bg-emerald-50 text-emerald-700 uppercase">{profileViewEmp.contractType}</Badge>
                      <Badge className="bg-slate-100 text-slate-600 uppercase">{profileViewEmp.department}</Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Personal details info container */}
                  <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200/50 space-y-3">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2 flex items-center gap-1.5">
                      <Users size={14} className="text-[#0274be]" /> Coordonnées & Informations Personnelles
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-xs font-bold text-slate-600 uppercase">
                      <div>Date Naissance : <span className="text-slate-800">{profileViewEmp.birthDate || '-'}</span></div>
                      <div>Sexe : <span className="text-slate-800">{profileViewEmp.gender === 'M' ? 'HOMME' : 'FEMME'}</span></div>
                      <div>Téléphone : <span className="text-slate-800">{profileViewEmp.phone || '-'}</span></div>
                      <div>Email : <span className="text-slate-800 truncate block lowercase">{profileViewEmp.email || '-'}</span></div>
                      <div>Identité : <span className="text-slate-800">{profileViewEmp.idNumber || '-'}</span></div>
                      <div>Famille : <span className="text-slate-800">{profileViewEmp.familyStatus || '-'}</span></div>
                      <div className="col-span-2">Adresse : <span className="text-slate-800 normal-case">{profileViewEmp.address || '-'}</span></div>
                      <div className="col-span-2">Contact D'urgence : <span className="text-slate-850 bg-amber-50 px-2 py-0.5 rounded">{profileViewEmp.emergencyContact || '-'}</span></div>
                    </div>
                  </div>

                  {/* Professional details container */}
                  <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200/50 space-y-3">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2 flex items-center gap-1.5">
                      <Building size={14} className="text-[#0274be]" /> Carrière & Données Professionnelles
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-600 uppercase">
                      <div>Département : <span className="text-slate-800">{profileViewEmp.department}</span></div>
                      <div>Service : <span className="text-slate-800">{profileViewEmp.service}</span></div>
                      <div>Contrat : <span className="text-slate-800">{profileViewEmp.contractType}</span></div>
                      <div>Date Embauche : <span className="text-slate-800">{profileViewEmp.hireDate}</span></div>
                      <div>Stabilité / Statut : <span className="text-slate-800">{profileViewEmp.status === 'active' ? 'ACTIF EN POSTE' : 'INACTIF'}</span></div>
                      <div>Responsable : <span className="text-slate-800">{profileViewEmp.manager || '-'}</span></div>
                    </div>
                  </div>
                </div>

                {/* Sub-documents inside Employee Space */}
                <div className="border-t border-slate-100 pt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                      <Paperclip size={14} className="text-[#0274be]" /> Fichiers numérisés attachés à mon dossier
                    </h3>
                    <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 h-9 px-4 rounded-lg flex items-center justify-center font-extrabold uppercase text-[10px] tracking-wider cursor-pointer border border-slate-200 shadow-xs">
                      <Plus size={14} className="mr-1.5" /> Charger un Document
                      <input type="file" className="hidden" onChange={handleDocumentUpload} />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(profileViewEmp.documents || []).map((docFile: any, idx: number) => (
                      <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={20} className="text-[#0274be] shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase text-slate-800 truncate block">{docFile.name}</span>
                            <span className="text-[8px] text-slate-400 font-bold block">{docFile.addedAt}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <a href={docFile.fileBase64} download={docFile.name} className="text-[#0274be] hover:underline text-[9px] font-bold uppercase shrink-0">Télécharger</a>
                          <button onClick={() => requestDelete(profileViewEmp.id, 'documents', docFile.name)} className="text-rose-600 hover:text-rose-800 font-extrabold">×</button>
                        </div>
                      </div>
                    ))}
                    {(profileViewEmp.documents || []).length === 0 && (
                      <p className="text-[10px] text-slate-400 italic font-bold">Aucun document chargé pour le moment.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center font-bold text-slate-500 uppercase text-xs py-12">Fiche employé absente. Assurez-vous d'avoir saisi votre adresse email ({user?.email}) lors du recrutement.</p>
            )
          ) : (
            /* Administrator / HR effectif search directory */
            <div className="space-y-4">
              {/* Dynamic Filtering Frame */}
              <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3.5">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex-1 min-w-[240px] relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input 
                      placeholder="Recherche par nom, poste ou matricule de l'employé..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-9 h-10 text-xs bg-white"
                    />
                  </div>
                  
                  <select 
                    value={filterDepartment} 
                    onChange={e => setFilterDepartment(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-extrabold text-[#0274be] uppercase h-10 focus:outline-none"
                  >
                    <option value="all">📁 Tous Départements</option>
                    <option value="Exploitation">Exploitation</option>
                    <option value="Direction">Direction</option>
                    <option value="Technique">Technique</option>
                    <option value="RH">RH</option>
                    <option value="Logistique">Logistique</option>
                  </select>

                  <select 
                    value={filterContract} 
                    onChange={e => setFilterContract(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-extrabold text-[#0274be] uppercase h-10 focus:outline-none"
                  >
                    <option value="all">📝 Tous Contrats</option>
                    <option value="CDI">CDI</option>
                    <option value="CDD">CDD</option>
                    <option value="Interim">Intérim</option>
                    <option value="Stage">Stage</option>
                  </select>

                  <select 
                    value={filterStatus} 
                    onChange={e => setFilterStatus(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-extrabold text-[#0274be] uppercase h-10 focus:outline-none"
                  >
                    <option value="all">🚦 Tous Statuts</option>
                    <option value="active">Actifs (En poste)</option>
                    <option value="suspended">Suspendus de service</option>
                    <option value="resigned">Démissionnaires</option>
                    <option value="archived">Archivés</option>
                  </select>
                </div>

                <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-slate-400">🏗️ Par Chantier :</span>
                    <select 
                      value={filterProject} 
                      onChange={e => setFilterProject(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-700 uppercase focus:outline-none"
                    >
                      <option value="all">Tous les Chantiers</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-[10px] font-black uppercase text-slate-400">📅 Période Embauche :</span>
                    <Input 
                      type="date" 
                      value={filterHireDateStart} 
                      onChange={e => setFilterHireDateStart(e.target.value)} 
                      className="bg-white max-w-[130px] text-xs h-8"
                    />
                    <span className="text-[10px] text-slate-400 font-bold">au</span>
                    <Input 
                      type="date" 
                      value={filterHireDateEnd} 
                      onChange={e => setFilterHireDateEnd(e.target.value)} 
                      className="bg-white max-w-[130px] text-xs h-8"
                    />
                    {(filterHireDateStart || filterHireDateEnd || filterProject !== 'all') && (
                      <button 
                        onClick={() => {
                          setFilterProject('all');
                          setFilterHireDateStart('');
                          setFilterHireDateEnd('');
                        }}
                        className="text-[9px] uppercase font-black text-rose-500 hover:underline ml-2"
                      >
                        Reset ×
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Grid block of employees */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEmployeesList.map(emp => (
                  <div key={emp.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between group relative">
                    <div className="absolute top-4 right-4 flex gap-1.5">
                      <Badge className={cn(
                        "text-[8px] font-black px-2 py-0.5",
                        emp.isActive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      )}>
                        {emp.isActive ? 'ACTIF' : 'INACTIF'}
                      </Badge>
                      <Badge className="bg-slate-50 border border-slate-200 text-slate-500 font-extrabold text-[8px]">{emp.contractType}</Badge>
                    </div>

                    <div>
                      {/* Avatar & Identifiers */}
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-slate-100 rounded-2xl border border-slate-200/60 overflow-hidden flex items-center justify-center text-slate-500 font-black shrink-0 relative">
                          {emp.photoBase64 ? (
                            <img src={emp.photoBase64} alt="Profil" className="w-full h-full object-cover" />
                          ) : (
                            emp.name?.charAt(0)
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-black text-slate-800 uppercase truncate leading-tight">{emp.name}</h3>
                          <span className="text-[10px] font-black text-[#0274be] block mt-0.5">{emp.role}</span>
                          <span className="text-[8.5px] font-black text-slate-400 block tracking-wider mt-0.5">{emp.matricule}</span>
                        </div>
                      </div>

                      {/* Professional specs */}
                      <div className="space-y-2 text-[11px] font-bold text-slate-600 uppercase pt-2 border-t border-slate-100 mb-6">
                        <div className="flex justify-between">
                          <span>Téléphone</span>
                          <span className="text-slate-700">{emp.phone || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Département</span>
                          <span className="text-slate-700">{emp.department}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Héritage Rémunération</span>
                          <span className="text-[#0274be] font-black">{formatCurrency(emp.baseSalary || emp.rate)} DA</span>
                        </div>
                      </div>
                    </div>

                    {/* Operational Actions */}
                    <div className="flex gap-2 border-t border-slate-100 pt-3 mt-auto">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setProfileViewEmp(emp)} 
                        className="flex-1 h-9 rounded-xl text-[9px] font-black uppercase text-slate-600 hover:text-[#0274be]"
                      >
                        <Eye size={12} className="mr-1" /> Profil complet
                      </Button>
                      {isRH && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleEditEmployeeClick(emp)} 
                          className="h-9 w-9 rounded-xl border-slate-200 hover:border-[#0274be] hover:bg-slate-50 text-slate-600"
                        >
                          <Edit2 size={12} />
                        </Button>
                      )}
                      {isRH && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => requestDelete(emp.id!, 'employees', emp.name)} 
                          className="h-9 w-9 rounded-xl border-rose-100 text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {filteredEmployeesList.length === 0 && (
                  <div className="col-span-full bg-white border border-slate-200/85 p-12 text-center rounded-3xl">
                    <p className="text-slate-400 italic font-black uppercase tracking-widest text-[11px]">Aucun collaborateur correspondant aux critères de filtres.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ATTENDANCE & POINTAGES */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Feuille d'émargement et Registre des Présences</h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Notez les présences et calculez automatiquement les retards et heures de service</p>
            </div>
            {isRH && !isEmployeeOnly && (
              <Button 
                onClick={() => setIsAttendanceModalOpen(true)}
                className="bg-[#0274be] text-white hover:bg-[#015a94] text-xs font-black uppercase tracking-widest"
              >
                + Émarger une Présence
              </Button>
            )}
          </div>

          {/* Quick Real-Time Checklist pointages for active employees */}
          {!isEmployeeOnly && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-3">⏱️ Pointage Direct Rapide (Aujourd'hui : {format(new Date(), 'dd MMMM yyyy', { locale: fr })})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {employees.filter(e => e.isActive && e.status === 'active').map(emp => {
                  const hasChecked = attendance.find(a => a.employeeId === emp.id && a.date === todayStr);
                  return (
                    <div key={emp.id} className="bg-white p-3 rounded-xl border border-slate-200/80 flex items-center justify-between shadow-xs">
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] font-black text-slate-800 uppercase block truncate">{emp.name}</span>
                        <span className="text-[8px] text-slate-400 block">{emp.role}</span>
                      </div>
                      <button
                        onClick={() => handleQuickClockIn(emp)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase transition-colors shrink-0",
                          hasChecked?.checkOut
                            ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                            : (hasChecked ? "bg-amber-500 text-white" : "bg-[#0274be] text-white hover:bg-[#015a94]")
                        )}
                        disabled={!!hasChecked?.checkOut}
                      >
                        {hasChecked?.checkOut ? 'Complet' : (hasChecked ? 'Clock Out' : 'Clock In')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Attendance logs lists */}
          <div className="overflow-x-auto">
            <table className="mzsoft-table">
              <thead>
                <tr>
                  <th>Date d'Émargement</th>
                  <th>Collaborateur</th>
                  <th>Arrivée</th>
                  <th>Départ</th>
                  <th>Heures Totales</th>
                  <th>Indice de retard</th>
                  <th>Heures Supp.</th>
                  <th>Statut</th>
                  {isRH && !isEmployeeOnly && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {attendance
                  .filter(att => !isEmployeeOnly || att.employeeId === matchedEmployee?.id)
                  .map(att => (
                    <tr key={att.id}>
                      <td>{format(new Date(att.date + "T00:00:00"), 'dd MMMM yyyy', { locale: fr })}</td>
                      <td className="font-bold text-slate-800 uppercase text-xs">{att.employeeName}</td>
                      <td className="font-extrabold text-slate-700">{att.checkIn || '-'}</td>
                      <td className="font-extrabold text-slate-700">{att.checkOut || 'En cours...'}</td>
                      <td className="font-extrabold text-emerald-600">{att.hoursWorked} heures</td>
                      <td>
                        {att.delayMinutes > 0 ? (
                          <span className="text-rose-600 font-extrabold">{att.delayMinutes} min retard</span>
                        ) : (
                          <span className="text-emerald-600 font-extrabold">Aucun retard</span>
                        )}
                      </td>
                      <td className="font-extrabold text-[#0274be]">+{att.overtime} hs</td>
                      <td>
                        <Badge className={cn(
                          "text-[8px] font-black px-1.5 py-0.5",
                          att.status === 'present' && "bg-emerald-50 text-emerald-700",
                          att.status === 'absent' && "bg-rose-50 text-rose-700",
                          att.status === 'late' && "bg-amber-100 text-amber-800",
                          att.status === 'excused' && "bg-slate-100 text-slate-600"
                        )}>
                          {att.status?.toUpperCase()}
                        </Badge>
                      </td>
                      {isRH && !isEmployeeOnly && (
                        <td>
                          <button 
                            onClick={() => requestDelete(att.id!, 'attendance', att.employeeName)}
                            className="text-slate-350 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                {attendance.filter(att => !isEmployeeOnly || att.employeeId === matchedEmployee?.id).length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400 italic">Aucun relevé d'émargement enregistré.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CONGES & ABSENCES */}
      {activeTab === 'leaves' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Registre d'Abstention & Gestion des Congés</h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Consultez, soumettez ou approuvez les demandes de vacances et maladies</p>
            </div>
            <Button 
              onClick={() => setIsLeaveModalOpen(true)}
              className="bg-[#0274be] text-white hover:bg-[#015a94] text-xs font-black uppercase tracking-widest"
            >
              + Déposer un Congé
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="mzsoft-table">
              <thead>
                <tr>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Employé bénéficiaire</th>
                  <th>Durée Cal.</th>
                  <th>Motif de Congé</th>
                  <th>Justificatifs</th>
                  <th>Statut décisionnel</th>
                  {isRH && !isEmployeeOnly && <th>Décision</th>}
                  <th>Annuler</th>
                </tr>
              </thead>
              <tbody>
                {leaves
                  .filter(l => !isEmployeeOnly || l.employeeId === matchedEmployee?.id)
                  .map(l => (
                    <tr key={l.id}>
                      <td>{format(new Date(l.startDate + "T00:00:00"), 'dd/MM/yyyy')}</td>
                      <td>{format(new Date(l.endDate + "T00:00:00"), 'dd/MM/yyyy')}</td>
                      <td className="font-bold text-slate-800 uppercase text-xs">{l.employeeName}</td>
                      <td className="font-extrabold text-slate-850">{l.days} jours calendaires</td>
                      <td>
                        <Badge className="bg-slate-100 text-slate-600 font-extrabold text-[8.5px] uppercase">
                          {l.type === 'annual' && 'ANNUEL'}
                          {l.type === 'sick' && 'MALADIE'}
                          {l.type === 'special' && 'EXCEP.'}
                          {l.type === 'other' && 'AUTRE'}
                        </Badge>
                      </td>
                      <td className="max-w-xs truncate text-[9px]">{l.reason || '-'}</td>
                      <td>
                        <Badge className={cn(
                          "text-[8px] font-black px-1.5 py-0.5",
                          l.status === 'approved' && "bg-emerald-50 text-emerald-700",
                          l.status === 'rejected' && "bg-rose-50 text-rose-700",
                          l.status === 'pending' && "bg-amber-100 text-amber-800"
                        )}>
                          {l.status?.toUpperCase()}
                        </Badge>
                      </td>
                      {isRH && !isEmployeeOnly && (
                        <td>
                          {l.status === 'pending' ? (
                            <div className="flex gap-1">
                              <button 
                                onClick={() => updateLeaveStatus(l.id!, 'approved')}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                title="Approuver"
                              >
                                <Check size={14} />
                              </button>
                              <button 
                                onClick={() => updateLeaveStatus(l.id!, 'rejected')}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                                title="Refuser"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[9px] text-slate-400 font-bold uppercase">TRAITÉ</span>
                          )}
                        </td>
                      )}
                      <td>
                        <button 
                          onClick={() => requestDelete(l.id!, 'leaves', l.employeeName)}
                          className="text-slate-350 hover:text-rose-600"
                          title="Supprimer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                {leaves.filter(l => !isEmployeeOnly || l.employeeId === matchedEmployee?.id).length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400 italic">Aucune de demande d'abscence / congé enregistrée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: SALAIRES ET BULLETINS DE PAIE */}
      {activeTab === 'payroll' && isComptable && (
        <div className="bg-white rounded-3xl border border-[#e2e8f0] p-6 shadow-xs space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Versement Salaires & Édition Bulletins</h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Visualisez les rémunérations individuelles, configurez les primes et générez le bulletin de paie format PDF</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {employees.filter(e => e.isActive && e.status === 'active').map(emp => (
              <div key={emp.id} className="bg-slate-50/50 rounded-2xl p-6 border border-slate-200 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-black text-[#191e23] uppercase">{emp.name}</h3>
                  <span className="text-[9px] font-black text-slate-450 block uppercase tracking-wider">{emp.matricule} - {emp.role}</span>
                  
                  <div className="space-y-1.5 text-xs text-slate-600 font-bold mt-4 border-t border-slate-100 pt-3">
                    <div className="flex justify-between">
                      <span>Salaire de base:</span>
                      <span className="text-slate-800 font-extrabold">{formatCurrency(emp.baseSalary || emp.rate)} DA</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Primes par défaut:</span>
                      <span className="text-slate-800 font-extrabold">+{formatCurrency(emp.bonusesDefault || 0)} DA</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Indemnités unitaire:</span>
                      <span className="text-slate-800 font-extrabold">+{formatCurrency(emp.allowancesDefault || 0)} DA</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Retenues / Taxes:</span>
                      <span className="text-rose-600 font-extrabold">-{formatCurrency(emp.deductionsDefault || 0)} DA</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 text-slate-800">
                      <span>Net Estimé payé:</span>
                      <span className="text-[#0274be] font-black">
                        {formatCurrency((emp.baseSalary || emp.rate || 0) + (emp.bonusesDefault || 0) + (emp.allowancesDefault || 0) - (emp.deductionsDefault || 0))} DA
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-slate-100/80 mt-4">
                  <Button 
                    onClick={() => handleOpenSalaryModal(emp)}
                    className="flex-1 bg-slate-900 text-white font-extrabold text-[10px] uppercase h-9 rounded-xl"
                  >
                    Gérer & Payer Salaire
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Past Payments Slip history */}
          <div className="pt-6 border-t border-slate-100 text-slate-850">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#0274be] mb-4">📜 Historique Général des versements de salaires</h3>
            <div className="overflow-x-auto">
              <table className="mzsoft-table">
                <thead>
                  <tr>
                    <th>Date d'édition</th>
                    <th>Nom du Salarié</th>
                    <th>Rubrique de base</th>
                    <th>Montant Net Versé</th>
                    <th>Méthode</th>
                    <th>Généré par</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments
                    .filter(pay => pay.projectName === 'Administration Générale (Paie)')
                    .map(pay => (
                      <tr key={pay.id}>
                        <td>{format((pay.date as any)?.toDate ? (pay.date as any).toDate() : new Date(pay.date as any), 'dd MMMM yyyy', { locale: fr })}</td>
                        <td className="font-bold text-slate-800 uppercase text-xs">{pay.employeeName}</td>
                        <td className="font-bold text-slate-600 uppercase text-[10px]">{pay.projectName}</td>
                        <td className="font-black text-[#0274be] text-xs font-mono">{formatCurrency(pay.amount)} DA</td>
                        <td className="font-bold uppercase text-[10px] text-slate-500">{pay.paymentMethod}</td>
                        <td className="font-bold text-slate-500 text-[10px]">{pay.createdByName || 'Admin'}</td>
                        <td className="flex gap-2">
                          <Button 
                            onClick={() => generatePayslipPDF(pay)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 h-8 px-2 text-[9px] font-black uppercase rounded-lg"
                          >
                            Télécharger PDF
                          </Button>
                          <button 
                            onClick={() => requestDelete(pay.id!, 'payments', pay.employeeName)}
                            className="text-slate-350 hover:text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  {payments.filter(pay => pay.projectName === 'Administration Générale (Paie)').length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 font-bold italic text-xs uppercase">Aucun versement stocké.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Individual Employee specific Payslip tab (If Employee is reading self profile details) */}
      {activeTab === 'payroll' && isEmployeeOnly && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Mes Bulletins & Historique de Paies</h2>
          <div className="overflow-x-auto">
            <table className="mzsoft-table">
              <thead>
                <tr>
                  <th>Date d'effet</th>
                  <th>ID Paiement</th>
                  <th>Rubrique / Nature</th>
                  <th>Montant perçu</th>
                  <th>Mode</th>
                  <th>Bulletins de Paie</th>
                </tr>
              </thead>
              <tbody>
                {payments
                  .filter(p => p.employeeId === matchedEmployee?.id)
                  .map(pay => (
                    <tr key={pay.id}>
                      <td>{format((pay.date as any)?.toDate ? (pay.date as any).toDate() : new Date(pay.date as any), 'dd/MM/yyyy')}</td>
                      <td className="font-mono text-[10px]">#{pay.id?.slice(-8).toUpperCase()}</td>
                      <td className="font-bold uppercase text-[9.5px]">{pay.projectName}</td>
                      <td className="font-black text-[#0274be]">{formatCurrency(pay.amount)} DA</td>
                      <td className="font-bold uppercase text-[10px]">{pay.paymentMethod}</td>
                      <td>
                        <Button 
                          onClick={() => generatePayslipPDF(pay)}
                          className="bg-slate-100 hover:bg-slate-200 text-[#0274be] h-8 px-3 text-[9px] font-black uppercase rounded-lg"
                        >
                          Générer PDF officiel
                        </Button>
                      </td>
                    </tr>
                  ))}
                {payments.filter(p => p.employeeId === matchedEmployee?.id).length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-450 italic">Aucune fiche de paie archivée dans le système.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: BANQUE DE FICHIERS DOCUMENTS FOR CUSTOM ROLES */}
      {activeTab === 'documents' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Coffre-fort Documents Administratifs</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Accédez à vos scans de diplômes, contrats de travail et cartes de sécurité sociale</p>
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 border-dashed text-center">
            <p className="text-xs text-slate-500 font-bold uppercase mb-3">Téléchargez des copies de documents légaux requis par l'administration RH</p>
            <label className="inline-flex bg-[#0274be] hover:bg-[#015a94] text-white h-10 px-6 rounded-xl items-center justify-center font-black text-xs uppercase cursor-pointer transition-colors shadow-xs">
              Charger un Document (PDF, Image, Max 2Mo)
              <input type="file" className="hidden" onChange={handleDocumentUpload} />
            </label>
          </div>
        </div>
      )}

      {/* TAB 7: SYSTEM AUDIT REVISION JOURNAL FOR DELETES */}
      {activeTab === 'audit' && isSuperadmin && (
        <div className="bg-white rounded-3xl border border-rose-200 p-6 shadow-xs space-y-4">
          <div className="flex gap-2 items-center">
            <ShieldCheck size={20} className="text-rose-600 animate-pulse" />
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest text-rose-700">Journal d'Audit & Historique des Deletions</h2>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Registre des suppressions et modifications définitives effectuées par l'administration</p>

          <div className="overflow-x-auto">
            <table className="mzsoft-table">
              <thead>
                <tr>
                  <th>Horodatage</th>
                  <th>Opérateur</th>
                  <th>Action</th>
                  <th>Dossier affecté</th>
                  <th>Détails techniques</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="font-mono text-[9px] text-slate-500">
                      {log.timestamp ? format((log.timestamp as any).toDate ? (log.timestamp as any).toDate() : new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss') : '-'}
                    </td>
                    <td className="font-bold text-slate-700 text-[10px] uppercase">{log.userName}</td>
                    <td>
                      <Badge className={cn(
                        "text-[8px] font-black px-2 py-0.5",
                        log.action === 'SUPPRESSION' ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-amber-50 text-amber-800"
                      )}>
                        {log.action}
                      </Badge>
                    </td>
                    <td className="font-black text-[10px] text-[#0274be] uppercase">{log.entity}</td>
                    <td className="text-slate-600 text-[9.5px] italic max-w-sm font-medium">{log.details}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-400 italic">Aucune modification historique stockée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT EMPLOYEE */}
      <Modal 
        isOpen={isEmployeeModalOpen} 
        onClose={() => setIsEmployeeModalOpen(false)} 
        title={selectedEmp ? `Modifier le collaborateur: ${employeeForm.name}` : "Recruter un Nouveau Collaborateur"}
      >
        <form onSubmit={handleEmployeeSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {/* PHOTO PROFILE LOADER & PREVIEW */}
          <div className="bg-slate-50 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-4 border border-slate-200/60">
            <div className="w-16 h-16 rounded-full bg-slate-200 border-2 border-[#0274be]/30 flex items-center justify-center shrink-0 overflow-hidden relative group">
              {employeeForm.photoBase64 ? (
                <img src={employeeForm.photoBase64} alt="Previsualisation" className="w-full h-full object-cover" />
              ) : (
                <Users size={28} className="text-slate-400" />
              )}
            </div>
            <div className="space-y-1.5 text-center sm:text-left">
              <span className="block text-[10px] font-black uppercase text-slate-600">📸 Photo d'identité de l'employé</span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 2 * 1024 * 1024) return toast.error("Fichier de photo trop lourd (Max 2 Mo)");
                    const reader = new FileReader();
                    reader.onload = (readerEvent) => {
                      setEmployeeForm({...employeeForm, photoBase64: readerEvent.target?.result as string});
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="hidden" 
                id="photo-upload-input" 
              />
              <label htmlFor="photo-upload-input" className="inline-flex bg-slate-900 hover:bg-slate-950 text-white font-black uppercase text-[8px] tracking-widest px-3 py-1.5 rounded-lg cursor-pointer transition-colors shadow-xs">
                Sélectionner une Photo / Pièce d'identité
              </label>
              <p className="text-[8px] text-slate-400 font-bold uppercase">Format JPG, PNG supporté (Recommandé: carré, max 2Mo)</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl space-y-3">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">📁 1. Informations Personnelles & Identité</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Nom de Famille *</label>
                <Input required value={employeeForm.lastName} onChange={e => setEmployeeForm({...employeeForm, lastName: e.target.value})} placeholder="Ex: Slimane" />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Prénom *</label>
                <Input required value={employeeForm.firstName} onChange={e => setEmployeeForm({...employeeForm, firstName: e.target.value})} placeholder="Ex: Mohamed" />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Email professionnel</label>
                <Input value={employeeForm.email} onChange={e => setEmployeeForm({...employeeForm, email: e.target.value})} placeholder="Ex: email@entreprise.com" />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Téléphone *</label>
                <Input required value={employeeForm.phone} onChange={e => setEmployeeForm({...employeeForm, phone: e.target.value})} placeholder="Ex: 0550123456" />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">N° Pièce Identité (CNI/Passeport)</label>
                <Input value={employeeForm.idNumber} onChange={e => setEmployeeForm({...employeeForm, idNumber: e.target.value})} placeholder="Ex: 109823974" />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Date Naissance</label>
                <Input type="date" value={employeeForm.birthDate} onChange={e => setEmployeeForm({...employeeForm, birthDate: e.target.value})} />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Sexe</label>
                <select className="erp-select text-xs h-9 bg-white w-full border border-slate-200" value={employeeForm.gender} onChange={e => setEmployeeForm({...employeeForm, gender: e.target.value as any})}>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Nationalité</label>
                <Input value={employeeForm.nationality} onChange={e => setEmployeeForm({...employeeForm, nationality: e.target.value})} />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Situation Familiale</label>
                <select className="erp-select text-xs h-9 bg-white w-full border border-slate-200" value={employeeForm.familyStatus} onChange={e => setEmployeeForm({...employeeForm, familyStatus: e.target.value as any})}>
                  <option value="Célibataire">Célibataire</option>
                  <option value="Marié">Marié(e)</option>
                  <option value="Divorcé">Divorcé(e)</option>
                  <option value="Veuf">Veuf(ve)</option>
                </select>
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Adresse de résidence</label>
                <Input value={employeeForm.address} onChange={e => setEmployeeForm({...employeeForm, address: e.target.value})} />
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Contact d'urgence & Téléphone (Nom + Numéro)</label>
                <Input value={employeeForm.emergencyContact} onChange={e => setEmployeeForm({...employeeForm, emergencyContact: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl space-y-3">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">💼 2. Carrière, Poste & Départements</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Poste / Titre Occupé *</label>
                <Input required value={employeeForm.role} onChange={e => setEmployeeForm({...employeeForm, role: e.target.value})} placeholder="Ex: Macon, Chauffeur, Electricien..." />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Département d'Assignation</label>
                <select className="erp-select text-xs h-9 bg-white w-full border border-slate-200" value={employeeForm.department} onChange={e => setEmployeeForm({...employeeForm, department: e.target.value})}>
                  <option value="Exploitation">Exploitation / Chantiers</option>
                  <option value="Direction">Direction</option>
                  <option value="Technique">Technique</option>
                  <option value="RH">RH</option>
                  <option value="Logistique">Logistique & Matériel</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Service Spécifique</label>
                <Input value={employeeForm.service} onChange={e => setEmployeeForm({...employeeForm, service: e.target.value})} />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Type de Contrat</label>
                <select className="erp-select text-xs h-9 bg-white w-full border border-slate-200" value={employeeForm.contractType} onChange={e => setEmployeeForm({...employeeForm, contractType: e.target.value as any})}>
                  <option value="CDI">CDI (Indéterminé)</option>
                  <option value="CDD">CDD (Déterminé)</option>
                  <option value="Interim">Intérim / Temporaire</option>
                  <option value="Stage">Stage / Apprenti</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Date Recrutement / Embauche</label>
                <Input type="date" value={employeeForm.hireDate} onChange={e => setEmployeeForm({...employeeForm, hireDate: e.target.value})} />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Statut Salarié</label>
                <select className="erp-select text-xs h-9 bg-white w-full border border-slate-200" value={employeeForm.status} onChange={e => setEmployeeForm({...employeeForm, status: e.target.value as any})}>
                  <option value="active">Actif (En service)</option>
                  <option value="suspended">Suspendu de ses fonctions</option>
                  <option value="resigned">Démissionnaire / Sorti</option>
                  <option value="archived">Archivé (Historique seulement)</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Supérieur d'Échelon (Manager)</label>
                <Input value={employeeForm.manager} onChange={e => setEmployeeForm({...employeeForm, manager: e.target.value})} />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Niveau d'Accompagnement / Rôle Application</label>
                <select className="erp-select text-xs h-9 bg-white w-full border border-slate-200" value={employeeForm.accessLevel} onChange={e => setEmployeeForm({...employeeForm, accessLevel: e.target.value as any})}>
                  <option value="employee">Employé (Accès restreint profil seulement)</option>
                  <option value="rh">Gestionnaire RH</option>
                  <option value="comptable">Comptable (Accès aux Fiches de paie)</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>

              {/* AFFECTATION MULTIPROJETS BADGES */}
              {projects.length > 0 && (
                <div className="col-span-1 md:col-span-2 bg-white p-3.5 rounded-xl border border-slate-250/60 mt-2 space-y-2">
                  <span className="block text-[9px] font-black uppercase text-[#0274be]">🔗 Affectation aux Chantiers Actifs *</span>
                  <p className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">Cochez les chantiers sur lesquels ce collaborateur est habilité à travailler pour simplifier ses émargements.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1.5">
                    {projects.map(p => {
                      const isChecked = employeeForm.assignedProjects?.includes(p.id!);
                      return (
                        <label key={p.id} className="flex items-center gap-2 bg-slate-50/50 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100/50 transition-colors">
                          <input 
                            type="checkbox" 
                            className="rounded text-[#0274be] focus:ring-[#0274be]"
                            checked={isChecked || false}
                            onChange={(ev) => {
                              const current = employeeForm.assignedProjects || [];
                              const updated = ev.target.checked 
                                ? [...current, p.id!]
                                : current.filter(id => id !== p.id);
                              setEmployeeForm({...employeeForm, assignedProjects: updated});
                            }}
                          />
                          <span className="font-extrabold uppercase text-[9px] text-slate-700 truncate">{p.name} ({p.location || 'Local'})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl space-y-3">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">💰 3. Variables & Mode de Rémunération</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Mode de Rémunération *</label>
                <select 
                  className="erp-select text-xs h-9 bg-white w-full border border-slate-200" 
                  value={employeeForm.salaryBasis} 
                  onChange={e => setEmployeeForm({...employeeForm, salaryBasis: e.target.value as any})}
                >
                  <option value="monthly">Paiement mensuel</option>
                  <option value="weekly">Paiement hebdomadaire</option>
                  <option value="daily">Paiement journalier</option>
                  <option value="project">Paiement par chantier</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Taux de Rémunération (DA) *</label>
                <Input 
                  type="number" 
                  required 
                  value={employeeForm.rate} 
                  onChange={e => {
                    const val = Number(e.target.value);
                    setEmployeeForm({...employeeForm, rate: val, baseSalary: val});
                  }} 
                  placeholder="Montant selon le mode de rémunération"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Primes par défaut (DA)</label>
                <Input type="number" value={employeeForm.bonusesDefault} onChange={e => setEmployeeForm({...employeeForm, bonusesDefault: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Indemnités récurrentes (DA)</label>
                <Input type="number" value={employeeForm.allowancesDefault} onChange={e => setEmployeeForm({...employeeForm, allowancesDefault: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">Retenues par défaut (Taxes/Retards)</label>
                <Input type="number" value={employeeForm.deductionsDefault} onChange={e => setEmployeeForm({...employeeForm, deductionsDefault: Number(e.target.value)})} />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" type="button" className="flex-1" onClick={() => setIsEmployeeModalOpen(false)}>Annuler</Button>
            <Button type="submit" className="flex-1 bg-[#0274be] text-white">Enregistrer & Recruter</Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: TIME IN / TIMEOUT MANUAL REGISTRY */}
      <Modal isOpen={isAttendanceModalOpen} onClose={() => setIsAttendanceModalOpen(false)} title="Enregistrer une ligne d'émargement de présence">
        <form onSubmit={handleAttendanceSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Employé *</label>
            <select required className="erp-select text-xs h-10 w-full border border-slate-200" value={attendanceForm.employeeId} onChange={e => setAttendanceForm({...attendanceForm, employeeId: e.target.value})}>
              <option value="">Sélectionner un employé...</option>
              {employees.filter(e => e.isActive && e.status === 'active').map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Chantier Concerné (Optionnel / Si affecté)</label>
            <select className="erp-select text-xs h-10 w-full border border-slate-200" value={attendanceForm.projectId} onChange={e => {
              const matchedProj = projects.find(p => p.id === e.target.value);
              setAttendanceForm({
                ...attendanceForm,
                projectId: e.target.value,
                projectName: matchedProj ? matchedProj.name : ''
              });
            }}>
              <option value="">Administration / Siège (Pas de chantier spécifique)</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.location || 'Local'})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Date</label>
              <Input type="date" required value={attendanceForm.date} onChange={e => setAttendanceForm({...attendanceForm, date: e.target.value})} />
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Heure Arrivée</label>
              <Input type="time" required value={attendanceForm.checkIn} onChange={e => setAttendanceForm({...attendanceForm, checkIn: e.target.value})} />
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Heure Départ</label>
              <Input type="time" required value={attendanceForm.checkOut} onChange={e => setAttendanceForm({...attendanceForm, checkOut: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Observation / Justificatif</label>
            <select className="erp-select text-xs h-10 w-full border border-slate-200" value={attendanceForm.status} onChange={e => setAttendanceForm({...attendanceForm, status: e.target.value as any})}>
              <option value="present">Présent & Ponctuel</option>
              <option value="absent">Absent non excused</option>
              <option value="late">Retard caractérisé</option>
              <option value="excused">Absence autorisée / Excusée</option>
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Commentaires</label>
            <textarea className="w-full erp-select min-h-[60px] border border-slate-200" value={attendanceForm.notes} onChange={e => setAttendanceForm({...attendanceForm, notes: e.target.value})} />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" type="button" className="flex-1" onClick={() => setIsAttendanceModalOpen(false)}>Annuler</Button>
            <Button type="submit" className="flex-1 bg-[#0274be] text-white">Valider & Archiver Pointage</Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: LEAVE ABSENCE REQUEST REQUEST */}
      <Modal isOpen={isLeaveModalOpen} onClose={() => setIsLeaveModalOpen(false)} title="Formulaire Demande de Conge Absences">
        <form onSubmit={handleLeaveSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Employé demandeur *</label>
            <select required className="erp-select text-xs h-10 w-full border border-slate-200" value={leaveForm.employeeId} onChange={e => setLeaveForm({...leaveForm, employeeId: e.target.value})}>
              <option value="">Sélectionner l'intéressé...</option>
              {employees.filter(e => e.isActive && e.status === 'active').map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Date Signature Début</label>
              <Input type="date" required value={leaveForm.startDate} onChange={e => setLeaveForm({...leaveForm, startDate: e.target.value})} />
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Date Clôture Fin</label>
              <Input type="date" required value={leaveForm.endDate} onChange={e => setLeaveForm({...leaveForm, endDate: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Catégorie d'absence</label>
            <select className="erp-select text-xs h-10 w-full border border-slate-200" value={leaveForm.type} onChange={e => setLeaveForm({...leaveForm, type: e.target.value as any})}>
              <option value="annual">Congés Annuels Programmés</option>
              <option value="sick">Congés de Maladie justifié</option>
              <option value="special">Congés Exceptionnels (Mariage, Naissance, Deuil)</option>
              <option value="other">Congés Sans Solde / Convenance</option>
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Motifs argumentés du départ</label>
            <textarea className="w-full erp-select min-h-[60px] border border-slate-200" required value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})} />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" type="button" className="flex-1" onClick={() => setIsLeaveModalOpen(false)}>Annuler</Button>
            <Button type="submit" className="flex-1 bg-[#0274be] text-white">Transmettre la Demande</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isSalaryModalOpen} onClose={() => setIsSalaryModalOpen(false)} title={`Calcul du bulletin de Paie de: ${selectedEmp?.name || ''}`}>
        <form onSubmit={handleSalarySubmit} className="space-y-4">
          <div className="bg-[#0274be]/5 p-3 rounded-lg flex flex-col sm:flex-row justify-between gap-2 text-[10px] text-slate-700 font-bold uppercase">
            <div>Mode de paiement configuré : <span className="font-extrabold text-slate-900">[{selectedEmp?.salaryBasis?.toUpperCase() || 'MENSUEL'}]</span></div>
            <div>Taux enregistré : <span className="font-extrabold text-slate-900">{formatCurrency(selectedEmp?.rate || selectedEmp?.baseSalary || 0)} DA</span></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Mois Concerné</label>
              <Input type="month" required value={salaryForm.month} onChange={e => {
                const updatedMonth = e.target.value;
                const { baseCalculated, reason } = getCalculatedSalaryInfo(selectedEmp.id, salaryForm.projectId || 'office', updatedMonth);
                setSalaryForm({
                  ...salaryForm,
                  month: updatedMonth,
                  baseSalary: String(baseCalculated),
                  notes: reason
                });
              }} />
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Affectation Comptable (Chantier)</label>
              <select className="erp-select text-xs h-10 w-full border border-slate-200" value={salaryForm.projectId} onChange={e => {
                const updatedProj = e.target.value;
                const { baseCalculated, reason } = getCalculatedSalaryInfo(selectedEmp.id, updatedProj, salaryForm.month);
                setSalaryForm({
                  ...salaryForm,
                  projectId: updatedProj,
                  baseSalary: String(baseCalculated),
                  notes: reason
                });
              }}>
                <option value="office">Administration Générale (Paie)</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[9px] font-black uppercase text-slate-500">Salaire de Base Référence (DA) *</label>
                <button 
                  type="button"
                  onClick={() => {
                    const { baseCalculated, reason } = getCalculatedSalaryInfo(selectedEmp.id, salaryForm.projectId || 'office', salaryForm.month);
                    setSalaryForm({
                      ...salaryForm,
                      baseSalary: String(baseCalculated),
                      notes: reason
                    });
                    toast.success("Rémunération recalculée sur la base des feuilles de pointages !");
                  }}
                  className="text-[8px] uppercase font-black text-[#0274be] hover:underline"
                >
                  ⚡ Recalculer auto
                </button>
              </div>
              <Input type="number" required value={salaryForm.baseSalary} onChange={e => setSalaryForm({...salaryForm, baseSalary: e.target.value})} />
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Primes de Rendement (+) (DA)</label>
              <Input type="number" required value={salaryForm.bonuses} onChange={e => setSalaryForm({...salaryForm, bonuses: e.target.value})} />
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Indemnités Missions (+) (DA)</label>
              <Input type="number" required value={salaryForm.allowances} onChange={e => setSalaryForm({...salaryForm, allowances: e.target.value})} />
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Retenues sur salaire (-) (DA)</label>
              <Input type="number" required value={salaryForm.deductions} onChange={e => setSalaryForm({...salaryForm, deductions: e.target.value})} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Mode de Règlement</label>
              <select className="erp-select text-xs h-10 w-full border border-slate-200" value={salaryForm.paymentMethod} onChange={e => setSalaryForm({...salaryForm, paymentMethod: e.target.value})}>
                <option value="cash">Espèces en caisse</option>
                <option value="transfer">Virement Bancaire (CCP)</option>
                <option value="card">Carte Bancaire / Chèque</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Justification et détails de calcul (Base de fiches de pointage)</label>
            <textarea className="w-full erp-select min-h-[50px] border border-slate-200 text-xs bg-slate-50 font-mono text-slate-600" value={salaryForm.notes} onChange={e => setSalaryForm({...salaryForm, notes: e.target.value})} />
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/50 flex justify-between items-center text-xs">
            <span className="font-extrabold uppercase text-slate-600">Net Final Net d'échelon à régler :</span>
            <span className="font-black text-lg text-[#0274be]">
              {formatCurrency((Number(salaryForm.baseSalary) || 0) + (Number(salaryForm.bonuses) || 0) + (Number(salaryForm.allowances) || 0) - (Number(salaryForm.deductions) || 0))} DA
            </span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" type="button" className="flex-1" onClick={() => setIsSalaryModalOpen(false)}>Annuler</Button>
            <Button type="submit" className="flex-1 bg-[#0274be] text-white">Valider & Imprimer Bulletin</Button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM ACTIONS PERMANENT DELETE GATEWAY */}
      <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="⚠️ Confirmation de Suppression Définitive ERP">
        <div className="space-y-4">
          <div className="flex gap-3 items-start text-xs border border-rose-200 bg-rose-50 p-4 rounded-xl text-rose-800 font-extrabold">
            <AlertCircle size={22} className="shrink-0 text-rose-600 animate-pulse" />
            <div>
              <p className="uppercase leading-tight">Cette action détruira définitivement les enregistrements.</p>
              <p className="mt-1 normal-case text-slate-600 font-medium">Les éléments détruits ne pourront plus être restaurés. Les tables de statistiques RH et fiscales seront recalculées sur le champ.</p>
            </div>
          </div>

          <p className="text-xs uppercase font-black text-slate-800">
            Cible : {deleteTarget?.name} ({deleteTarget?.type})
          </p>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 font-bold text-xs" onClick={() => setIsDeleteConfirmOpen(false)}>Abandonner</Button>
            <Button onClick={handleConfirmDelete} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase">
              Confirmer Deletion Définitive
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Employees;
