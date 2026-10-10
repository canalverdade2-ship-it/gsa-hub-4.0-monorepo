import { StyleSheet } from 'react-native';

export const COLORS = {
  primary: '#17345f',
  primaryDark: '#0d1f38',
  primaryLight: '#23497d',
  accent: '#0ea5e9',
  accentDark: '#0284c7',
  accentLight: '#e0f2fe',
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  info: '#6366f1',
  infoLight: '#e0e7ff',
  background: '#f8fafc',
  card: '#ffffff',
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
};

export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'R$ 0,00';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (isNaN(num)) return 'R$ 0,00';
  return 'R$ ' + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString).slice(0, 10);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateString);
  }
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch {
    return String(dateString);
  }
}

export function maskCPF(cpf: string | null | undefined): string {
  if (!cpf) return '-';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function maskCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return '-';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (clean.length === 10) {
    return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return phone;
}

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInput: {
    height: 44,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabsScroll: {
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 12,
  },
  tabButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomColor: COLORS.primary,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 6,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  btnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnOutlineText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  btnDanger: {
    backgroundColor: COLORS.danger,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDangerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  btnSuccess: {
    backgroundColor: COLORS.success,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSuccessText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  formInput: {
    minHeight: 44,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 8,
  },
});
